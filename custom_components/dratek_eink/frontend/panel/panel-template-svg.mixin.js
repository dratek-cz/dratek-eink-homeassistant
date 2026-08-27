// Native-SVG renderer for display templates.
//
// The previous approach cloned the live HTML preview into an <svg><foreignObject>
// and rasterized that. It depended on Home Assistant's shadow-DOM internals
// (ha-icon renders through a nested ha-svg-icon shadow root), on the panel's
// whole stylesheet resolving correctly inside the export, and on browser layout
// of HTML at a size it was never designed for. Every one of those was a source
// of "the sent image doesn't match the preview" bugs.
//
// Instead we build the template directly as a self-contained SVG document using
// only native SVG primitives (<text>, <path>, <rect>, <line>) laid out at the
// display's exact native resolution. Home Assistant values are substituted as
// plain strings, mdi icons are embedded as real path data, and nothing depends
// on external CSS or fonts beyond a generic sans-serif family. The same SVG is
// used for the on-screen preview and for the bitmap sent to the panel, so they
// are identical by construction.

import qrcode from "../qrcode-generator.js";
import { DISPLAY_TEMPLATES } from "./templates/index.js?v=release-0.1.348";
import { TRANSIT_KIND_ICONS } from "./templates/shared.js?v=transit-two-line-1";

const RED = "#e31b1b";
const YELLOW = "#f4c400";
const BLACK = "#000000";
const FONT = "Arial, Helvetica, sans-serif";
// Ten native device pixels are the practical lower limit for Czech diacritics
// and numerals on the supported e-ink panels. Preview scaling can make a 6–7 px
// font look acceptable on a monitor even though it becomes only a few broken
// dots after the physical panel's three-colour quantisation.
const MIN_READABLE_FONT_SIZE = 10;
// The backend refetches RainViewer at most every ten minutes (that is the real
// data's own refresh cadence - see meteoradar.py), so re-fetching a rendered
// PNG through the websocket more often than this just spends round trips on the
// same frame. Two minutes is a compromise: interactive editing (resizing the
// slot, switching templates) still sees a fresh-ish image without hammering the
// connection on every re-render tick.
const METEORADAR_CACHE_MS = 2 * 60 * 1000;
// A failed fetch (most commonly: camera.meteoradar does not exist yet because
// Home Assistant has not restarted since this integration was updated) retries
// far sooner than a success is cached for, so the map appears on its own shortly
// after the underlying cause clears instead of waiting out the full success TTL.
const METEORADAR_RETRY_MS = 15 * 1000;
// The map and its compact forecast sidebar are two
// separate blocks placed side by side, not one image letterboxed across
// both shapes - mirrors render.py's radar_sidebar_width exactly; both sides
// must move together or the two blocks stop lining up edge to edge.
const RADAR_SIDEBAR_MIN = 88;
const RADAR_SIDEBAR_MAX = 200;
const RADAR_SIDEBAR_FRACTION = 0.24;
const RADAR_FOOTER_MIN = 88;
const RADAR_FOOTER_MAX = 180;
const RADAR_FOOTER_FRACTION = 0.28;
// A safety net for the interactive preview only: if callWS never settles (a
// dropped connection with no error/close event, for instance) the pending
// flag it guards would otherwise never clear, permanently wedging the
// preview on its "loading" placeholder for the rest of the session - opening
// display settings again wouldn't help, since _requestTemplateRadarImage's
// own guard skips every future attempt while that flag is still (wrongly)
// true. The blocking send path (_preloadTemplateRadarImage) has no such
// flag to get stuck on, which is why a manual send always renders correctly
// even when the preview is stuck.
const METEORADAR_REQUEST_TIMEOUT_MS = 20 * 1000;
// transit.py caches a stop's board for 45 s, so asking more often than this
// only spends round trips on the same four rows. The departures print as
// "za 3 min" - relative to the moment they were fetched - so the panel must
// keep re-asking while the designer is open or the preview quietly drifts out
// of date, and a manual send would go out with minutes that already passed.
const TRANSIT_CACHE_MS = 60 * 1000;
// A failed fetch (the public timetable server is down or rate-limiting) retries
// well inside the success TTL, the same trade METEORADAR_RETRY_MS makes.
const TRANSIT_RETRY_MS = 20 * 1000;
const TRANSIT_REQUEST_TIMEOUT_MS = 20 * 1000;

// Advance width of one glyph as a fraction of the font size, per character class,
// measured off the Arial/Helvetica stack above.
//
// This was a single flat factor, and a flat factor is wrong in both directions at
// once: it under-measured an all-caps string by a fifth and over-measured a run of
// digits by the same. Shrink-to-fit believed "ZAPNUTO" fitted a 272 px panel when
// it was 15 px wider, and shrank "3 / 3 v pořádku" that did fit. Uppercase is
// detected by case-folding rather than a character range so Czech diacritics -
// Á, Č, Ř, Ž - are not mistaken for lowercase.
const glyphWidth = (character, bold) => {
  if (/[mwMW]/.test(character)) return bold ? 0.87 : 0.83;
  if (/[IJLT]/.test(character)) return bold ? 0.52 : 0.49;
  if (/[fijlrt]/.test(character)) return bold ? 0.32 : 0.27;
  if (/[0-9]/.test(character)) return 0.56;
  if (/[\s.,:;'`|!]/.test(character)) return 0.28;
  if (/[-–·/()[\]]/.test(character)) return 0.36;
  if (/[—%@]/.test(character)) return 0.95;
  if (character !== character.toLowerCase()) return bold ? 0.72 : 0.70;
  return bold ? 0.58 : 0.53;
};

// Where the stacked layout gives way to two columns. Above 4:3 - so 296x128,
// 250x128, 800x480, 1360x480 and the rest of the wide tags, but not the 4:3
// 400x300 and 1600x1200 panels, which have the height to stack comfortably.
const LANDSCAPE_ASPECT = 1.35;

// Resolved icon geometry is shared by every template, every preview slot and
// every panel instance, so it lives at module scope. A cache hung off the
// component was thrown away whenever the panel element was re-created, and the
// same handful of mdi icons then had to be resolved through ha-icon all over
// again - one visible blank-icon delay per visit to the designer.
const ICON_GEOMETRY = new Map();
const ICON_REQUESTS = new Map();
let TEMPLATE_ICONS_WARMED = false;

// Dithered weather-icon PNGs, keyed by "name:size:supportsYellow:night" -
// shared module-wide for the same reason ICON_GEOMETRY is: switching
// templates in the designer should draw from a warm cache, not re-rasterise
// and re-dither the same handful of condition icons on every visit.
const WEATHER_ICON_IMAGE_CACHE = new Map();
const WEATHER_ICON_IMAGE_REQUESTS = new Map();
const ICON_GEOMETRY_CACHE_LIMIT = 256;
const WEATHER_ICON_CACHE_LIMIT = 96;

// In-place Floyd-Steinberg error diffusion against an arbitrary small
// palette. Pixels below the alpha threshold are treated as fully
// transparent output (the icon's true silhouette); everything else is
// flattened onto white before its error is computed, since a colour cannot
// be diffused sensibly while still partially transparent.
// Only the achromatic parts (the cloud, rain, snow, the wind swoosh - all
// black) go through error diffusion at all. The sun/moon/lightning-bolt
// tint fills flat ink instead: it is meant to read as one bold, solid
// colour, not a shaded tone - the moon being a paler yellow than the sun in
// Home Assistant's own artwork is a *difference between two icons*, not
// something to represent as a lighter shade of the same icon the way the
// cloud's two grey tones are, so it skips the halftone treatment entirely.
// Which treatment a pixel gets is decided by its own saturation (read
// before any error is added, so drifting error can never itself flip a
// pixel from one family to the other): plain Euclidean RGB distance puts a
// *mid*-grey numerically closer to a red like (227,27,27) than to either
// black or white (red's high red channel and low green/blue land it nearer
// the midpoint than either extreme does), so an unrestricted nearest-colour
// search would dither a flat grey fill into stray red flecks with no red
// anywhere in the source - gating on saturation avoids that the same way it
// lets the warm fill skip dithering altogether. Port of quantize_bwr_
// dithered in svg_render.py.
function ditherToEinkPalette(imageData, ink) {
  const { data, width, height } = imageData;
  const SATURATION_THRESHOLD = 40;
  const nearestGrey = (r, g, b) => {
    let best = [0, 0, 0];
    let bestDistance = Infinity;
    for (const candidate of [[0, 0, 0], [255, 255, 255]]) {
      const dr = r - candidate[0];
      const dg = g - candidate[1];
      const db = b - candidate[2];
      const distance = dr * dr + dg * dg + db * db;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best;
  };
  // Diffused error lives in its own buffers rather than being folded
  // straight back into `data` (the more obvious approach): saturation has
  // to be read from each pixel's true original colour, and mutating `data`
  // in place would mean a pixel downstream of an already-diffused neighbour
  // reads *that* neighbour's drifted colour instead of its own - the same
  // family-flips-from-accumulated-error bug this whole restriction exists to
  // avoid. Only the current and next row are ever touched, so nothing older
  // needs keeping. A warm pixel neither reads nor contributes error, since
  // it is not being rounded at all.
  const zeroRow = () => new Float64Array(width * 3);
  let currentRowError = zeroRow();
  let nextRowError = zeroRow();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      if (data[index + 3] < 128) {
        data[index] = 255; data[index + 1] = 255; data[index + 2] = 255; data[index + 3] = 0;
        continue;
      }
      const sourceR = data[index], sourceG = data[index + 1], sourceB = data[index + 2];
      const saturation = Math.max(sourceR, sourceG, sourceB) - Math.min(sourceR, sourceG, sourceB);
      if (saturation > SATURATION_THRESHOLD) {
        data[index] = ink[0]; data[index + 1] = ink[1]; data[index + 2] = ink[2]; data[index + 3] = 255;
        continue;
      }
      const errorIndex = x * 3;
      const r = Math.min(255, Math.max(0, sourceR + currentRowError[errorIndex]));
      const g = Math.min(255, Math.max(0, sourceG + currentRowError[errorIndex + 1]));
      const b = Math.min(255, Math.max(0, sourceB + currentRowError[errorIndex + 2]));
      const [newR, newG, newB] = nearestGrey(r, g, b);
      data[index] = newR; data[index + 1] = newG; data[index + 2] = newB; data[index + 3] = 255;
      const errorR = r - newR, errorG = g - newG, errorB = b - newB;
      if (x + 1 < width) {
        const i = errorIndex + 3;
        currentRowError[i] += errorR * 7 / 16; currentRowError[i + 1] += errorG * 7 / 16; currentRowError[i + 2] += errorB * 7 / 16;
      }
      if (x > 0) {
        const i = errorIndex - 3;
        nextRowError[i] += errorR * 3 / 16; nextRowError[i + 1] += errorG * 3 / 16; nextRowError[i + 2] += errorB * 3 / 16;
      }
      nextRowError[errorIndex] += errorR * 5 / 16; nextRowError[errorIndex + 1] += errorG * 5 / 16; nextRowError[errorIndex + 2] += errorB * 5 / 16;
      if (x + 1 < width) {
        const i = errorIndex + 3;
        nextRowError[i] += errorR * 1 / 16; nextRowError[i + 1] += errorG * 1 / 16; nextRowError[i + 2] += errorB * 1 / 16;
      }
    }
    currentRowError = nextRowError;
    nextRowError = zeroRow();
  }
}

// Home Assistant's own weather glyphs, copied verbatim from its frontend
// (src/data/weather.ts - getWeatherStateSVG + weatherSVGStyles): same paths,
// same 17x17 viewBox, same fill colours. `_svgIcon` draws exactly these
// names - see WEATHER_ICON_TO_CONDITION below - as this real artwork rather
// than the generic flat MDI glyph every other icon in the app still uses.
// This vector markup is never sent to the panel directly, though: it is
// rasterised on an offscreen canvas and dithered (Floyd-Steinberg) to the
// e-ink palette by _prepareWeatherIconImage - the same "treat it as an image
// and convert it like one" path a camera snapshot goes through - since a
// flat threshold would erase the paler fills here (#f9f9f9 cloud-front,
// #fcf497 moon) outright.
const WEATHER_SUN_COLOR = "#fdd93c";
const WEATHER_MOON_COLOR = "#fcf497";
const WEATHER_CLOUD_BACK_COLOR = "#d4d4d4";
const WEATHER_CLOUD_FRONT_COLOR = "#f9f9f9";
const WEATHER_SNOW_FILL = "#f9f9f9";

const WEATHER_SUN_D ="m 14.39303,8.4033507 c 0,3.3114723 -2.684145,5.9956173 -5.9956169,5.9956173 -3.3114716,0 -5.9956168,-2.684145 -5.9956168,-5.9956173 0,-3.311471 2.6841452,-5.995617 5.9956168,-5.995617 3.3114719,0 5.9956169,2.684146 5.9956169,5.995617";
const WEATHER_MOON_D = "m 13.502891,11.382935 c -1.011285,1.859223 -2.976664,3.121381 -5.2405751,3.121381 -3.289929,0 -5.953329,-2.663833 -5.953329,-5.9537625 0,-2.263911 1.261724,-4.228856 3.120948,-5.240575 -0.452782,0.842738 -0.712753,1.806363 -0.712753,2.832381 0,3.289928 2.663833,5.9533275 5.9533291,5.9533275 1.026017,0 1.989641,-0.259969 2.83238,-0.712752";
const WEATHER_PARTLY_DISC_D = "m14.981 4.2112c0 1.9244-1.56 3.4844-3.484 3.4844-1.9244 0-3.4844-1.56-3.4844-3.4844s1.56-3.484 3.4844-3.484c1.924 0 3.484 1.5596 3.484 3.484";
const WEATHER_CLOUD_BACK_D = "m3.8863 5.035c-0.54892 0.16898-1.04 0.46637-1.4372 0.8636-0.63077 0.63041-1.0206 1.4933-1.0206 2.455 0 1.9251 1.5589 3.4682 3.4837 3.4682h6.9688c1.9251 0 3.484-1.5981 3.484-3.5232 0-1.9251-1.5589-3.5232-3.484-3.5232h-1.0834c-0.25294-1.6916-1.6986-2.9083-3.4463-2.9083-1.7995 0-3.2805 1.4153-3.465 3.1679";
const WEATHER_CLOUD_FRONT_D = "m4.1996 7.6995c-0.33902 0.10407-0.64276 0.28787-0.88794 0.5334-0.39017 0.38982-0.63147 0.92322-0.63147 1.5176 0 1.1896 0.96414 2.1431 2.1537 2.1431h4.3071c1.1896 0 2.153-0.98742 2.153-2.1777 0-1.1896-0.96344-2.1777-2.153-2.1777h-0.66992c-0.15593-1.0449-1.0499-1.7974-2.1297-1.7974-1.112 0-2.0274 0.87524-2.1417 1.9586";
const WEATHER_RAIN_D = [
  "m5.2852 14.734c-0.22401 0.24765-0.57115 0.2988-0.77505 0.11395-0.20391-0.1845-0.18732-0.53481 0.036689-0.78281 0.14817-0.16298 0.59126-0.32914 0.87559-0.42369 0.12453-0.04092 0.22684 0.05186 0.19791 0.17956-0.065617 0.2921-0.18732 0.74965-0.33514 0.91299",
  "m11.257 14.163c-0.22437 0.24765-0.57115 0.2988-0.77505 0.11395-0.2039-0.1845-0.18768-0.53481 0.03669-0.78281 0.14817-0.16298 0.59126-0.32914 0.8756-0.42369 0.12453-0.04092 0.22684 0.05186 0.19791 0.17956-0.06562 0.2921-0.18732 0.74965-0.33514 0.91299",
  "m8.432 15.878c-0.15452 0.17039-0.3937 0.20567-0.53446 0.07867-0.14041-0.12735-0.12876-0.36865 0.025753-0.53975 0.10195-0.11218 0.40711-0.22684 0.60325-0.29175 0.085725-0.02858 0.15628 0.03563 0.13652 0.12382-0.045508 0.20108-0.12912 0.51647-0.23107 0.629",
  "m7.9991 14.118c-0.19226 0.21237-0.49001 0.25612-0.66499 0.09737-0.17462-0.15804-0.16051-0.45861 0.03175-0.67098 0.12665-0.14005 0.50729-0.28293 0.75071-0.36336 0.10689-0.03563 0.19473 0.0441 0.17004 0.15346-0.056092 0.25082-0.16051 0.64347-0.28751 0.78352",
];
const WEATHER_POURING_EXTRA_D = [
  "m10.648 16.448c-0.19226 0.21449-0.49001 0.25894-0.66499 0.09878-0.17498-0.16016-0.16087-0.4639 0.03175-0.67874 0.12665-0.14146 0.50694-0.2854 0.75071-0.36724 0.10689-0.03563 0.19473 0.0448 0.17004 0.15558-0.05645 0.25365-0.16051 0.65017-0.28751 0.79163",
  "m5.9383 16.658c-0.22437 0.25012-0.5715 0.30162-0.77505 0.11501-0.20391-0.18627-0.18768-0.54046 0.036689-0.79093 0.14817-0.1651 0.59126-0.33267 0.87559-0.42827 0.12418-0.04127 0.22648 0.05221 0.19791 0.18168-0.065617 0.29528-0.18732 0.75741-0.33514 0.92251",
];
const WEATHER_WIND_D = [
  "m 13.59616,15.30968 c 0,0 -0.09137,-0.0071 -0.250472,-0.0187 -0.158045,-0.01235 -0.381353,-0.02893 -0.64382,-0.05715 -0.262466,-0.02716 -0.564444,-0.06385 -0.877358,-0.124531 -0.156986,-0.03034 -0.315383,-0.06844 -0.473781,-0.111478 -0.157691,-0.04551 -0.313266,-0.09842 -0.463902,-0.161219 l -0.267406,-0.0949 c -0.09984,-0.02646 -0.205669,-0.04904 -0.305153,-0.06738 -0.193322,-0.02716 -0.3838218,-0.03316 -0.5640912,-0.02011 -0.3626556,0.02611 -0.6847417,0.119239 -0.94615,0.226483 -0.2617611,0.108656 -0.4642556,0.230364 -0.600075,0.324203 -0.1358195,0.09419 -0.2049639,0.160514 -0.2049639,0.160514 0,0 0.089958,-0.01623 0.24765,-0.04445 0.1559278,-0.02575 0.3764139,-0.06174 0.6367639,-0.08714 0.2596444,-0.02646 0.5591527,-0.0441 0.8678333,-0.02328 0.076905,0.0035 0.1538111,0.01658 0.2321278,0.02293 0.077611,0.01058 0.1534581,0.02893 0.2314221,0.04022 0.07267,0.01834 0.1397,0.03986 0.213078,0.05644 l 0.238125,0.08925 c 0.09207,0.03281 0.183444,0.07055 0.275872,0.09878 0.09243,0.0261 0.185208,0.05327 0.277636,0.07161 0.184856,0.0388 0.367947,0.06174 0.543983,0.0702 0.353131,0.01905 0.678745,-0.01341 0.951442,-0.06456 0.27305,-0.05292 0.494595,-0.123119 0.646642,-0.181681 0.152047,-0.05785 0.234597,-0.104069 0.234597,-0.104069",
  "m 4.7519154,13.905801 c 0,0 0.091369,-0.0032 0.2511778,-0.0092 0.1580444,-0.0064 0.3820583,-0.01446 0.6455833,-0.03281 0.2631722,-0.01729 0.5662083,-0.04269 0.8812389,-0.09137 0.1576916,-0.02434 0.3175,-0.05609 0.4776611,-0.09384 0.1591027,-0.03951 0.3167944,-0.08643 0.4699,-0.14358 l 0.2702277,-0.08467 c 0.1008945,-0.02222 0.2074334,-0.04127 0.3072695,-0.05574 0.1943805,-0.01976 0.3848805,-0.0187 0.5651499,0.0014 0.3608917,0.03951 0.67945,0.144639 0.936625,0.261761 0.2575278,0.118534 0.4554364,0.247297 0.5873754,0.346781 0.132291,0.09913 0.198966,0.168275 0.198966,0.168275 0,0 -0.08925,-0.01976 -0.245886,-0.05397 C 9.9423347,14.087088 9.7232597,14.042988 9.4639681,14.00736 9.2057347,13.97173 8.9072848,13.94245 8.5978986,13.95162 c -0.077258,7.06e-4 -0.1541638,0.01058 -0.2328333,0.01411 -0.077964,0.0078 -0.1545166,0.02328 -0.2331861,0.03175 -0.073025,0.01588 -0.1404055,0.03422 -0.2141361,0.04798 l -0.2420055,0.08008 c -0.093486,0.02963 -0.1859139,0.06421 -0.2794,0.0889 C 7.3028516,14.23666 7.2093653,14.2603 7.116232,14.27512 6.9303181,14.30722 6.7465209,14.3231 6.5697792,14.32486 6.2166487,14.33046 5.8924459,14.28605 5.6218654,14.224318 5.3505793,14.161565 5.1318571,14.082895 4.9822793,14.01869 4.8327015,13.95519 4.7519154,13.905801 4.7519154,13.905801",
];
const WEATHER_SNOW_D = [
  "m 8.4319893,15.348341 c 0,0.257881 -0.209197,0.467079 -0.467078,0.467079 -0.258586,0 -0.46743,-0.209198 -0.46743,-0.467079 0,-0.258233 0.208844,-0.467431 0.46743,-0.467431 0.257881,0 0.467078,0.209198 0.467078,0.467431",
  "m 11.263878,14.358553 c 0,0.364067 -0.295275,0.659694 -0.659695,0.659694 -0.364419,0 -0.6596937,-0.295627 -0.6596937,-0.659694 0,-0.364419 0.2952747,-0.659694 0.6596937,-0.659694 0.36442,0 0.659695,0.295275 0.659695,0.659694",
  "m 5.3252173,13.69847 c 0,0.364419 -0.295275,0.660047 -0.659695,0.660047 -0.364067,0 -0.659694,-0.295628 -0.659694,-0.660047 0,-0.364067 0.295627,-0.659694 0.659694,-0.659694 0.36442,0 0.659695,0.295627 0.659695,0.659694",
];
const WEATHER_LIGHTNING_D = "m 9.9252695,10.935875 -1.6483986,2.341014 1.1170184,0.05929 -1.2169864,2.02141 3.0450261,-2.616159 H 9.8864918 L 10.97937,11.294651 10.700323,10.79794 h -0.508706 l -0.2663475,0.137936";

// Condition-name sets, copied from cloudyStates/rainStates/windyStates/
// snowyStates/lightningStates in weather.ts - Home Assistant's own internal
// `weather.*` condition strings, not the panel's `weather-*` glyph names.
const WEATHER_CLOUDY_STATES = new Set([
  "partlycloudy", "cloudy", "fog", "windy", "windy-variant", "hail", "rainy",
  "snowy", "snowy-rainy", "pouring", "lightning", "lightning-rainy",
]);
const WEATHER_RAIN_STATES = new Set(["hail", "rainy", "pouring", "lightning-rainy"]);
const WEATHER_WINDY_STATES = new Set(["windy", "windy-variant"]);
const WEATHER_SNOWY_STATES = new Set(["snowy", "snowy-rainy"]);
const WEATHER_LIGHTNING_STATES = new Set(["lightning", "lightning-rainy"]);

// The panel's `weather-*` icon glyph name for each condition (see
// `_weatherConditionIcon` below and its mirror `_WEATHER_CONDITION_ICON_NAMES`
// in render.py), inverted so `_svgIcon` can gate on the glyph name every
// other icon call already uses and still know which condition to compose.
const WEATHER_ICON_TO_CONDITION = new Map([
  ["weather-night", "clear-night"],
  ["weather-cloudy", "cloudy"],
  ["weather-fog", "fog"],
  ["weather-hail", "hail"],
  ["weather-lightning", "lightning"],
  ["weather-lightning-rainy", "lightning-rainy"],
  ["weather-partly-cloudy", "partlycloudy"],
  ["weather-pouring", "pouring"],
  ["weather-rainy", "rainy"],
  ["weather-snowy", "snowy"],
  ["weather-snowy-rainy", "snowy-rainy"],
  ["weather-sunny", "sunny"],
  ["weather-windy", "windy"],
]);

export const templateSvgMixin = {
  // ---------------------------------------------------------------- icons ---

  // Icon geometry, resolved once per icon name by letting Home Assistant's own
  // ha-icon render off-screen and copying whatever it drew. We copy the entire
  // inner SVG rather than hunting for a single <path>, so it works regardless of
  // how the icon is structured internally. Falls back to nothing rendered so a
  // missing icon never breaks the layout.
  _mdiIconPath(name) {
    if (ICON_GEOMETRY.has(name)) return Promise.resolve(ICON_GEOMETRY.get(name));
    let request = ICON_REQUESTS.get(name);
    if (!request) {
      request = this._resolveMdiIcon(name)
        .catch(() => null)
        .then((resolved) => {
          ICON_REQUESTS.delete(name);
          // Only a hit is worth remembering. A miss almost always means Home
          // Assistant had not finished loading its icon chunk yet, and caching
          // that used to freeze the icon out of every later render for good.
          if (resolved) {
            ICON_GEOMETRY.set(name, resolved);
            if (ICON_GEOMETRY.size > ICON_GEOMETRY_CACHE_LIMIT) {
              ICON_GEOMETRY.delete(ICON_GEOMETRY.keys().next().value);
            }
          }
          return resolved;
        });
      // Sharing the promise matters as much as the cache does: two preview slots
      // asking for the same icon used to mount two ha-icons and run two polling
      // loops for one answer.
      ICON_REQUESTS.set(name, request);
    }
    return request;
  },

  async _resolveMdiIcon(name) {
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:24px;height:24px;opacity:0;pointer-events:none";
    const icon = document.createElement("ha-icon");
    icon.setAttribute("icon", `mdi:${name}`);
    host.appendChild(icon);
    (this.shadowRoot || document.body).appendChild(host);

    try {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const svg = this._findRenderedIconSvg(icon.shadowRoot) || this._findRenderedIconSvg(icon);
        // Wait for something drawable, not merely for a non-empty <svg>.
        //
        // Home Assistant's ha-icon renders an <ha-svg-icon>, which renders
        // <svg><g>…</g></svg> through Lit. The <svg> and its <g> exist from the
        // first frame; the <path> only appears once the mdi chunk has loaded.
        // Treating any non-empty innerHTML as success therefore captured an empty
        // group, cached it as a hit and never retried - so whichever icons lost
        // that race stayed blank for the whole session. The weather template asks
        // for five icons out of one chunk and lost it every time, which is why it
        // showed none while the house showed its own.
        if (svg) {
          return {
            // Lit leaves comment markers behind; they serialise into the exported
            // SVG for no benefit.
            inner: svg.innerHTML.replace(/<!--[\s\S]*?-->/g, "").trim(),
            viewBox: svg.getAttribute("viewBox") || "0 0 24 24",
          };
        }
        // ha-icon fills its shadow root while painting a frame, so waking on the
        // next frame sees the geometry the moment it exists rather than up to a
        // fixed 50 ms later. The timer is the fallback for a backgrounded tab,
        // where animation frames stop arriving at all.
        await new Promise((resolve) => {
          requestAnimationFrame(resolve);
          setTimeout(resolve, 50);
        });
      }
    } finally {
      host.remove();
    }
    return null;
  },

  // Every block kind that can carry icons has to be walked here. _svgIcon draws
  // only what this preloaded, so a cell kind missing from this list renders as a
  // silent hole in the layout rather than as an error.
  // Weather condition glyphs (WEATHER_ICON_TO_CONDITION) are excluded: they
  // draw from vendored Home Assistant path data, not a resolved ha-icon, so
  // there is nothing here for _preloadTemplateIcons/_warmTemplateIcons/
  // _requestTemplateIcons to fetch or wait on for them.
  _templateIconNames(rows) {
    const names = new Set();
    const cells = (list) => (list || []).forEach((cell) => cell?.icon && !WEATHER_ICON_TO_CONDITION.has(cell.icon) && names.add(cell.icon));
    const walk = (row) => {
      if (!row) return;
      if (row.icon && !WEATHER_ICON_TO_CONDITION.has(row.icon)) names.add(row.icon);
      if (row.band?.icon && !WEATHER_ICON_TO_CONDITION.has(row.band.icon)) names.add(row.band.icon);
      if (row.stat?.icon && !WEATHER_ICON_TO_CONDITION.has(row.stat.icon)) names.add(row.stat.icon);
      cells(row.footer);
      cells(row.list);
      cells(row.grid);
      cells(row.strip);
      cells(row.split);
      cells(row.board);
      cells(row.steps);
      cells(row.meters);
      cells(row.checklist);
      if (row.duo) {
        walk(row.duo.left);
        walk(row.duo.right);
      }
    };
    rows.forEach(walk);
    return [...names];
  },

  async _preloadTemplateIcons(rows) {
    await Promise.all(this._templateIconNames(rows).map((name) => this._mdiIconPath(name)));
  },

  _templateNeedsRadarImage(rows) {
    return (rows || []).some((row) => row?.radarMap);
  },

  // The info sidebar's own width, given the full radarMap block's width -
  // mirrors render.py's radar_sidebar_width exactly (see that function's own
  // comment for why both sides must move together).
  _radarSidebarWidth(totalWidth) {
    const raw = Math.max(RADAR_SIDEBAR_MIN, Math.min(RADAR_SIDEBAR_MAX, Math.round(totalWidth * RADAR_SIDEBAR_FRACTION)));
    return Math.min(raw, Math.max(1, totalWidth - 60));
  },

  _radarBlockLayout(width, height) {
    if (height > width) {
      const raw = Math.max(RADAR_FOOTER_MIN, Math.min(RADAR_FOOTER_MAX, Math.round(height * RADAR_FOOTER_FRACTION)));
      const minimumForecastH = Math.min(raw, Math.max(1, Math.round(height) - 60));
      const mapH = Math.max(1, Math.min(
        Math.round(height) - minimumForecastH,
        Math.round(width * 1.05),
      ));
      const forecastH = Math.max(1, Math.round(height) - mapH);
      return {
        portrait: true,
        mapW: Math.max(1, Math.round(width)),
        mapH,
        forecastW: Math.max(1, Math.round(width)),
        forecastH,
      };
    }
    const forecastW = this._radarSidebarWidth(width);
    return {
      portrait: false,
      mapW: Math.max(1, Math.round(width) - forecastW),
      mapH: Math.max(1, Math.round(height)),
      forecastW,
      forecastH: Math.max(1, Math.round(height)),
    };
  },

  // Fetches (or reuses a cached) rendered radar map and its info sidebar, each
  // at its own block's exact size - two separate images placed side by side
  // (see _blockRadarMap), not one image letterboxed across both shapes.
  //
  // A failure is cached too, distinctly from "never tried yet" - the most common
  // cause is camera.meteoradar not existing until Home Assistant restarts after
  // an update, and silently leaving the "Loading…" placeholder up forever gave
  // no hint that anything had actually gone wrong. Failures retry sooner than a
  // successful fetch's own cache lifetime, so the map appears on its own shortly
  // after the underlying cause (usually that restart) is resolved.
  async _ensureTemplateRadarImage(width, height) {
    const country = this._meteoradarCountry || this._displayTemplateConfig?.meteoradar_country || "cz";
    const showPrecipitation = this._displayTemplateConfig?.meteoradar_show_precipitation !== false;
    const showWind = this._displayTemplateConfig?.meteoradar_show_wind === true;
    const preserveYellow = this._displaySupportsYellow?.() === true;
    const layout = this._radarBlockLayout(width, height);
    const { mapW, mapH, forecastW, forecastH } = layout;

    const key = `${layout.portrait ? "portrait" : "landscape"}_${mapW}x${mapH}_${forecastW}x${forecastH}_${country}_p${showPrecipitation}_w${showWind}_y${preserveYellow}`;
    const cached = this._meteoradarImageCache;
    const age = cached ? Date.now() - cached.fetchedAt : Infinity;
    const ttl = cached?.dataUrl ? METEORADAR_CACHE_MS : METEORADAR_RETRY_MS;
    if (cached && cached.key === key && age < ttl) return false;
    if (!this._hass?.callWS) return false;
    try {
      const result = await this._hass.callWS({
        type: "dratek_eink/render_meteoradar",
        width: mapW,
        height: mapH,
        sidebar_width: forecastW,
        sidebar_height: forecastH,
        country: country,
        show_precipitation: showPrecipitation,
        show_wind: showWind,
        preserve_yellow: preserveYellow,
      });
      if (!result?.ok || !result?.image) {
        this._meteoradarImageCache = { key, dataUrl: "", sidebarDataUrl: "", fetchedAt: Date.now(), error: "Server nevrátil obrázek." };
        return true;
      }
      this._meteoradarImageCache = {
        key, dataUrl: result.image, sidebarDataUrl: result.sidebar_image || "", fetchedAt: Date.now(), error: "",
      };
      return true;
    } catch (error) {
      this._meteoradarImageCache = { key, dataUrl: "", sidebarDataUrl: "", fetchedAt: Date.now(), error: this._message?.(error) || String(error?.message || error) };
      return true;
    }
  },

  // The blocking counterpart used by the export path: a manual send must never
  // go out with a stale or missing map, so it waits for the fetch instead of
  // drawing the placeholder used during interactive editing.
  async _preloadTemplateRadarImage(rows, width, height) {
    if (!this._templateNeedsRadarImage(rows)) return;
    await this._ensureTemplateRadarImage(width, height);
  },

  // Non-blocking counterpart for the live on-screen preview, matching how
  // _requestTemplateIcons keeps icon loading off the render path.
  _requestTemplateRadarImage(rows, width, height) {
    if (!this._templateNeedsRadarImage(rows) || this._radarImageRequestPending) return;
    this._radarImageRequestPending = true;
    let settled = false;
    const clearPending = () => {
      if (settled) return;
      settled = true;
      this._radarImageRequestPending = false;
    };
    // If callWS itself never resolves or rejects, this timeout still frees the
    // guard AND schedules a repaint - which is what actually gets a fresh
    // attempt going again, since nothing else re-runs _requestTemplateRadarImage
    // on its own once the preview has already been drawn once.
    const watchdog = setTimeout(() => {
      clearPending();
      this._scheduleTemplateIconRepaint();
    }, METEORADAR_REQUEST_TIMEOUT_MS);
    this._ensureTemplateRadarImage(width, height)
      .then((changed) => {
        clearTimeout(watchdog);
        clearPending();
        if (changed) this._scheduleTemplateIconRepaint();
      })
      .catch(() => {
        clearTimeout(watchdog);
        clearPending();
      });
  },

  // ------------------------------------------------------- transit board ---

  // A departures row draws live data that arrives over the websocket, exactly
  // like the radar map above - so it gets the same three entry points: an
  // `_ensure` that owns the cache, a non-blocking `_request` for the
  // interactive preview and a blocking `_preload` for the send path.
  _templateNeedsTransitBoard(rows) {
    return (rows || []).some((row) => row?.group === "transport-board" && Array.isArray(row?.board));
  },

  // Fetches (or reuses) the configured stop's board. Returns true when the
  // cache changed and the caller should repaint.
  //
  // The board used to live only in _transitPreview, written the one time the
  // user picked a stop in the settings dialog. Nothing rebuilt it afterwards,
  // so every later visit to that display - a page reload, switching to another
  // display and back - found it empty and transport.js fell through to its
  // sample rows: the header named the real stop while the four departures
  // underneath read Centrum/Univerzita/Nemocnice/Depo, and a manual send put
  // exactly that on the panel.
  async _ensureTemplateTransitBoard() {
    const stopId = String(this._displayTemplateConfig?.transit_stop_id || "").trim();
    if (!stopId) return false;
    const cached = this._transitPreview;
    const age = cached?.fetched_at ? Date.now() - cached.fetched_at : Infinity;
    const ttl = Array.isArray(cached?.departures) && cached.departures.length ? TRANSIT_CACHE_MS : TRANSIT_RETRY_MS;
    if (cached?.stop_id === stopId && age < ttl) return false;
    if (!this._hass?.callWS) return false;
    try {
      const response = await this._hass.callWS({
        type: "dratek_eink/transit/departures", stop_id: stopId, limit: 4,
      });
      this._transitPreview = {
        ...response,
        stop_id: stopId,
        stop_name: response?.stop_name || this._displayTemplateConfig?.transit_stop_name || "",
        fetched_at: Date.now(),
      };
      return true;
    } catch (_error) {
      // Cached as a failure rather than left unset, so the retry is paced by
      // TRANSIT_RETRY_MS instead of firing again on every single repaint. The
      // last good board (if there is one for this stop) is deliberately kept:
      // four slightly stale departures still say more than four invented ones.
      if (cached?.stop_id !== stopId) {
        this._transitPreview = { stop_id: stopId, stop_name: "", departures: [], fetched_at: Date.now() };
      } else {
        this._transitPreview = { ...cached, fetched_at: Date.now() };
      }
      return false;
    }
  },

  // Every vehicle glyph's raw path data, keyed by transit.py's `kind`.
  //
  // svg_blocks.py draws an MDI glyph from path data because it has no ha-icon to
  // resolve a name with, so the automation binding has to carry the geometry the
  // browser resolved. Sent for every kind rather than the ones on the board
  // right now: the whole point of an automatic refresh is that the mix changes.
  //
  // ICON_GEOMETRY entries wrap one <path> in a 24x24 viewBox (see
  // _resolveMdiIcon), which is exactly what svg_blocks.icon rebuilds, so only
  // the `d` attribute has to travel. A glyph that has not resolved yet is left
  // out, and the backend then draws no glyph for that kind - the same thing the
  // panel does with a name it never resolved.
  _transitKindIconPaths() {
    const paths = {};
    for (const [kind, name] of Object.entries(TRANSIT_KIND_ICONS)) {
      const geometry = ICON_GEOMETRY.get(name);
      const d = /\sd="([^"]+)"/.exec(geometry?.inner || "");
      if (d) paths[kind] = d[1];
    }
    return paths;
  },

  // Resolves every vehicle glyph, not only the ones the board is showing. The
  // automation capture records all of them (see _transitKindIconPaths), and a
  // capture is taken from whatever happens to be on screen at the time.
  async _preloadTransitKindIcons() {
    await Promise.all(
      Object.values(TRANSIT_KIND_ICONS).map((name) => this._mdiIconPath(name)),
    );
  },

  // The blocking counterpart: a manual send must never go out with the sample
  // departures baked into it.
  async _preloadTemplateTransitBoard(rows) {
    if (!this._templateNeedsTransitBoard(rows)) return;
    await this._preloadTransitKindIcons();
    await this._ensureTemplateTransitBoard();
  },

  // Non-blocking counterpart for the live preview, guarded and watchdogged the
  // same way _requestTemplateRadarImage is.
  _requestTemplateTransitBoard(rows) {
    if (!this._templateNeedsTransitBoard(rows) || this._transitBoardRequestPending) return;
    if (!String(this._displayTemplateConfig?.transit_stop_id || "").trim()) return;
    this._preloadTransitKindIcons();
    this._transitBoardRequestPending = true;
    let settled = false;
    const clearPending = () => {
      if (settled) return;
      settled = true;
      this._transitBoardRequestPending = false;
    };
    const watchdog = setTimeout(() => {
      clearPending();
      this._scheduleTemplateIconRepaint();
    }, TRANSIT_REQUEST_TIMEOUT_MS);
    this._ensureTemplateTransitBoard()
      .then((changed) => {
        clearTimeout(watchdog);
        clearPending();
        if (changed) this._scheduleTemplateIconRepaint();
      })
      .catch(() => {
        clearTimeout(watchdog);
        clearPending();
      });
  },

  // Kick off whatever this template still needs, without blocking the render.
  // A single "preload in progress" flag used to guard this, and because the
  // preview slots render one after another the second slot skipped its own
  // preload entirely and only started once the first had finished - two full
  // rounds of icon loading, plus a re-render each, for one drawing. Tracking
  // requests per icon lets every slot queue in the same round.
  _requestTemplateIcons(rows) {
    const missing = this._templateIconNames(rows).filter((name) => !ICON_GEOMETRY.has(name));
    if (!missing.length) return;
    Promise.all(missing.map((name) => this._mdiIconPath(name))).then((resolved) => {
      if (resolved.some(Boolean)) this._scheduleTemplateIconRepaint();
    });
  },

  // Icons land one batch at a time; repainting on a timeout collapses a burst of
  // arrivals into a single pass over the panel instead of one per icon.
  _scheduleTemplateIconRepaint() {
    if (this._templateIconRepaintPending) return;
    this._templateIconRepaintPending = true;
    setTimeout(() => {
      this._templateIconRepaintPending = false;
      this._render();
      this._paint();
    }, 0);
  },

  // Every template draws from the same small set of mdi icons, so resolve the
  // whole set once in the background after the first preview. Switching template
  // in the designer then draws from a warm cache and its icons are there on the
  // first frame, instead of appearing a beat after the rest of the layout.
  _warmTemplateIcons() {
    if (TEMPLATE_ICONS_WARMED) return;
    TEMPLATE_ICONS_WARMED = true;
    const names = new Set();
    for (const id of Object.keys(this._templateSvgSpecs({}))) {
      this._templateIconNames(this._templateSvgRows({ id })).forEach((name) => names.add(name));
    }
    const pending = [...names].filter((name) => !ICON_GEOMETRY.has(name));
    if (!pending.length) return;
    const warm = async () => {
      // In chunks, so warming the cache never mounts sixty off-screen ha-icons
      // in one go while the user is interacting with the designer.
      for (let index = 0; index < pending.length; index += 8) {
        await Promise.all(pending.slice(index, index + 8).map((name) => this._mdiIconPath(name)));
      }
      this._scheduleTemplateIconRepaint();
    };
    (window.requestIdleCallback || ((callback) => setTimeout(callback, 300)))(warm);
  },

  // The on-screen preview has to be the very markup that gets rasterized and
  // sent. It used to be a separate HTML rendering laid out by CSS inside a
  // foreignObject, so preview and panel were two different drawings of the same
  // template and could not agree. Icons resolve asynchronously through ha-icon,
  // so return whatever is cached now and re-render once the rest arrive.
  _templateBaseDefinition(template) {
    if (!template?.base_template_id) return template;
    return this._displayTemplateCards?.().find((item) => item.id === template.base_template_id) || template;
  },

  _templateAdjustmentsForRender(template) {
    if (!template) return {};
    if (String(this._selectedDisplayTemplateId || "") === String(template.id || "")) return this._templateElementAdjustments || {};
    return template.element_adjustments || this._templateEditorStates?.[template.id]?.element_adjustments || {};
  },

  _applyTemplateAdjustmentsToSvgMarkup(markup, template, slot = "primary") {
    const adjustments = this._templateAdjustmentsForRender(template);
    if (!markup || !Object.keys(adjustments || {}).length || typeof DOMParser === "undefined") return markup;
    try {
      const documentNode = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg"><g id="template-adjustment-root">${markup}</g></svg>`, "image/svg+xml");
      const root = documentNode.getElementById("template-adjustment-root");
      if (!root) return markup;
      const baseId = template?.base_template_id || template?.id || "";
      const templateId = template?.id || baseId;
      const entries = [...root.children].map((element, index) => {
        const adjustment = adjustments[`${slot}:${templateId}:${index}`] || adjustments[`${slot}:${baseId}:${index}`] || {};
        const x = Number(adjustment.x || 0), y = Number(adjustment.y || 0);
        const scale = Math.max(.2, Math.min(3, Number(adjustment.scale ?? 1)));
        const rotation = Number(adjustment.rotation || 0);
        const cx = Number(adjustment.baseX || 0) + Number(adjustment.baseWidth || 0) / 2;
        const cy = Number(adjustment.baseY || 0) + Number(adjustment.baseHeight || 0) / 2;
        if (adjustment.hidden) element.remove();
        else if (x || y || rotation || scale !== 1) {
          const original = element.getAttribute("transform") || "";
          element.setAttribute("transform", `${original} translate(${x} ${y}) translate(${cx} ${cy}) rotate(${rotation}) scale(${scale}) translate(${-cx} ${-cy})`.trim());
        }
        const color = { black: "#111111", red: "#d71912", yellow: this._displaySupportsYellow?.() ? "#f4c400" : "#d71912", white: "#ffffff" }[adjustment.color];
        if (color && element.isConnected) {
          [element, ...element.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon,text")].forEach((node) => {
            const fill = node.getAttribute("fill"), stroke = node.getAttribute("stroke");
            if (fill && fill !== "none" && !["#fff", "#ffffff", "white"].includes(fill.toLowerCase())) node.setAttribute("fill", color);
            if (stroke && stroke !== "none" && !["#fff", "#ffffff", "white"].includes(stroke.toLowerCase())) node.setAttribute("stroke", color);
          });
        }
        return { element, order: Number(adjustment.order || 0), index };
      });
      entries.filter(({ element }) => element.isConnected).sort((a, b) => a.order - b.order || a.index - b.index).forEach(({ element }) => root.appendChild(element));
      const serializer = new XMLSerializer();
      return [...root.children].map((element) => serializer.serializeToString(element)).join("");
    } catch (_error) {
      return markup;
    }
  },

  _templateSvgPreviewMarkup(template, width, height) {
    if (!template) return "";
    // The catalog may decorate the "create" tile, but the actual designer and
    // exported image must start as a completely white canvas.
    if (template.id === "blank") return "";
    if (template.user_created) {
      // A from-scratch template has no base_template_id and must stay a blank
      // canvas behind its own elements. Also treat a base_template_id that
      // does not resolve to a real, distinct catalog template (stale id from
      // a removed/renumbered prepared template, or a literal "blank") as "no
      // base" - otherwise _templateBaseDefinition's own fallback silently
      // draws an unrelated prepared template's artwork behind the user's
      // design instead of nothing.
      const resolvedBase = template.base_template_id ? this._templateBaseDefinition(template) : null;
      if (!resolvedBase || resolvedBase === template || resolvedBase.id === "blank") return "";
    }
    const baseTemplate = this._templateBaseDefinition(template);
    const rows = this._templateSvgRows(baseTemplate, width, height);
    this._requestTemplateIcons(rows);
    this._requestTemplateRadarImage(rows, width, height);
    this._requestTemplateTransitBoard(rows);
    this._warmTemplateIcons();
    // Weather icons are not in ICON_GEOMETRY (they never go through ha-icon
    // at all - see _templateIconNames), so _templateSvgThumbnail's own
    // "is every icon resolved yet" check below could not see them and cached
    // whatever this pass drew even when a weather-* row's async raster+dither
    // hadn't landed yet, permanently freezing the catalog tile on a blank
    // icon. Reset here and let _svgWeatherIcon clear it on any cache miss,
    // so the caching decision reflects what this specific pass actually drew.
    this._templateAllWeatherIconsResolved = true;
    return this._applyTemplateAdjustmentsToSvgMarkup(this._layoutTemplateSvg(rows, width, height), template);
  },

  // Wrapped as a standalone <svg> so it can sit inside the preview's
  // foreignObject and still scale with the slot. This is the on-screen copy only;
  // what the panel receives is built by _buildDisplayTemplateSvg at the display's
  // native resolution, so nothing here has to survive being cloned or serialised.
  _templateSvgPreviewBody(template, width, height) {
    const markup = this._templateSvgPreviewMarkup(template, width, height);
    if (!markup) return "";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"`
      + ` viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">`
      + `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>`
      + `<g class="tpl">${markup}</g>`
      + `</svg>`;
  },

  // The catalog tile is a fixed box, so the panel letterboxes inside it rather
  // than stretching to fill it. A blank template stays blank here as well.
  _templateSvgThumbnail(template, width, height) {
    const cacheKey = `${template?.id || "blank"}:${Math.round(width)}x${Math.round(height)}:${this._displayPaletteKey?.() || "bwr"}`;
    this._templateThumbnailMarkupCache ||= new Map();
    const cached = this._templateThumbnailMarkupCache.get(cacheKey);
    if (cached) return cached;
    const markup = this._templateSvgPreviewMarkup(template, width, height);
    const thumbnail = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"`
      + ` viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">`
      + `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>`
      + markup
      + `</svg>`;
    const rows = template ? this._templateSvgRows(this._templateBaseDefinition(template), width, height) : [];
    if (
      template?.id !== "custom_image" && !template?.user_created
      && !this._templateIconNames(rows).some((name) => !ICON_GEOMETRY.has(name))
      && this._templateAllWeatherIconsResolved !== false
      // Same trap the weather icons above fell into: the radar map arrives
      // asynchronously, so the very first pass draws the "Načítám radarovou
      // mapu…" placeholder. Caching that froze the Meteoradar catalog tile on
      // the placeholder for the rest of the session - the map only ever
      // appeared if something else happened to evict the entry. Keep
      // re-rendering until the map is actually in hand.
      && !(this._templateNeedsRadarImage(rows) && !this._meteoradarImageCache?.dataUrl)
      // The brand logo falls into exactly the same trap: its bitmap is dithered
      // asynchronously, so the first pass draws a blank panel, and caching that
      // would freeze the catalog tile empty for the rest of the session.
      && !(rows.some((row) => row?.brandLogo) && !this._brandLogoDitherEntry?.(!!rows.find((row) => row?.brandLogo)?.brandLogo?.stacked, width, height))
    ) {
      this._templateThumbnailMarkupCache.set(cacheKey, thumbnail);
      if (this._templateThumbnailMarkupCache.size > 96) this._templateThumbnailMarkupCache.delete(this._templateThumbnailMarkupCache.keys().next().value);
    }
    return thumbnail;
  },

  // --------------------------------------------------------------- layout ---

  // Advance width of a string at a given size. Blocks that place two runs of text
  // next to each other - a value and its unit, a label and its bar - have to know
  // where the first one ends, and there is no measuring API inside a serialized
  // SVG that is never attached to a document.
  _svgTextWidth(value, size, bold) {
    let ems = 0;
    for (const character of String(value ?? "")) ems += glyphWidth(character, bold);
    return ems * size;
  },

  _svgFitFontSize(value, size, maxWidth, bold, minSize = MIN_READABLE_FONT_SIZE) {
    const text = String(value ?? "");
    const requested = Math.max(minSize, Number(size) || minSize);
    if (!maxWidth || !text) return requested;
    const estimated = this._svgTextWidth(text, requested, bold);
    return estimated > maxWidth ? Math.max(minSize, requested * (maxWidth / estimated)) : requested;
  },

  _svgReadableText(value, size, maxWidth, bold, minSize = MIN_READABLE_FONT_SIZE) {
    const original = String(value ?? "");
    const fontSize = this._svgFitFontSize(original, size, maxWidth, bold, minSize);
    // _svgFitFontSize derives fontSize as size * (maxWidth / estimatedWidth), so
    // re-measuring at that fontSize should land back on maxWidth exactly - but
    // floating point only gets close (55.20000000000001 vs 55.2), and a strict
    // <= turned that into a real string, e.g. "0,86 Kč" on a narrow price tag,
    // getting needlessly ellipsised to "0,86…" despite fitting. A tolerance
    // absorbs the rounding error without allowing any real overflow through.
    if (!maxWidth || this._svgTextWidth(original, fontSize, bold) <= maxWidth + 0.5) return { text: original, fontSize };
    const ellipsis = "…";
    let clipped = original;
    while (clipped.length > 1 && this._svgTextWidth(`${clipped}${ellipsis}`, fontSize, bold) > maxWidth) clipped = clipped.slice(0, -1);
    return { text: clipped.length < original.length ? `${clipped.trimEnd()}${ellipsis}` : original, fontSize };
  },

  _svgText(value, x, y, size, options = {}) {
    const text = String(value ?? "");
    if (!text) return "";
    const bold = !!options.bold;
    const fitted = this._svgReadableText(text, size, options.maxWidth, bold, options.minSize);
    const fontSize = fitted.fontSize;
    const anchor = options.anchor || "middle";
    const color = options.color || BLACK;
    // Yellow pigment has excellent coverage as a surface, but a thin yellow
    // glyph disappears against the white paper. If a template explicitly asks
    // for yellow type, give every glyph a real black e-ink outline instead of
    // relying on monitor antialiasing that the physical panel cannot reproduce.
    const outline = color === YELLOW
      ? ` stroke="${BLACK}" stroke-width="${Math.max(0.8, fontSize * 0.075).toFixed(2)}" paint-order="stroke" stroke-linejoin="round"`
      : "";
    return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-family="${FONT}" font-size="${fontSize.toFixed(2)}"`
      + ` font-weight="${bold ? 700 : 400}" fill="${color}"${outline} text-anchor="${anchor}"`
      + ` dominant-baseline="central" xml:space="preserve">${this._escape(fitted.text)}</text>`;
  },

  _svgIcon(name, cx, cy, size, color = BLACK) {
    if (WEATHER_ICON_TO_CONDITION.has(name)) {
      const weather = this._svgWeatherIcon(name, cx, cy, size);
      if (weather) return weather;
    }
    const resolved = ICON_GEOMETRY.get(name);
    if (!resolved?.inner) return "";
    const x = cx - size / 2;
    const y = cy - size / 2;
    const outline = color === YELLOW
      ? ` stroke="${BLACK}" stroke-width="1.1" paint-order="stroke" stroke-linejoin="round"`
      : "";
    // Nested <svg> re-establishes the icon's own viewBox, so it scales into the
    // requested box no matter what coordinate system the source icon used. The
    // color attribute makes any fill="currentColor" inside resolve correctly.
    return `<svg x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}"`
      + ` viewBox="${resolved.viewBox}" fill="${color}" color="${color}"${outline}>${resolved.inner}</svg>`;
  },

  // Home Assistant's own weather glyph, drawn as a dithered raster <image>
  // rather than vector paths - the same "treat it as an image and convert it
  // like one" path a camera snapshot or the meteoradar map goes through, not
  // the panel's own flat-coloured vector shapes. Reducing full-colour art
  // (real fill colours: WEATHER_SUN_COLOR etc.) to 2-4 e-ink inks with a
  // plain per-pixel threshold would erase every pale fill (#f9f9f9
  // cloud-front, #fcf497 moon) outright, so the rasterised icon is run
  // through Floyd-Steinberg error diffusion instead (_ditherToEinkPalette) -
  // see svg_blocks.weather_icon_image in Python for the same conversion on
  // the backend. Rasterising happens on an offscreen canvas, which is
  // asynchronous by nature (Image.decode/onload), so this mirrors the
  // existing ha-icon pattern: a resolved image is cached and drawn
  // immediately; the first request for a not-yet-seen (name, size, palette)
  // combination returns "" and kicks off _prepareWeatherIconImage, which
  // caches the result and schedules a repaint once it lands.
  _svgWeatherIcon(name, cx, cy, size, night = false) {
    if (!WEATHER_ICON_TO_CONDITION.has(name)) return "";
    const roundedSize = Math.max(1, Math.round(size));
    const supportsYellow = this._displaySupportsYellow?.() === true;
    const key = `${name}:${roundedSize}:${supportsYellow}:${night}`;
    const dataUrl = WEATHER_ICON_IMAGE_CACHE.get(key);
    const x = cx - size / 2;
    const y = cy - size / 2;
    if (dataUrl) {
      return `<image x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}"`
        + ` href="${dataUrl}" image-rendering="pixelated"></image>`;
    }
    // Told _templateSvgPreviewMarkup this pass drew an incomplete picture,
    // so _templateSvgThumbnail's cache (which has no other way to know a
    // weather-* icon is still pending - see that flag's own comment) does
    // not freeze on this blank result.
    this._templateAllWeatherIconsResolved = false;
    if (!WEATHER_ICON_IMAGE_REQUESTS.has(key)) {
      const request = this._prepareWeatherIconImage(name, roundedSize, supportsYellow, night)
        .then((prepared) => {
          WEATHER_ICON_IMAGE_REQUESTS.delete(key);
          if (prepared) {
            WEATHER_ICON_IMAGE_CACHE.set(key, prepared);
            if (WEATHER_ICON_IMAGE_CACHE.size > WEATHER_ICON_CACHE_LIMIT) {
              WEATHER_ICON_IMAGE_CACHE.delete(WEATHER_ICON_IMAGE_CACHE.keys().next().value);
            }
            this._scheduleTemplateIconRepaint();
          }
        })
        .catch(() => WEATHER_ICON_IMAGE_REQUESTS.delete(key));
      WEATHER_ICON_IMAGE_REQUESTS.set(key, request);
    }
    return "";
  },

  // Home Assistant's own condition -> parts mapping (getWeatherStateSVG),
  // drawn in its own order (sun/moon behind the cloud, rain/snow/lightning
  // on top of it) with the real fill colours - this is the rasteriser's
  // input, never sent to the panel as vector markup itself. Every part now
  // also gets a black outline: Home Assistant's own fills lean on
  // antialiasing and a coloured card background to read as shapes, but at
  // forecast-strip size (roughly 20-40px) a dithered fill alone - especially
  // the paler ones - comes out as scattered noise with no silhouette at all.
  // The outline gives the dithering something to sit inside instead of
  // having to carry the whole icon's legibility by itself.
  _weatherIconVectorSource(condition, night, size) {
    const parts = [];
    // Widths are chosen per shape family rather than one constant: the big
    // shapes (cloud, sun, moon) can carry a properly bold line without the
    // outline itself swallowing the shape, while the small accent marks
    // (rain, snow, wind, the lightning bolt) stay thinner so the stroke does
    // not overwhelm a mark only a couple of pixels across at forecast-strip
    // size.
    if (condition === "sunny") {
      parts.push([WEATHER_SUN_D, WEATHER_SUN_COLOR, 1.5]);
    } else if (condition === "clear-night") {
      parts.push([WEATHER_MOON_D, WEATHER_MOON_COLOR, 1.5]);
    } else if (condition === "partlycloudy") {
      parts.push([WEATHER_PARTLY_DISC_D, night ? WEATHER_MOON_COLOR : WEATHER_SUN_COLOR, 1.5]);
    }
    if (WEATHER_CLOUDY_STATES.has(condition)) {
      parts.push([WEATHER_CLOUD_BACK_D, WEATHER_CLOUD_BACK_COLOR, 1.5]);
      parts.push([WEATHER_CLOUD_FRONT_D, WEATHER_CLOUD_FRONT_COLOR, 1.1]);
    }
    // Drawn in black, not Home Assistant's own #30b3ff blue: ditherToEinkPalette's
    // nearest-colour search only ever considers black/white for an achromatic
    // source pixel or ink/white for a warm one (see its own comment for why
    // an unrestricted search can't be trusted) - blue belongs to neither
    // family, and the rain drops are small, already legible marks with
    // nothing that needs shading anyway.
    if (WEATHER_RAIN_STATES.has(condition)) {
      for (const d of WEATHER_RAIN_D) parts.push([d, BLACK, 0.85]);
    }
    if (condition === "pouring") {
      for (const d of WEATHER_POURING_EXTRA_D) parts.push([d, BLACK, 0.85]);
    }
    if (WEATHER_WINDY_STATES.has(condition)) {
      for (const d of WEATHER_WIND_D) parts.push([d, WEATHER_CLOUD_BACK_COLOR, 0.85]);
    }
    if (WEATHER_SNOWY_STATES.has(condition)) {
      for (const d of WEATHER_SNOW_D) parts.push([d, WEATHER_SNOW_FILL, 0.85]);
    }
    if (WEATHER_LIGHTNING_STATES.has(condition)) {
      parts.push([WEATHER_LIGHTNING_D, WEATHER_SUN_COLOR, 0.85]);
    }
    if (!parts.length) return "";
    const shapes = parts.map(([d, fill, strokeWidth]) =>
      `<path d="${d}" fill="${fill}" stroke="${BLACK}" stroke-width="${strokeWidth}" paint-order="stroke"></path>`).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 17 17">${shapes}</svg>`;
  },

  // Rasterises the vector source on an offscreen canvas, dithers it to the
  // display's actual palette and re-encodes as a PNG data: URL. Returns null
  // on any failure (image decode error, no canvas support) so the caller
  // just leaves the icon blank rather than caching a broken result.
  async _prepareWeatherIconImage(name, size, supportsYellow, night) {
    const condition = WEATHER_ICON_TO_CONDITION.get(name);
    const svg = condition ? this._weatherIconVectorSource(condition, night, size) : "";
    if (!svg) return null;
    const image = new Image();
    image.decoding = "sync";
    const loaded = new Promise((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = reject;
    });
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    try {
      await loaded;
    } catch (_error) {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(image, 0, 0, size, size);
    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, size, size);
    } catch (_error) {
      return null;
    }
    const ink = supportsYellow ? [244, 196, 0] : [227, 27, 27];
    ditherToEinkPalette(imageData, ink);
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  },

  // Turns the declarative row list into positioned SVG markup filling width x height.
  //
  // Every template is authored as a vertical stack of rows whose heights and font
  // sizes are fractions of the panel height, which only works on a panel roughly
  // as tall and narrow as the one they were drawn for. The hardware is not: the
  // sdk types this integration supports run from 168x384 to 1360x480, so on a
  // wide panel the same stack squeezed ten rows into 128 px - type at the 6 px
  // floor, icons the size of the text, and two thirds of the width left empty.
  // Anything clearly wider than tall is therefore laid out in two columns
  // instead, which is a rearrangement of the same rows, not a different design.
  // `collector`, when given, receives one { rowIndex, box } entry per row this
  // pass lays out - box geometry only, nothing about what the row draws. The
  // variable-preview crop in the template settings dialog is the only
  // consumer: it needs to know exactly which rectangle of the finished SVG a
  // given variable landed in, and that rectangle is a side effect of this
  // same layout math, not something worth recomputing separately (and risking
  // it drifting from what actually gets drawn).
  _layoutTemplateSvg(rows, width, height, collector) {
    // brandLogo joins dither/customImage here so the logo template really does
    // get the whole panel: no page padding, no footer band, no column split -
    // the block is handed the display's exact rectangle and centres the lockup
    // inside it itself.
    if (rows.length === 1 && (rows[0]?.dither || rows[0]?.customImage || rows[0]?.brandLogo) && rows[0]?.pixelPerfect) {
      const box = { x: 0, y: 0, w: width, h: height, fullX: 0, fullW: width };
      if (collector && rows[0].__rowIndex !== undefined) collector.push({ rowIndex: rows[0].__rowIndex, box });
      return this._renderTemplateBlock(rows[0], box);
    }
    return width / height >= LANDSCAPE_ASPECT
      ? this._layoutTemplateSvgColumns(rows, width, height, collector)
      : this._layoutTemplateSvgStacked(rows, width, height, collector);
  },

  _layoutTemplateSvgStacked(rows, width, height, collector) {
    // Kept for the layout choice below; the decorative top rule it used to
    // draw - a yellow segment leading into a black line - is gone. It was
    // ornament on a panel whose whole appeal is that it looks like paper.
    const modern = rows.some((row) => row?.modern);
    const pad = Math.max(3, Math.round(Math.min(width, height) * 0.035));
    const footerRow = rows.find((row) => row.footer);
    const footerHeight = footerRow ? Math.max(18, Math.round(height * (footerRow.h || 0.16))) : 0;
    const parts = [];
    let box = { x: pad, y: pad, w: width - pad * 2, h: height - footerHeight - pad, fullX: 0, fullW: width };
    if (modern) {
    }
    parts.push(...this._stackTemplateBlocks(rows.filter((row) => !row.footer), box, modern ? 0 : height, collector));
    parts.push(...this._layoutTemplateFooter(footerRow, width, height, footerHeight, collector));
    return parts.join("");
  },

  // The wide-panel arrangement: what identifies the template - its icon, its name
  // and its headline reading - fills a leading column, its content blocks stack in
  // a second one, and the footer keeps the full-width band it has when stacked.
  // Rows are re-grouped rather than re-authored, so a template says the same thing
  // on a 296x128 tag as it does on a 240x416 one.
  _layoutTemplateSvgColumns(rows, width, height, collector) {
    const compactLandscape = rows.some((row) => row?.compact);
    const modern = rows.some((row) => row?.modern);
    const pad = compactLandscape ? 3 : Math.max(3, Math.round(Math.min(width, height) * 0.045));
    const footerRow = rows.find((row) => row.footer);
    // Horizontal rules separate stacked rows; side by side there is nothing left
    // for them to separate, and the column divider below does that job instead.
    const flowRows = rows.filter((row) => !row.footer && !row.flex && !row.rule && !row.gap);
    const footerHeight = footerRow
      ? (compactLandscape
        ? Math.max(14, Math.round(height * 0.125))
        : Math.max(14, Math.round(height * Math.min(0.26, (footerRow.h || 0.16) * 1.3))))
      : 0;
    const columnHeight = Math.max(1, height - footerHeight - pad * 2);

    const iconRow = flowRows.find((row) => row.icon);
    const textRows = flowRows.filter((row) => row.text != null);
    // A stat block is the headline by definition; without one it is the largest
    // type in the spec, and every other text row captions it.
    const heroRow = flowRows.find((row) => row.stat)
      || textRows.reduce((best, row) => (!best || (row.size || 0) > (best.size || 0) ? row : best), null);
    const titleRow = textRows.find((row) => row !== heroRow);
    // Emphasis differs from the stacked layout: a column is tall and narrow, so
    // the headline can take the room the surrounding rows do not need.
    const lead = [
      iconRow && { ...iconRow, h: (iconRow.h || 0.16) * 0.85 },
      titleRow && { ...titleRow, h: (titleRow.h || 0.08) * 0.85 },
      heroRow && { ...heroRow, h: (heroRow.h || 0.12) * 1.7 },
    ].filter(Boolean);
    const detail = flowRows.filter((row) => row !== iconRow && row !== titleRow && row !== heroRow);

    const parts = [];
    if (!lead.length || !detail.length) {
      let box = { x: pad, y: pad, w: width - pad * 2, h: columnHeight, fullX: pad, fullW: width - pad * 2 };
      if (modern) {
      }
      parts.push(...this._stackTemplateBlocks(lead.length ? lead : flowRows, box, 0, collector));
      if (lead.length && detail.length) parts.push(...this._stackTemplateBlocks(detail, box, 0, collector));
    } else {
      const gap = pad;
      const leadWidth = Math.max(1, Math.round((width - pad * 2 - gap) * 0.42));
      const detailX = pad + leadWidth + gap;
      const detailWidth = Math.max(1, width - pad - detailX);
      let leadBox = { x: pad, y: pad, w: leadWidth, h: columnHeight, fullX: pad, fullW: leadWidth };
      let detailBox = { x: detailX, y: pad, w: detailWidth, h: columnHeight, fullX: detailX, fullW: detailWidth };
      if (modern) {
      }
      parts.push(`<rect x="${(detailX - gap / 2).toFixed(2)}" y="${leadBox.y.toFixed(2)}" width="1" height="${leadBox.h.toFixed(2)}" fill="${BLACK}"></rect>`);
      parts.push(...this._stackTemplateBlocks(lead, leadBox, 0, collector));
      parts.push(...this._stackTemplateBlocks(detail, detailBox, 0, collector));
    }

    parts.push(...this._layoutTemplateFooter(footerRow, width, height, footerHeight, collector));
    return parts.join("");
  },

  // Hands each row a rectangle and lets the row draw itself into it.
  //
  // `base` is what a row's `h` fraction is measured against: the panel height in
  // the stacked layout, which keeps its proportions exactly as authored, or 0 in
  // the column layout, where a subset of the rows has to fill a column of its own
  // and the fractions are normalised against each other instead.
  _stackTemplateBlocks(rows, box, base, collector) {
    const total = rows.reduce((sum, row) => sum + (row.flex ? 0 : (row.h || 0.08)), 0) || 1;
    const unit = base || box.h / total;
    const fixed = rows.map((row) => (row.flex ? 0 : Math.max(1, unit * (row.h || 0.08))));
    const fixedTotal = fixed.reduce((sum, value) => sum + value, 0);
    const flexCount = rows.filter((row) => row.flex).length;
    const scale = fixedTotal > box.h ? box.h / fixedTotal : 1;
    const flexShare = flexCount ? Math.max(0, box.h - fixedTotal * scale) / flexCount : 0;

    let y = box.y;
    const parts = [];
    rows.forEach((row, index) => {
      const rowHeight = row.flex ? flexShare : fixed[index] * scale;
      const rowBox = { x: box.x, y, w: box.w, h: rowHeight, fullX: box.fullX, fullW: box.fullW };
      if (collector && row.__rowIndex !== undefined) collector.push({ rowIndex: row.__rowIndex, box: rowBox });
      const markup = this._renderTemplateBlock(row, rowBox);
      parts.push(row.group && markup ? `<g data-template-block="${this._escape(row.group)}">${markup}</g>` : markup);
      y += rowHeight;
    });
    return parts;
  },

  _layoutTemplateFooter(footerRow, width, height, footerHeight, collector) {
    if (!footerRow || footerHeight <= 0) return [];
    if (collector && footerRow.__rowIndex !== undefined) {
      collector.push({ rowIndex: footerRow.__rowIndex, box: { x: 0, y: height - footerHeight, w: width, h: footerHeight } });
    }
    const parts = [];
    const top = height - footerHeight;
    // The footer is always a solid red bar. It is the one place a filled block
    // belongs: it closes the page, it is the same on every template, and being
    // the only coloured shape on the panel is what makes it read as a footer
    // rather than as content. Red rather than black because red carries the
    // brand and, on a panel that thresholds every pixel, prints just as
    // cleanly while leaving black to the type above it.
    parts.push(`<rect x="0" y="${top.toFixed(2)}" width="${width}" height="${footerHeight.toFixed(2)}" fill="${RED}"></rect>`);
    const cells = footerRow.footer;
    const cellWidth = width / (cells.length || 1);
    cells.forEach((cell, index) => {
      const cx = cellWidth * (index + 0.5);
      if (index > 0) {
        parts.push(`<rect x="${(cellWidth * index).toFixed(2)}" y="${(top + footerHeight * 0.15).toFixed(2)}" width="1" height="${(footerHeight * 0.7).toFixed(2)}" fill="#ffffff" opacity="0.5"></rect>`);
      }
      const labelSize = Math.max(footerRow.compact ? 9.5 : 8.5, footerHeight * 0.32);
      const valueSize = Math.max(footerRow.compact ? 11 : 10, footerHeight * 0.4);
      // The 128 px landscape tags cannot afford a tall two-line footer. Keep
      // the mandatory red status bar, but render its supporting information on
      // one bold line so the graph/QR/dial above remains the visual priority.
      if (footerRow.compact && !cell.icon) {
        const compactText = [cell.label, cell.value].filter((part) => part != null && part !== "").join("  ·  ");
        parts.push(this._svgText(compactText, cx, top + footerHeight * 0.5, Math.max(10, footerHeight * 0.48), {
          color: "#ffffff", bold: false, minSize: 9, maxWidth: cellWidth * 0.92,
        }));
        return;
      }
      if (cell.icon) {
        parts.push(this._svgText(cell.label, cx, top + footerHeight * 0.2, labelSize, { color: "#ffffff", bold: true, maxWidth: cellWidth * 0.9 }));
        parts.push(this._svgIcon(cell.icon, cx, top + footerHeight * 0.5, footerHeight * 0.3, "#ffffff"));
        parts.push(this._svgText(cell.value, cx, top + footerHeight * 0.82, valueSize, { color: "#ffffff", bold: true, maxWidth: cellWidth * 0.9 }));
      } else {
        parts.push(this._svgText(cell.label, cx, top + footerHeight * 0.32, labelSize, { color: "#ffffff", bold: true, maxWidth: cellWidth * 0.9 }));
        parts.push(this._svgText(cell.value, cx, top + footerHeight * 0.7, valueSize, { color: "#ffffff", bold: true, maxWidth: cellWidth * 0.9 }));
      }
    });
    return parts;
  },


  // ---------------------------------------------------------------- blocks ---

  // Every template used to be the same six rows - icon, title, rule, value, list,
  // footer - with different words in them, which is why twenty templates looked
  // like one. A block draws itself into whatever rectangle the layout hands it, so
  // a template's shape is now a matter of which blocks it picks, and a new shape
  // costs a spec entry instead of a branch in the layout.
  _renderTemplateBlock(row, box) {
    if (!row || box.h <= 0 || box.w <= 0) return "";
    if (row.icon) return this._blockIcon(row, box);
    if (row.rule) return this._blockRule(row, box);
    if (row.list) return this._blockList(row, box);
    if (row.stat) return this._blockStat(row, box);
    if (row.band) return this._blockBand(row, box);
    if (row.bars) return this._blockBars(row, box);
    if (row.meters) return this._blockMeters(row, box);
    if (row.ring) return this._blockRing(row, box);
    if (row.dial) return this._blockDial(row, box);
    if (row.dither) return this._blockDither(row, box);
    if (row.customImage) return this._blockCustomImage(row, box);
    if (row.grid) return this._blockGrid(row, box);
    if (row.steps) return this._blockSteps(row, box);
    if (row.checklist) return this._blockChecklist(row, box);
    if (row.strip) return this._blockStrip(row, box);
    if (row.split) return this._blockSplit(row, box);
    if (row.duo) return this._blockDuo(row, box);
    if (row.splitDates) return this._blockSplitDates(row, box);
    if (row.spark) return this._blockSpark(row, box);
    if (row.datebox) return this._blockDatebox(row, box);
    if (row.board) return this._blockBoard(row, box);
    if (row.qr) return this._blockQr(row, box);
    if (row.radarMap) return this._blockRadarMap(row, box);
    if (row.pricetag) return this._blockPriceTag(row, box);
    if (row.brandLogo) return this._blockBrandLogo(row, box);
    if (row.text != null) return this._blockText(row, box);
    return "";
  },

  // Whether this row may take the four-colour accent treatment. Two conditions,
  // both of which have bitten already:
  //   * row.modern is set only by _fourColorTemplateRows, which returns early
  //     for the protected templates - so those keep their own tuned palette;
  //   * yellow on white is almost no contrast on a panel that thresholds every
  //     pixel, so callers must bound it with a black edge or not use it.
  _accentYellow(row) {
    return !!row?.modern && !!this._displaySupportsYellow?.();
  },

  // Which accent an automation binding must record for a graphic row, so the
  // backend redraws the shape in the colour the browser gave it. svg_blocks.py
  // cannot work this out for itself: it never sees row.modern, and by the time
  // it runs there is no trace of which shape _fourColorTemplateRows picked.
  // Must agree with _blockDial/_blockRing/_blockBars/_blockSpark/_blockMeters,
  // which is why it is one function rather than a condition restated at every
  // binding.
  _ratioAccent(row, visual, source) {
    if (!this._accentYellow(row)) return "";
    // A bar chart and a meter row colour their fills whenever the row is
    // eligible; a dial, a ring and a sparkline take the accent only when
    // _fourColorTemplateRows picked that particular shape to carry it.
    if (visual === "bars") return "yellow";
    return source?.accent === "yellow" ? "yellow" : "";
  },

  // Every block that fills a shape by proportion takes a 0-1 fraction, which is
  // what the templates' ratio() helper returns. A template that wrote a plain
  // percentage instead clamped to 1 and filled the shape completely -
  // thermostat.js asked for `percent: 54` and drew a solid black arch at every
  // temperature - so a value above 1 is read as the percentage it obviously is
  // rather than silently pinning the gauge.
  _fillFraction(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.min(1, number > 1 ? number / 100 : number);
  },

  // The ink a "done" marker is filled with. Yellow only where the template did
  // not ask for red and the panel can actually print it; a three-colour panel
  // keeps exactly what it had. A marker is a filled square or dot - an area,
  // never type - which is the only kind of place yellow reads on this panel.
  _markerInk(color, row, outlined) {
    return color === "red" || !outlined || !this._accentYellow(row)
      ? this._templateInk(color)
      : YELLOW;
  },

  _templateInk(color) {
    if (color === "yellow") return this._displaySupportsYellow?.() ? YELLOW : RED;
    return color === "red" ? RED : BLACK;
  },

  _renderTemplateQrVisual(item) {
    try {
      const code = qrcode(0, "M");
      code.addData(String(item?.text || "https://dratek.cz"));
      code.make();
      const count = code.getModuleCount();
      const quiet = 4;
      const cells = [];
      for (let row = 0; row < count; row++) for (let column = 0; column < count; column++) {
        if (code.isDark(row, column)) cells.push(`<rect x="${column + quiet}" y="${row + quiet}" width="1" height="1"></rect>`);
      }
      const size = count + quiet * 2;
      return `<svg class="template-generated-code" viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><rect width="${size}" height="${size}" fill="#fff"></rect><g fill="#111">${cells.join("")}</g></svg>`;
    } catch (_error) {
      return `<ha-icon icon="mdi:qrcode"></ha-icon>`;
    }
  },

  _renderTemplateBarcodeVisual(item) {
    const digits = this._normalizeEan13?.(item?.text || "859123456789") || "8591234567890";
    const pattern = this._ean13Pattern?.(digits) || "1010101";
    const bars = [...pattern].map((bit, index) => bit === "1" ? `<rect x="${index}" y="0" width="1" height="42"></rect>` : "").join("");
    return `<svg class="template-generated-code" viewBox="0 0 ${pattern.length} 52" preserveAspectRatio="none" aria-hidden="true"><rect width="${pattern.length}" height="52" fill="#fff"></rect><g fill="#111">${bars}</g><text x="${pattern.length / 2}" y="51" text-anchor="middle" font-size="8" font-family="Arial">${digits}</text></svg>`;
  },

  _svgHairline(x, y, w, h, color = BLACK) {
    return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(1, w).toFixed(2)}" height="${Math.max(1, h).toFixed(2)}" fill="${color}"></rect>`;
  },

  // An annular sector, used by both the donut and the half-dial. A full circle
  // would close on itself and disappear, so the sweep stops just short of 360.
  _svgArcPath(cx, cy, outer, inner, startAngle, endAngle) {
    const stop = Math.min(endAngle, startAngle + 359.9);
    const point = (radius, angle) => {
      const rad = (angle * Math.PI) / 180;
      return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
    };
    const large = stop - startAngle > 180 ? 1 : 0;
    const [x1, y1] = point(outer, startAngle);
    const [x2, y2] = point(outer, stop);
    const [x3, y3] = point(inner, stop);
    const [x4, y4] = point(inner, startAngle);
    return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${outer.toFixed(2)} ${outer.toFixed(2)} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
      + ` L${x3.toFixed(2)} ${y3.toFixed(2)} A${inner.toFixed(2)} ${inner.toFixed(2)} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
  },

  _blockIcon(row, box) {
    return this._svgIcon(row.icon, box.x + box.w / 2, box.y + box.h / 2, Math.min(box.h, box.w) * 0.92, this._templateInk(row.color));
  },

  _blockRule(row, box) {
    const ruleWidth = box.w * 0.82;
    const x = box.x + (box.w - ruleWidth) / 2;
    // One hairline, nothing else. This used to draw a five-pixel black bar with
    // a yellow one inside it whenever the four-colour pass touched the row -
    // a heavy striped ribbon across the top of the page rather than a divider.
    return this._svgHairline(x, box.y + box.h / 2, ruleWidth, 1, this._templateInk(row.color));
  },

  // Sizing from the row's own size/height ratio rather than from the panel keeps
  // the type inside its box in every layout: a row squeezed by a short panel used
  // to keep its full font size and collide with the line under it.
  _blockText(row, box) {
    const ratio = row.h ? (row.size || row.h * 0.62) / row.h : 0.62;
    const fontSize = Math.max(9, Math.min(box.h * ratio, box.h * 0.92));
    // No yellow slab behind the words. Yellow is reserved for graphic detail;
    // as a fill under type it reads as a highlighter mark, and the black text
    // on it loses contrast once the panel thresholds every pixel.
    return this._svgText(row.text, box.x + box.w / 2, box.y + box.h / 2, fontSize, {
      bold: !!row.bold,
      color: this._templateInk(row.color),
      maxWidth: box.w,
    });
  },

  _blockList(row, box) {
    const cells = row.list;
    const lineHeight = box.h / (cells.length || 1);
    const fontSize = Math.max(row.compact ? 11 : 10, Math.min(lineHeight * 0.82, box.w * 0.16));
    const right = box.x + box.w;
    const parts = [];
    cells.forEach((cell, index) => {
      const lineY = box.y + lineHeight * (index + 0.5);
      let textX = box.x;
      if (cell.icon) {
        const iconSize = Math.min(lineHeight * 0.66, box.w * 0.2);
        parts.push(this._svgIcon(cell.icon, box.x + iconSize / 2, lineY, iconSize, this._templateInk(cell.iconColor ?? cell.color)));
        textX = box.x + iconSize + Math.max(2, iconSize * 0.25);
      }
      if (cell.value != null && cell.label != null) {
        parts.push(this._svgText(cell.label, textX, lineY, fontSize, { anchor: "start", bold: false, minSize: row.compact ? 8.5 : undefined, maxWidth: (right - textX) * 0.6 }));
        parts.push(this._svgText(cell.value, right, lineY, fontSize, { anchor: "end", bold: !row.compact, color: this._templateInk(cell.color), maxWidth: (right - textX) * 0.44 }));
      } else {
        parts.push(this._svgText(cell.label ?? cell.value, textX, lineY, fontSize, { anchor: "start", bold: !!cell.bold, minSize: row.compact ? 8.5 : undefined, color: this._templateInk(cell.color), maxWidth: right - textX }));
      }
    });
    return parts.join("");
  },

  // One reading at display scale, with its unit set small beside it rather than
  // shrinking the number to fit both. The pair is centred as a unit.
  _blockStat(row, box) {
    const stat = row.stat;
    let val = String(stat.value || "").trim();
    if (stat.unit) {
      const cleanUnit = String(stat.unit).trim();
      if (val.toLowerCase().endsWith(cleanUnit.toLowerCase())) {
        val = val.slice(0, -cleanUnit.length).trim();
      }
    }
    const captionHeight = stat.caption != null ? box.h * 0.24 : 0;
    const valueHeight = box.h - captionHeight;
    const unitRatio = 0.34;
    const span = (size) => this._svgTextWidth(val, size, true)
      + (stat.unit ? this._svgTextWidth(` ${stat.unit}`, size * unitRatio, false) : 0);
    let fontSize = Math.max(11, valueHeight * 0.82);
    // span() is linear in the font size, so one division lands exactly on the
    // width instead of iterating towards it.
    if (span(fontSize) > box.w) fontSize = Math.max(8.5, (fontSize * box.w) / span(fontSize));
    const unitSize = fontSize * unitRatio;
    const left = box.x + box.w / 2 - span(fontSize) / 2;
    const baseline = box.y + valueHeight * 0.54;
    // See _blockText: the reading itself is the thing to look at, so it gets
    // the panel's strongest ink rather than a coloured plate under it.
    const parts = [];
    parts.push(this._svgText(val, left, baseline, fontSize, { anchor: "start", bold: true, color: this._templateInk(stat.color) }));
    if (stat.unit) {
      parts.push(this._svgText(stat.unit, left + this._svgTextWidth(val, fontSize, true) + unitSize * 0.3, baseline + fontSize * 0.22, unitSize, {
        anchor: "start", color: this._templateInk(stat.unitColor),
      }));
    }
    if (stat.caption != null) {
      parts.push(this._svgText(stat.caption, box.x + box.w / 2, box.y + valueHeight + captionHeight * 0.5, Math.max(row.compact ? 10 : 8.5, captionHeight * 0.7), {
        bold: false, minSize: row.compact ? 8.5 : undefined, color: this._templateInk(stat.captionColor), maxWidth: box.w,
      }));
    }
    return parts.join("");
  },

  // A filled bar with the type reversed out of it - the loudest shape available on
  // a three-colour panel, so no template uses more than two.
  _blockBand(row, box) {
    const band = row.band;
    const x = row.bleed ? box.fullX : box.x;
    const w = row.bleed ? box.fullW : box.w;
    // A band used to be a solid slab with white type knocked out of it, and
    // for most templates that slab was black - a heavy dark block across the
    // top of a page that is otherwise white. Only a band the template asks for
    // in red keeps a fill now; every other one becomes an open headline with a
    // thin red rule under it. Same emphasis, a fraction of the ink, and no
    // white-on-black text to fight the panel's hard 50% threshold.
    const filled = band.color === "red";
    const parts = filled
      ? [`<rect x="${x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${w.toFixed(2)}" height="${box.h.toFixed(2)}" fill="${RED}"></rect>`]
      : [`<rect x="${x.toFixed(2)}" y="${(box.y + box.h - 1).toFixed(2)}" width="${w.toFixed(2)}" height="1" fill="${RED}"></rect>`];
    const textColor = filled ? "#ffffff" : BLACK;
    const iconSize = band.icon ? Math.min(box.h * 0.72, w * 0.12) : 0;
    const iconCx = x + iconSize * 0.82;
    const textX = band.icon ? x + iconSize * 1.65 + (w - iconSize * 1.65) / 2 : x + w / 2;
    const textWidth = band.icon ? Math.max(10, w - iconSize * 2.15) : w * 0.92;
    const iconColor = filled ? "#ffffff" : RED;
    if (band.icon) parts.push(this._svgIcon(band.icon, iconCx, box.y + box.h / 2, iconSize, iconColor));
    // On a 128 px landscape tag these bands are often only 16-26 native
    // pixels high. Two separate baselines at 30/70 % overlap after e-ink
    // rasterisation (SERVER / ONLINE was the most visible example), so the
    // compact design uses one deliberately heavy line instead.
    if (row.compact && band.label != null && band.value != null) {
      parts.push(this._svgText(`${band.label}  ·  ${band.value}`, textX, box.y + box.h * 0.5, Math.max(11, box.h * 0.52), {
        color: textColor, bold: false, minSize: 9.5, maxWidth: textWidth,
      }));
      return parts.join("");
    }
    if (band.label != null && band.value != null) {
      parts.push(this._svgText(band.label, textX, box.y + box.h * 0.3, Math.max(10, box.h * 0.4), { color: textColor, bold: true, maxWidth: textWidth }));
      parts.push(this._svgText(band.value, textX, box.y + box.h * 0.7, Math.max(12, box.h * 0.56), { color: textColor, bold: true, maxWidth: textWidth }));
    } else {
      parts.push(this._svgText(band.value ?? band.label, textX, box.y + box.h * 0.5, Math.max(12, box.h * 0.68), { color: textColor, bold: true, maxWidth: textWidth }));
    }
    return parts.join("");
  },

  // The shape of a day, which is the one thing a column of numbers cannot show.
  _blockBars(row, box) {
    const values = (row.bars.values || []).map(Number).filter(Number.isFinite);
    if (!values.length) return "";
    const labels = row.bars.labels || [];
    const labelHeight = labels.length ? Math.min(box.h * 0.28, 13) : 0;
    const chartHeight = Math.max(1, box.h - labelHeight);
    const top = Math.max(...values);
    const bottom = Math.min(...values, 0);
    const span = top - bottom || 1;
    const step = box.w / values.length;
    const barWidth = Math.max(1, step * 0.68);
    const parts = [
      `<rect x="${box.x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${box.w.toFixed(2)}" height="${box.h.toFixed(2)}" fill="#ffffff" fill-opacity="0" pointer-events="all"></rect>`,
      this._svgHairline(box.x, box.y + chartHeight, box.w, 1),
    ];
    values.forEach((value, index) => {
      const barHeight = Math.max(1, ((value - bottom) / span) * (chartHeight - 1));
      // On a four-colour panel the columns are yellow with a black edge: the
      // shape still reads as a solid bar, but a chart stops being a block of
      // black. The highlighted column keeps red so it still stands out, and a
      // three-colour panel keeps the plain black bars it always had.
      const columns = this._accentYellow(row);
      const fill = row.bars.highlight === index ? RED : columns ? YELLOW : BLACK;
      const edge = columns && row.bars.highlight !== index
        ? ` stroke="${BLACK}" stroke-width="1"` : "";
      parts.push(`<rect x="${(box.x + step * index + (step - barWidth) / 2).toFixed(2)}" y="${(box.y + chartHeight - barHeight).toFixed(2)}"`
        + ` width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" fill="${fill}"${edge}></rect>`);
    });
    labels.forEach((label, index) => {
      if (label == null || label === "") return;
      // Only selected ticks carry a label (typically 0, 6, 12 and 18). They may
      // use the empty neighbouring intervals instead of being squeezed into the
      // width of one narrow bar.
      const labelWidth = Math.min(box.w, Math.max(step * 0.95, step * 3.5));
      const rawX = box.x + step * (index + 0.5);
      const labelX = Math.max(box.x + labelWidth / 2, Math.min(box.x + box.w - labelWidth / 2, rawX));
      parts.push(this._svgText(label, labelX, box.y + chartHeight + labelHeight * 0.58, Math.max(7, labelHeight * 0.7), { maxWidth: labelWidth }));
    });
    return parts.join("");
  },

  // Quantities that share a 0-100 scale, which read as a comparison when they are
  // bars and as an arbitrary ranking when they are a list of numbers.
  _blockMeters(row, box) {
    const meters = row.meters;
    const lineHeight = box.h / (meters.length || 1);
    const parts = [];
    meters.forEach((meter, index) => {
      const top = box.y + lineHeight * index;
      // A track needs its outline, a gap and a fill; under six pixels those
      // three collapse into one smear once the panel thresholds them. Six is
      // therefore the floor, and at six the outline still fits - which matters
      // twice over, because the outline is also what makes a yellow fill
      // visible at all against white. Ten is the ceiling: past that a bar stops
      // reading as a gauge and starts reading as a slab.
      const barHeight = Math.max(6, Math.min(lineHeight * 0.32, 10));
      const gap = Math.max(2, lineHeight * 0.08);
      // What is left for the label and the reading once the bar has taken its
      // share. Sizing the type off the whole line height instead was what let
      // the server template's readings grow until they overlapped the bar of
      // the meter above them.
      const textBand = Math.max(9, lineHeight - barHeight - gap);
      const labelSize = Math.max(row.compact ? 10 : 9.5, Math.min(textBand * 0.8, box.w * 0.13));
      // The reading carries the row; the label only says what it is. They used
      // to share one size, which left a meter row looking like two captions
      // with a hairline under them.
      const valueSize = Math.max(labelSize, Math.min(textBand * 0.95, box.w * 0.18));
      const textY = top + textBand / 2;
      const barY = top + textBand + gap / 2;
      const percent = this._fillFraction(meter.percent);
      parts.push(this._svgText(meter.label, box.x, textY, labelSize, { anchor: "start", bold: false, minSize: row.compact ? 8.5 : undefined, maxWidth: box.w * 0.58 }));
      parts.push(this._svgText(meter.value, box.x + box.w, textY, valueSize, { anchor: "end", bold: true, color: this._templateInk(meter.color), maxWidth: box.w * 0.4 }));
      parts.push(`<rect x="${box.x.toFixed(2)}" y="${barY.toFixed(2)}" width="${box.w.toFixed(2)}" height="${barHeight.toFixed(2)}" fill="none" stroke="${BLACK}" stroke-width="1"></rect>`);
      if (percent > 0) {
        // The filled part of a meter is the other honest place for yellow: it
        // is an area, it is never type, and a row of black bars was most of
        // what made these templates read as three-colour.
        const meterInk = meter.color === "red" || !this._accentYellow(row)
          ? this._templateInk(meter.color)
          : YELLOW;
        parts.push(`<rect x="${box.x.toFixed(2)}" y="${barY.toFixed(2)}" width="${(box.w * percent).toFixed(2)}" height="${barHeight.toFixed(2)}" fill="${meterInk}"></rect>`);
      }
    });
    return parts.join("");
  },

  _blockRing(row, box) {
    const ring = row.ring;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const outer = Math.min(box.w, box.h) * 0.46;
    const inner = outer * 0.68;
    const percent = this._fillFraction(ring.percent);
    // The reading carries the colour and the track stays empty. It used to be
    // the other way round - the whole ring filled yellow with the value arc
    // laid over it in black - so a gauge came out as a solid dark shape
    // whatever it was reading, and the one thing the eye should measure was
    // the one thing with no edge of its own.
    const accent = ring.accent === "yellow" && ring.color !== "red" && this._accentYellow(row);
    const parts = [
      `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${outer.toFixed(2)}" fill="none" stroke="${BLACK}" stroke-width="1"></circle>`,
      `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${inner.toFixed(2)}" fill="none" stroke="${BLACK}" stroke-width="1"></circle>`,
    ];
    if (percent > 0) parts.push(`<path d="${this._svgArcPath(cx, cy, outer, inner, -90, -90 + percent * 360)}" fill="${accent ? YELLOW : this._templateInk(ring.color)}"`
      + `${accent ? ` stroke="${BLACK}" stroke-width="1"` : ""}></path>`);
    if (ring.value != null) parts.push(this._svgText(ring.value, cx, cy - (ring.caption != null ? inner * 0.2 : 0), Math.max(row.compact ? 13 : 0, inner * 0.62), { bold: true, minSize: row.compact ? 10 : undefined, maxWidth: inner * 1.7 }));
    if (ring.caption != null) parts.push(this._svgText(ring.caption, cx, cy + inner * 0.46, Math.max(row.compact ? 9.5 : 0, inner * 0.34), { bold: false, minSize: row.compact ? 8.5 : undefined, maxWidth: inner * 1.7 }));
    return parts.join("");
  },

  // A half dial: wide, short, and open at the bottom, so it fills a landscape row
  // the donut would waste.
  _blockDial(row, box) {
    const dial = row.dial;
    const cx = box.x + box.w / 2;
    const outer = Math.min(box.w * 0.46, box.h * 0.82);
    const inner = outer * 0.7;
    const cy = box.y + box.h * 0.5 + outer * 0.4;
    const percent = this._fillFraction(dial.percent);
    // See _blockRing: the track is an outline and only the reading is filled.
    const accent = dial.accent === "yellow" && dial.color !== "red" && this._accentYellow(row);
    const parts = [`<path d="${this._svgArcPath(cx, cy, outer, inner, 180, 360)}" fill="none" stroke="${BLACK}" stroke-width="1"></path>`];
    if (percent > 0) parts.push(`<path d="${this._svgArcPath(cx, cy, outer, inner, 180, 180 + percent * 180)}" fill="${accent ? YELLOW : this._templateInk(dial.color)}"`
      + `${accent ? ` stroke="${BLACK}" stroke-width="1"` : ""}></path>`);
    if (dial.value != null) parts.push(this._svgText(dial.value, cx, cy - outer * 0.28, Math.max(row.compact ? 13 : 0, outer * 0.42), { bold: true, minSize: row.compact ? 10 : undefined, maxWidth: inner * 1.8 }));
    if (dial.caption != null) parts.push(this._svgText(dial.caption, cx, cy + outer * 0.16, Math.max(row.compact ? 9.5 : 0, outer * 0.24), { bold: false, minSize: row.compact ? 8.5 : undefined, maxWidth: inner * 1.9 }));
    if (dial.min != null) parts.push(this._svgText(dial.min, cx - outer, cy + outer * 0.22, outer * 0.2, { maxWidth: outer * 0.7 }));
    if (dial.max != null) parts.push(this._svgText(dial.max, cx + outer, cy + outer * 0.22, outer * 0.2, { maxWidth: outer * 0.7 }));
    return parts.join("");
  },

  // Exact-palette 2×2 pixel patterns for the hardware shading test. The SVG is
  // rasterized at the panel's native resolution, so patternUnits=userSpaceOnUse
  // keeps every pattern cell one physical output pixel instead of blending it
  // into an intermediate RGB colour that the e-ink quantizer would discard.
  _blockDither(row, box) {
    const cells = Array.isArray(row.dither) ? row.dither : [];
    if (!cells.length) return "";
    const columns = Math.max(1, Math.min(cells.length, Number(row.columns) || 4));
    const lines = Math.max(1, Math.ceil(cells.length / columns));
    const left = Math.round(box.x);
    const top = Math.round(box.y);
    const right = Math.round(box.x + box.w);
    const bottom = Math.round(box.y + box.h);
    const gridWidth = Math.max(1, right - left);
    const gridHeight = Math.max(1, bottom - top);
    const serial = this._ditherPatternSerial = (this._ditherPatternSerial || 0) + 1;
    const ink = (color) => color === "white" ? "#ffffff" : this._templateInk(color);
    const parts = [];

    cells.forEach((cell, index) => {
      const column = index % columns;
      const line = Math.floor(index / columns);
      const x = Math.round(left + gridWidth * column / columns);
      const y = Math.round(top + gridHeight * line / lines);
      const nextX = Math.round(left + gridWidth * (column + 1) / columns);
      const nextY = Math.round(top + gridHeight * (line + 1) / lines);
      const cellWidth = Math.max(1, nextX - x);
      const cellHeight = Math.max(1, nextY - y);
      const density = Math.max(0, Math.min(1, Number(cell.density) || 0));
      const base = ink(cell.base || "white");
      const foreground = ink(cell.ink || "black");
      const matrix = Number(cell.matrix || row.matrix) === 4 ? 4 : 2;
      const bayerOrder = matrix === 4
        ? [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
        : [0, 2, 3, 1];
      const foregroundCount = Math.round(density * matrix * matrix);
      const patternId = `dratek-dither-${serial}-${index}`;
      const foregroundPixels = bayerOrder.map((order, pixel) => order < foregroundCount
        ? `<rect x="${pixel % matrix}" y="${Math.floor(pixel / matrix)}" width="1" height="1"></rect>`
        : "").join("");
      parts.push(
        `<defs><pattern id="${patternId}" patternUnits="userSpaceOnUse" width="${matrix}" height="${matrix}" shape-rendering="crispEdges">`
        + `<rect width="${matrix}" height="${matrix}" fill="${base}"></rect>`
        + `<g fill="${foreground}">${foregroundPixels}</g></pattern></defs>`,
      );
      parts.push(`<rect x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" fill="url(#${patternId})" shape-rendering="crispEdges"></rect>`);
    });
    return parts.join("");
  },

  // A customImage row's default src (see customImage() in _templateSvgSpecs) is
  // dithered once for the whole display - correct when the image fills the
  // panel, but a moiré mess once that bitmap is scaled down into one slot of a
  // multi-template layout, because a dither pattern sized for the full panel
  // does not survive being shrunk. _customImageSlotDitherEntry keeps a bitmap
  // re-dithered at each slot size actually seen, read live the same way
  // _blockRadarMap reads whatever _ensureTemplateRadarImage last cached instead
  // of a value baked into the row at build time.
  _blockCustomImage(row, box) {
    const width = Math.max(1, Math.round(box.fullW));
    const height = Math.max(1, Math.round(box.h));
    const slotSource = this._customImageSlotDitherEntry?.(width, height);
    if (!slotSource) this._requestCustomImageSlotDither?.(width, height);
    const source = slotSource || String(row.customImage?.src || "");
    if (!source) return `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>`;
    // slotSource is already dithered at this exact width/height, so "none"
    // (stretch) is a no-op for it either way. The fallback drawn while that
    // redither is still in flight is dithered for the *full device* size
    // instead - stretching that non-uniformly into a differently-shaped slot
    // (any grid layout whose slots don't share one aspect ratio, e.g.
    // mixed-5's wide top row vs. its tall bottom row) distorted it a
    // different amount per slot shape, so every slot flashed a differently
    // mangled preview for the instant before its own redither landed.
    // Cropping to fill instead keeps that instant a soft but undistorted
    // preview of the same photo, consistent with the "cover" look every slot
    // settles into once its real bitmap arrives.
    const fit = slotSource ? "none" : "xMidYMid slice";
    return `<image x="0" y="0" width="${width}" height="${height}" href="${this._escape(source)}"`
      + ` preserveAspectRatio="${fit}" image-rendering="auto"></image>`;
  },

  // Tiles of equal weight. A list ranks what it stacks; a grid says these readings
  // are peers, which is what a room summary actually means.
  _blockGrid(row, box) {
    const cells = row.grid;
    const columns = Math.max(1, row.columns || 2);
    const lines = Math.max(1, Math.ceil(cells.length / columns));
    const cellWidth = box.w / columns;
    const cellHeight = box.h / lines;
    const parts = [];
    for (let index = 1; index < columns; index++) parts.push(this._svgHairline(box.x + cellWidth * index, box.y, 1, box.h));
    for (let index = 1; index < lines; index++) parts.push(this._svgHairline(box.x, box.y + cellHeight * index, box.w, 1));
    // A tile stays a tile whatever shape its cell is. Sizing purely off the cell
    // height blew the type up when three cells shared one tall row, so the
    // contents sit in a centred box no taller than the cell is wide.
    const contentHeight = Math.min(cellHeight, cellWidth * 1.35);
    cells.forEach((cell, index) => {
      const cx = box.x + cellWidth * (index % columns) + cellWidth / 2;
      const top = box.y + cellHeight * Math.floor(index / columns) + (cellHeight - contentHeight) / 2;
      if (cell.icon) parts.push(this._svgIcon(cell.icon, cx, top + contentHeight * 0.22, Math.min(contentHeight * 0.3, cellWidth * 0.3), this._templateInk(cell.iconColor ?? cell.color)));
      parts.push(this._svgText(cell.value, cx, top + contentHeight * (cell.icon ? 0.57 : 0.42), Math.max(row.compact ? 11 : 9.5, Math.min(contentHeight * (cell.icon ? 0.32 : 0.46), cellWidth * 0.42)), {
        bold: true, minSize: row.compact ? 9 : undefined, color: this._templateInk(cell.color), maxWidth: cellWidth * 0.9,
      }));
      parts.push(this._svgText(cell.label, cx, top + contentHeight * (cell.icon ? 0.88 : 0.78), Math.max(row.compact ? 9.5 : 8.5, Math.min(contentHeight * 0.21, cellWidth * 0.24)), { bold: false, minSize: row.compact ? 8.5 : undefined, maxWidth: cellWidth * 0.9 }));
    });
    return parts.join("");
  },

  // Progress along a sequence, which a percentage cannot express: it matters that
  // the wash is past rinsing, not that it is 60 % done.
  _blockSteps(row, box) {
    const steps = row.steps;
    const horizontal = row.orientation === "horizontal";
    const parts = [];
    if (horizontal) {
      const step = box.w / (steps.length || 1);
      const lineY = box.y + box.h * 0.34;
      // A 1px ring needs an inside to be a ring: under five pixels across it
      // thresholds into a plain dot, so five is the floor.
      const dot = Math.max(2.5, Math.min(step * 0.2, box.h * 0.22));
      parts.push(this._svgHairline(box.x + step * 0.5, lineY, box.w - step, 1));
      steps.forEach((item, index) => {
        const cx = box.x + step * (index + 0.5);
        parts.push(item.done
          ? `<circle cx="${cx.toFixed(2)}" cy="${lineY.toFixed(2)}" r="${dot.toFixed(2)}" fill="${this._markerInk(item.color, row, true)}" stroke="${BLACK}" stroke-width="1"></circle>`
          : `<circle cx="${cx.toFixed(2)}" cy="${lineY.toFixed(2)}" r="${dot.toFixed(2)}" fill="#ffffff" stroke="${BLACK}" stroke-width="1"></circle>`);
        // Sized from box.h alone, a tall column with many close-together steps asked
        // for a font far bigger than any one step's own width could ever hold, then
        // leaned on the same single-shot proportional shrink as the strip block
        // above - the same glyph-estimate margin problem, just reached from a
        // wildly oversized starting point instead of a merely tight one. Capping
        // the ask by the step's own width keeps the correction small.
        parts.push(this._svgText(item.label, cx, box.y + box.h * 0.75, Math.max(row.compact ? 9.5 : 8.5, Math.min(box.h * 0.28, step * 0.3)), { bold: !!item.done && !row.compact, minSize: row.compact ? 8.5 : undefined, color: this._templateInk(item.color), maxWidth: step * 0.94 }));
      });
      return parts.join("");
    }
    const lineHeight = box.h / (steps.length || 1);
    // Same floor as the step markers above.
    const dot = Math.max(2.5, Math.min(lineHeight * 0.26, box.w * 0.09));
    const railX = box.x + dot * 1.4;
    parts.push(this._svgHairline(railX, box.y + lineHeight * 0.5, 1, box.h - lineHeight));
    steps.forEach((item, index) => {
      const cy = box.y + lineHeight * (index + 0.5);
      parts.push(item.done
        ? `<circle cx="${railX.toFixed(2)}" cy="${cy.toFixed(2)}" r="${dot.toFixed(2)}" fill="${this._markerInk(item.color, row, true)}" stroke="${BLACK}" stroke-width="1"></circle>`
        : `<circle cx="${railX.toFixed(2)}" cy="${cy.toFixed(2)}" r="${dot.toFixed(2)}" fill="#ffffff" stroke="${BLACK}" stroke-width="1"></circle>`);
      const textX = railX + dot * 1.8;
      parts.push(this._svgText(item.label, textX, cy, Math.max(row.compact ? 9.5 : 8.5, Math.min(lineHeight * 0.58, box.w * 0.12)), {
        anchor: "start", bold: !!item.done && !row.compact, minSize: row.compact ? 8.5 : undefined, color: this._templateInk(item.color), maxWidth: box.x + box.w - textX,
      }));
    });
    return parts.join("");
  },

  _blockChecklist(row, box) {
    const items = row.checklist;
    const columns = Math.max(1, Number(row.columns) || 1);
    if (columns > 1) {
      const lines = Math.max(1, Math.ceil(items.length / columns));
      const cellWidth = box.w / columns;
      const lineHeight = box.h / lines;
      // A checkbox has to hold a 1px outline, a gap and a tick. Under about
      // seven pixels there is no room for all three and the whole thing
      // thresholds into a solid dot, so below that the box is dropped and the
      // state is carried by a filled square alone.
      const mark = Math.max(6, Math.min(lineHeight * 0.42, cellWidth * 0.12));
      const boxed = mark >= 7;
      const parts = [];
      items.forEach((item, index) => {
        const column = index % columns;
        const line = Math.floor(index / columns);
        const left = box.x + column * cellWidth;
        const cy = box.y + lineHeight * (line + 0.5);
        if (column > 0) parts.push(this._svgHairline(left, box.y + box.h * 0.08, 1, box.h * 0.84));
        parts.push(`<rect x="${(left + 3).toFixed(2)}" y="${(cy - mark / 2).toFixed(2)}" width="${mark.toFixed(2)}" height="${mark.toFixed(2)}"`
          + ` fill="${item.done ? this._markerInk(item.color, row, boxed) : "#ffffff"}"${boxed ? ` stroke="${BLACK}" stroke-width="1"` : ""}></rect>`);
        if (item.done && boxed) {
          parts.push(`<path d="M${(left + 3 + mark * 0.22).toFixed(2)} ${cy.toFixed(2)} L${(left + 3 + mark * 0.44).toFixed(2)} ${(cy + mark * 0.24).toFixed(2)}`
            + ` L${(left + 3 + mark * 0.8).toFixed(2)} ${(cy - mark * 0.26).toFixed(2)}" fill="none" stroke="#ffffff" stroke-width="${Math.max(1, mark * 0.13).toFixed(2)}"></path>`);
        }
        const textX = left + mark + 7;
        const right = left + cellWidth - 3;
        const fontSize = Math.max(10, Math.min(lineHeight * 0.42, cellWidth * 0.14));
        parts.push(this._svgText(item.label, textX, cy, fontSize, {
          anchor: "start", bold: false, minSize: 9, color: this._templateInk(item.color), maxWidth: right - textX,
        }));
        if (item.done && row.strike) {
          const width = Math.min(this._svgTextWidth(item.label, fontSize, false), right - textX);
          parts.push(this._svgHairline(textX, cy, width, 1));
        }
      });
      return parts.join("");
    }
    const lineHeight = box.h / (items.length || 1);
    // Same floor as the multi-column branch above, for the same reason.
    const mark = Math.max(6, Math.min(lineHeight * 0.5, box.w * 0.11));
    const boxed = mark >= 7;
    const fontSize = Math.max(row.compact ? 10 : 8.5, Math.min(lineHeight * 0.6, box.w * 0.12));
    const parts = [];
    items.forEach((item, index) => {
      const cy = box.y + lineHeight * (index + 0.5);
      const left = box.x;
      if (row.marker === "dot") {
        parts.push(item.done
          ? `<circle cx="${(left + mark / 2).toFixed(2)}" cy="${cy.toFixed(2)}" r="${(mark / 2).toFixed(2)}" fill="${this._markerInk(item.color, row, true)}" stroke="${BLACK}" stroke-width="1"></circle>`
          : `<circle cx="${(left + mark / 2).toFixed(2)}" cy="${cy.toFixed(2)}" r="${(mark / 2).toFixed(2)}" fill="#ffffff" stroke="${BLACK}" stroke-width="1"></circle>`);
      } else {
        parts.push(`<rect x="${left.toFixed(2)}" y="${(cy - mark / 2).toFixed(2)}" width="${mark.toFixed(2)}" height="${mark.toFixed(2)}"`
          + ` fill="${item.done ? this._markerInk(item.color, row, boxed) : "#ffffff"}"${boxed ? ` stroke="${BLACK}" stroke-width="1"` : ""}></rect>`);
        if (item.done) {
          parts.push(`<path d="M${(left + mark * 0.22).toFixed(2)} ${(cy).toFixed(2)} L${(left + mark * 0.44).toFixed(2)} ${(cy + mark * 0.24).toFixed(2)}`
            + ` L${(left + mark * 0.8).toFixed(2)} ${(cy - mark * 0.26).toFixed(2)}" fill="none" stroke="#ffffff" stroke-width="${Math.max(1, mark * 0.14).toFixed(2)}"></path>`);
        }
      }
      const textX = left + mark + Math.max(2, mark * 0.4);
      const right = box.x + box.w;
      parts.push(this._svgText(item.label, textX, cy, fontSize, { anchor: "start", bold: !!item.bold, minSize: row.compact ? 8.5 : undefined, color: this._templateInk(item.color), maxWidth: right - textX }));
      // A struck-through line says "already handled" without spending a column on
      // a second state word next to every item.
      if (item.done && row.strike) {
        const width = Math.min(this._svgTextWidth(item.label, fontSize, !!item.bold), right - textX);
        parts.push(this._svgHairline(textX, cy, width, 1));
      }
    });
    return parts.join("");
  },

  // Equal columns, each a small stack of label, icon and value - the same idea as
  // the red footer, in black on white and at whatever size the row is given.
  _blockStrip(row, box) {
    const cells = row.strip;
    const cellWidth = box.w / (cells.length || 1);
    // Without icons there is no middle row to sit around, so label and value close
    // up instead of leaving a gap where the icon would have been.
    const iconed = cells.some((cell) => cell.icon);
    // `valueIcon` is an opt-in second presentation for an iconed strip: instead
    // of the classic label/icon/value stack (forecast days - see weather.js,
    // and the live "day" automation binding that redraws it server-side in
    // svg_blocks.py, which only ever calls the classic layout and so has
    // nothing to mirror here), the icon sits beside the number on the same
    // line, sized to read as a real glyph instead of a decoration squeezed
    // into its own row. No template currently binds a `valueIcon` strip to a
    // live automation, so this branch has no backend counterpart to keep in
    // sync - see svg_blocks.py's block_strip docstring.
    const inline = iconed && !!row.valueIcon;
    const labelY = box.y + box.h * (inline ? 0.26 : iconed ? 0.16 : 0.3);
    const valueY = box.y + box.h * (inline ? 0.68 : iconed ? 0.85 : 0.72);
    let valueFontSize = Math.max(10, Math.min(box.h * 0.32, cellWidth * 0.33));
    if (row.compact) valueFontSize = Math.max(11, valueFontSize);
    const parts = [];
    // A short secondary strip cannot carry label + icon + value as three
    // vertical rows. Collapse it to a single bold fact per cell before the
    // glyphs touch; the primary graph/dial above keeps the visual hierarchy.
    if (row.compact && box.h < 34) {
      cells.forEach((cell, index) => {
        const cx = box.x + cellWidth * (index + 0.5);
        if (index > 0) parts.push(this._svgHairline(box.x + cellWidth * index, box.y + box.h * 0.12, 1, box.h * 0.76));
        const fact = [cell.label, cell.value].filter((part) => part != null && part !== "").join(" ");
        parts.push(this._svgText(fact, cx, box.y + box.h * 0.5, Math.max(10, box.h * 0.46), {
          bold: false, minSize: 9, maxWidth: cellWidth * 0.9,
        }));
      });
      return parts.join("");
    }
    cells.forEach((cell, index) => {
      const cx = box.x + cellWidth * (index + 0.5);
      if (index > 0) parts.push(this._svgHairline(box.x + cellWidth * index, box.y + box.h * 0.12, 1, box.h * 0.76));
      // maxWidth here is a soft target, not a hard measurement: the glyph-width
      // table behind it is an estimate (there is no way to measure real text
      // extents inside a detached SVG string - see the file header), and it can
      // run a little narrow for glyphs it does not special-case, like the "³"
      // in "0,84 m³". A value sized right up to that edge used to land close
      // enough that a small estimation error tipped it into ellipsis-clipping
      // instead of just shrinking a few px. Sizing a bit under the box's own
      // ceiling leaves that error margin instead of spending it.
      parts.push(this._svgText(cell.label, cx, labelY, Math.max(row.compact ? 9.5 : 8.5, Math.min(box.h * 0.25, cellWidth * 0.3)), { bold: !row.compact, minSize: row.compact ? 8.5 : undefined, maxWidth: cellWidth * 0.92 }));
      if (cell.icon && inline) {
        // Roughly double the classic layout's icon again (bounded by
        // min(h*0.34, cw*0.5)) - it only has to share one line with the value
        // now instead of squeezing into the strip's own cramped middle row.
        const margin = cellWidth * 0.02;
        // Reserved up front, not clamped in afterwards: the value's own fitted
        // width is measured against a budget that already has this much taken
        // off its right side, so the finished group is guaranteed to land at
        // least `shift` right of a plain flush-left position instead of
        // growing to fill whatever space shrinking the icon freed up.
        const shift = cellWidth * 0.1;
        const iconSize = Math.min(box.h * 0.66, cellWidth * 0.36);
        const gap = iconSize * 0.16;
        const valueMaxWidth = Math.max(10, cellWidth - margin * 2 - shift - iconSize - gap);
        const fitted = this._svgReadableText(cell.value, valueFontSize, valueMaxWidth, true);
        const valueWidth = this._svgTextWidth(fitted.text, fitted.fontSize, true);
        const groupWidth = iconSize + gap + valueWidth;
        const cellLeft = box.x + cellWidth * index;
        const cellRight = cellLeft + cellWidth;
        const groupLeft = cellRight - margin - groupWidth;
        const iconCx = groupLeft + iconSize / 2;
        // iconBadge: a solid colour disc behind the glyph instead of colouring
        // the glyph (and value text) itself. Yellow reads fine as a filled
        // shape but is close to unreadable as thin icon/text strokes on white -
        // this opts a strip into carrying its accent colour as a real design
        // element instead. Label stays black either way (see above); the value
        // stays black here too so the badge is the only coloured thing in the
        // cell.
        if (row.iconBadge) {
          const badgeR = iconSize * 0.62;
          const badgeFill = this._templateInk(cell.color);
          // Decided from the *resolved* fill, not the requested colour name: a
          // "yellow" badge degrades to solid red on hardware without a yellow
          // pigment (_templateInk's own fallback), and a black glyph on that
          // red reads just as poorly as it would have on a genuinely red
          // badge - the glyph has to follow wherever the badge actually
          // landed, not what it was asked for.
          parts.push(`<circle cx="${iconCx.toFixed(2)}" cy="${valueY.toFixed(2)}" r="${badgeR.toFixed(2)}" fill="${badgeFill}"></circle>`);
          parts.push(this._svgIcon(cell.icon, iconCx, valueY, iconSize * 0.64, badgeFill === RED ? "#ffffff" : BLACK));
          parts.push(this._svgText(cell.value, groupLeft + iconSize + gap, valueY, valueFontSize, {
            anchor: "start", bold: true, maxWidth: valueMaxWidth,
          }));
          return;
        }
        parts.push(this._svgIcon(cell.icon, iconCx, valueY, iconSize, this._templateInk(cell.iconColor ?? cell.color)));
        parts.push(this._svgText(cell.value, groupLeft + iconSize + gap, valueY, valueFontSize, {
          anchor: "start", bold: true, color: this._templateInk(cell.color), maxWidth: valueMaxWidth,
        }));
        return;
      }
      // 0.50 (was 0.40, before that 0.34) - still clears the label above
      // (ends ~28% down) and the value below (starts ~69% down) with a small
      // margin either side, but reads as a noticeably bigger glyph than the
      // old ratio did. The only caller of this branch is weather.js's
      // forecast strip (svg_blocks.py's block_strip mirrors this ratio for
      // the live-bound automatic refresh - keep both in sync).
      if (cell.icon) parts.push(this._svgIcon(cell.icon, cx, box.y + box.h * 0.5, Math.min(box.h * 0.50, cellWidth * 0.62), this._templateInk(cell.iconColor ?? cell.color)));
      parts.push(this._svgText(cell.value, cx, valueY, valueFontSize, { bold: true, color: this._templateInk(cell.color), maxWidth: cellWidth * 0.92 }));
    });
    return parts.join("");
  },

  // Two readings of equal standing, divided down the middle. Stacked they read as
  // first and second; side by side they read as a pair, which is what "next two
  // collections" actually is.
  _blockSplit(row, box) {
    const halves = row.split;
    const cellWidth = box.w / (halves.length || 1);
    const parts = [];
    const isBanner = row.banner || row.card;
    if (isBanner) {
      const fill = row.color === "red" ? RED : "#ffffff";
      const stroke = row.color === "red" ? "none" : BLACK;
      parts.push(`<rect x="${box.x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${box.w.toFixed(2)}" height="${box.h.toFixed(2)}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.2"></rect>`);
    }
    if (row.compact && box.h < 38) {
      halves.forEach((half, index) => {
        const cx = box.x + cellWidth * (index + 0.5);
        if (index > 0) {
          const divColor = (isBanner && row.color === "red") ? "#ffffff" : BLACK;
          parts.push(this._svgHairline(box.x + cellWidth * index, box.y + box.h * 0.12, 1, box.h * 0.76, divColor));
        }
        const fact = [half.label, half.value].filter((part) => part != null && part !== "").join(" ");
        parts.push(this._svgText(fact, cx, box.y + box.h * 0.5, Math.max(10.5, box.h * 0.45), {
          bold: false,
          minSize: 9,
          color: (isBanner && row.color === "red") ? "#ffffff" : BLACK,
          maxWidth: cellWidth * 0.9,
        }));
      });
      return parts.join("");
    }
    halves.forEach((half, index) => {
      const cx = box.x + cellWidth * (index + 0.5);
      if (index > 0) {
        const divColor = (isBanner && row.color === "red") ? "#ffffff" : BLACK;
        parts.push(this._svgHairline(box.x + cellWidth * index, box.y + box.h * 0.12, 1, box.h * 0.76, divColor));
      }
      const hasIcon = Boolean(half.icon);
      const labelY = box.y + box.h * (hasIcon ? 0.22 : 0.28);
      const valY = box.y + box.h * (hasIcon ? 0.76 : 0.72);
      const labelSize = Math.max(row.compact ? 10 : 9, Math.min(box.h * 0.22, cellWidth * 0.22));
      const valSize = Math.max(row.compact ? 13 : 12, Math.min(box.h * 0.44, cellWidth * 0.42));

      const isRedBanner = isBanner && row.color === "red";
      const defaultTextColor = isRedBanner ? "#ffffff" : BLACK;
      const labelColor = isRedBanner ? (half.color === "red" ? "#ffcccc" : "#e0e0e0") : BLACK;
      const valColor = half.color ? this._templateInk(half.color) : defaultTextColor;

      if (half.label) {
        parts.push(this._svgText(half.label, cx, labelY, labelSize, { bold: true, color: labelColor, maxWidth: cellWidth * 0.92 }));
      }
      if (half.icon) {
        parts.push(this._svgIcon(half.icon, cx, box.y + box.h * 0.48, Math.min(box.h * 0.28, cellWidth * 0.35), this._templateInk(half.iconColor) || valColor));
      }
      if (half.value) {
        parts.push(this._svgText(half.value, cx, valY, valSize, { bold: true, color: valColor, maxWidth: cellWidth * 0.92 }));
      }
    });
    return parts.join("");
  },

  // Two deliberately independent panels. Unlike the generic landscape row
  // regrouping this keeps a visual (ring/stat/date) beside a vertical fact
  // list, which is essential on 250x128 where stacking makes both too small.
  _blockDuo(row, box) {
    const ratio = Math.max(0.3, Math.min(0.7, Number(row.duo.ratio) || 0.5));
    const gap = row.compact ? 5 : Math.max(5, box.w * 0.025);
    const leftWidth = Math.max(1, (box.w - gap) * ratio);
    const rightX = box.x + leftWidth + gap;
    const rightWidth = Math.max(1, box.w - leftWidth - gap);
    const left = { ...(row.duo.left || {}), compact: row.compact };
    const right = { ...(row.duo.right || {}), compact: row.compact };
    const leftBox = { x: box.x, y: box.y, w: leftWidth, h: box.h, fullX: box.x, fullW: leftWidth };
    const rightBox = { x: rightX, y: box.y, w: rightWidth, h: box.h, fullX: rightX, fullW: rightWidth };
    return this._renderTemplateBlock(left, leftBox)
      + this._svgHairline(box.x + leftWidth + gap / 2, box.y + box.h * 0.08, 1, box.h * 0.84)
      + this._renderTemplateBlock(right, rightBox);
  },

  _blockSplitDates(row, box) {
    const dates = row.splitDates || [];
    const cellWidth = box.w / Math.max(1, dates.length);
    const parts = [];
    dates.forEach((item, index) => {
      const cellBox = { x: box.x + cellWidth * index, y: box.y, w: cellWidth, h: box.h, fullX: box.fullX, fullW: box.fullW };
      if (index > 0) parts.push(this._svgHairline(box.x + cellWidth * index, box.y + box.h * 0.08, 1, box.h * 0.84));
      if (item && item.datebox) {
        const itemMarkup = this._blockDatebox(item, cellBox);
        parts.push(item.group && itemMarkup ? `<g data-template-block="${this._escape(item.group)}">${itemMarkup}</g>` : itemMarkup);
      }
    });
    return parts.join("");
  },

  _blockSpark(row, box) {
    const values = (row.spark.values || []).map(Number).filter(Number.isFinite);
    if (values.length < 2) return "";
    const top = Math.max(...values);
    const bottom = Math.min(...values);
    const span = top - bottom || 1;
    const step = box.w / (values.length - 1);
    const points = values.map((value, index) => [box.x + step * index, box.y + box.h - ((value - bottom) / span) * box.h]);
    const lineWidth = Math.max(row.compact ? 2 : 1.5, box.h * 0.045);
    const path = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    // The yellow accent used to be three polylines stacked on top of each
    // other - a fat black one, a yellow one inside it and a black one inside
    // that - which came out as a black caterpillar with a yellow rim rather
    // than as a chart. Yellow belongs under the curve instead: an area is what
    // the colour needs to read at all, and it says "how much" the way a line
    // alone cannot.
    const area = row.spark.accent === "yellow" && this._accentYellow(row);
    const parts = [
      ...(area ? [
        `<polygon points="${box.x.toFixed(2)},${(box.y + box.h).toFixed(2)} ${path} `
          + `${(box.x + box.w).toFixed(2)},${(box.y + box.h).toFixed(2)}" fill="${YELLOW}"></polygon>`,
      ] : []),
      this._svgHairline(box.x, box.y + box.h, box.w, 1),
      `<polyline points="${path}" fill="none" stroke="${this._templateInk(row.spark.color)}"`
        + ` stroke-width="${lineWidth.toFixed(2)}" stroke-linejoin="round" stroke-linecap="round"></polyline>`,
    ];
    const [lastX, lastY] = points[points.length - 1];
    parts.push(`<circle cx="${lastX.toFixed(2)}" cy="${lastY.toFixed(2)}" r="${Math.max(1.5, box.h * 0.08).toFixed(2)}" fill="${RED}"></circle>`);
    if (row.spark.caption != null) parts.push(this._svgText(row.spark.caption, box.x, box.y + box.h * 0.14, Math.max(row.compact ? 10 : 8.5, box.h * 0.22), { anchor: "start", bold: false, minSize: row.compact ? 9 : undefined, maxWidth: box.w * 0.6 }));
    return parts.join("");
  },

  // A boxed date beside its entries. A calendar that looks like a calendar is read
  // at a glance; the same information as a list of lines is not.
  _blockDatebox(row, box) {
    const date = row.datebox;
    const side = Math.min(box.h * 0.92, box.w * 0.3);
    const left = box.x;
    const top = box.y + (box.h - side) / 2;
    const parts = [`<rect x="${left.toFixed(2)}" y="${top.toFixed(2)}" width="${side.toFixed(2)}" height="${side.toFixed(2)}" fill="none" stroke="${BLACK}" stroke-width="1"></rect>`];
    parts.push(`<rect x="${left.toFixed(2)}" y="${top.toFixed(2)}" width="${side.toFixed(2)}" height="${(side * 0.28).toFixed(2)}" fill="${this._templateInk(date.color)}"></rect>`);
    parts.push(this._svgText(date.month, left + side / 2, top + side * 0.15, Math.max(row.compact ? 9.5 : 8.5, side * 0.22), { color: "#ffffff", bold: true, minSize: row.compact ? 8.5 : undefined, maxWidth: side * 0.92 }));
    parts.push(this._svgText(date.day, left + side / 2, top + side * 0.64, Math.max(row.compact ? 13 : 11, side * 0.5), { bold: true, minSize: row.compact ? 10 : undefined, maxWidth: side * 0.86 }));
    const textX = left + side + Math.max(3, side * 0.16);
    const right = box.x + box.w;
    const lines = (date.lines || []).filter((line) => line != null && line !== "");
    const lineHeight = box.h / Math.max(1, lines.length);
    lines.forEach((line, index) => {
      const size = index === 0 ? lineHeight * 0.56 : lineHeight * 0.42;
      parts.push(this._svgText(line, textX, box.y + lineHeight * (index + 0.5), Math.max(row.compact ? 9.5 : 8.5, size), {
        anchor: "start", bold: index === 0 && !row.compact, minSize: row.compact ? 8.5 : undefined, color: index === 0 ? this._templateInk(date.color) : BLACK, maxWidth: right - textX,
      }));
    });
    return parts.join("");
  },

  // The price itself, and what a promotion does to it.
  //
  // On promotion the old price is struck through above the new one and the whole
  // block reverses out of a filled panel, so a shopper reads "this is cheaper than
  // it was" from across the aisle without reading either number. That is the entire
  // job of a shelf label, and it is why the promotion is a switch on the template
  // rather than yet another value someone has to bind an entity to.
  _blockPriceTag(row, box) {
    const tag = row.pricetag;
    const sale = !!tag.sale;
    const parts = [];
    if (!sale && tag.accent === "yellow" && this._displaySupportsYellow?.()) {
      parts.push(`<rect x="${(box.x + 3).toFixed(2)}" y="${(box.y + 3).toFixed(2)}" width="${Math.max(1, box.w - 6).toFixed(2)}" height="${Math.max(1, box.h - 6).toFixed(2)}" fill="none" stroke="${YELLOW}" stroke-width="5"></rect>`);
      parts.push(`<rect x="${(box.x + 1).toFixed(2)}" y="${(box.y + 1).toFixed(2)}" width="${Math.max(1, box.w - 2).toFixed(2)}" height="${Math.max(1, box.h - 2).toFixed(2)}" fill="none" stroke="${BLACK}" stroke-width="1"></rect>`);
    }
    if (sale) {
      parts.push(`<rect x="${box.x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${box.w.toFixed(2)}" height="${box.h.toFixed(2)}" fill="${RED}"></rect>`);
    }
    const ink = sale ? "#ffffff" : BLACK;
    const cx = box.x + box.w / 2;
    let top = box.y + box.h * 0.06;
    if (sale && tag.was) {
      const wasSize = Math.max(6, Math.min(box.h * 0.17, box.w * 0.13));
      const wasY = top + wasSize * 0.6;
      parts.push(this._svgText(tag.was, cx, wasY, wasSize, { color: ink, maxWidth: box.w * 0.7 }));
      // The strike is what makes it a former price rather than a second one.
      const struck = Math.min(this._svgTextWidth(tag.was, wasSize, false), box.w * 0.7);
      parts.push(this._svgHairline(cx - struck / 2, wasY, struck, Math.max(1, wasSize * 0.09), ink));
      top = wasY + wasSize * 0.55;
    }
    const priceHeight = box.y + box.h * (tag.unit ? 0.82 : 0.94) - top;
    const unitRatio = 0.36;
    const span = (size) => this._svgTextWidth(tag.price, size, true)
      + (tag.currency ? this._svgTextWidth(` ${tag.currency}`, size * unitRatio, true) : 0);
    let size = Math.max(9, priceHeight * 0.86);
    if (span(size) > box.w * 0.94) size = Math.max(8, (size * box.w * 0.94) / span(size));
    const left = cx - span(size) / 2;
    const baseline = top + priceHeight * 0.55;
    parts.push(this._svgText(tag.price, left, baseline, size, { anchor: "start", bold: true, color: ink }));
    if (tag.currency) {
      parts.push(this._svgText(tag.currency, left + this._svgTextWidth(tag.price, size, true) + size * unitRatio * 0.3,
        baseline + size * 0.24, size * unitRatio, { anchor: "start", bold: true, color: ink }));
    }
    if (tag.unit) {
      parts.push(this._svgText(tag.unit, cx, box.y + box.h * 0.91, Math.max(5, Math.min(box.h * 0.13, box.w * 0.1)), { color: ink, maxWidth: box.w * 0.92 }));
    }
    return parts.join("");
  },

  // A real, scannable code.
  //
  // The Wi-Fi template used to show a QR in its catalog thumbnail while the picture
  // actually sent to the tag had none - the thumbnail was a different renderer, and
  // nothing reconciled the two. Modules are snapped to whole device pixels and drawn
  // as one path with crisp edges, because a module landing on a half pixel comes out
  // grey, and the three-colour quantiser then turns that grey into whichever of
  // black or white it is nearer - which is how a code stops scanning.
  _blockQr(row, box) {
    const text = String(row.qr.text ?? "");
    if (!text) return "";
    const code = qrcode(0, row.qr.correction || "M");
    code.addData(text);
    try {
      code.make();
    } catch (_error) {
      // Too much data for the largest symbol; a missing code beats a broken one.
      return "";
    }
    const modules = code.getModuleCount();
    const quiet = 2;
    const side = Math.min(box.w, box.h);
    const cell = Math.max(1, Math.floor(side / (modules + quiet * 2)));
    const drawn = cell * modules;
    const margin = cell * quiet;
    const x = Math.round(box.x + (box.w - drawn) / 2);
    const y = Math.round(box.y + (box.h - drawn) / 2);
    let path = "";
    for (let rowIndex = 0; rowIndex < modules; rowIndex++) {
      for (let column = 0; column < modules; column++) {
        if (code.isDark(rowIndex, column)) {
          path += `M${x + column * cell} ${y + rowIndex * cell}h${cell}v${cell}h${-cell}z`;
        }
      }
    }
    const framed = row.qr.accent === "yellow" && this._displaySupportsYellow?.();
    const frameX = x - margin;
    const frameY = y - margin;
    const frameSize = drawn + margin * 2;
    const frame = framed
      ? `<rect x="${(frameX - 3).toFixed(0)}" y="${(frameY - 3).toFixed(0)}" width="${(frameSize + 6).toFixed(0)}" height="${(frameSize + 6).toFixed(0)}" fill="${YELLOW}" stroke="${BLACK}" stroke-width="1" shape-rendering="crispEdges"></rect>`
      : "";
    return frame + `<rect x="${frameX.toFixed(0)}" y="${frameY.toFixed(0)}" width="${frameSize.toFixed(0)}"`
      + ` height="${(drawn + margin * 2).toFixed(0)}" fill="#ffffff"></rect>`
      + `<path d="${path}" fill="${BLACK}" shape-rendering="crispEdges"></path>`;
  },

  // ------------------------------------------------------------- branding ---

  // INTERNAL / NOT FOR THE PUBLIC RELEASE - see PRIVATE-NOTES.md.
  //
  // The DRÁTEK.CZ lockup, drawn as a dithered copy of the integration's own
  // artwork (frontend/dratek-eink-logo.png and its wide sibling) rather than as
  // native SVG.
  //
  // This block used to redraw the mark from type and rectangles. That printed
  // sharply, but an approximation of a logo is the one thing a logo may not be:
  // the letterforms were Arial rather than the real face, and the Eink screen
  // was a pair of stroked rectangles standing in for the actual artwork.
  // Dithering the real file through the same Floyd-Steinberg pass an imported
  // photo takes keeps the true shapes, and turns the teal and the orange into
  // texture instead of letting a flat threshold reduce both to solid black.
  //
  // Everything here is the bitmap's placement only; the pixels are prepared by
  // panel-brand-logo.mixin.js, which owns the palette and the cache. The
  // request below is what starts that work - the same lazily-drawn arrangement
  // _blockCustomImage uses, because this method is synchronous and the dither
  // is not.
  _blockBrandLogo(row, box) {
    const stacked = !!row.brandLogo?.stacked;
    const width = Math.max(1, Math.round(box.fullW ?? box.w));
    const height = Math.max(1, Math.round(box.h));
    const bitmap = this._brandLogoDitherEntry?.(stacked, width, height);
    if (!bitmap) {
      this._requestBrandLogoDither?.(stacked, width, height);
      // Blank rather than a placeholder: this panel is about to show a logo,
      // and a flash of "loading" art reads as the wrong content, not as a
      // loading state.
      return `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>`;
    }
    // Already dithered at exactly this pixel size, so nothing here may resample
    // it - "none" makes the placement a straight 1:1 blit.
    return `<image x="0" y="0" width="${width}" height="${height}" href="${this._escape(bitmap)}"`
      + ` preserveAspectRatio="none" image-rendering="auto"></image>`;
  },

  // Two raster blocks in an otherwise all-vector renderer: landscape slots
  // place the forecast on the left; portrait slots place it below the map.
  // Both are
  // embedded as <image> rather than redrawn here so the sidebar's layout and
  // the map's projection/border-drawing code stay in one place (render.py),
  // not duplicated between Python and this file - see _ensureTemplateRadarImage
  // for why both are fetched at exactly this block's own pixel sizes rather
  // than one bitmap letterboxed to fit two differently-shaped areas.
  //
  // The fetch is asynchronous and this method is not, so it can only ever draw
  // whatever _ensureTemplateRadarImage last cached - never block layout waiting
  // on a network round trip. The very first render of a fresh session draws the
  // placeholder box below and repaints once the fetch resolves.
  _blockRadarMap(row, box) {
    const x = row.bleed ? box.fullX : box.x;
    const w = row.bleed ? box.fullW : box.w;
    const cached = this._meteoradarImageCache;
    const layout = this._radarBlockLayout(w, box.h);
    if (cached?.dataUrl) {
      if (layout.portrait) {
        const forecastY = box.y + layout.mapH;
        const map = `<image data-radar-part="map" x="${x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${layout.mapW.toFixed(2)}" height="${layout.mapH.toFixed(2)}"`
          + ` preserveAspectRatio="xMidYMid meet" href="${cached.dataUrl}"></image>`;
        const divider = this._svgHairline(x, forecastY, w, 2);
        const forecast = cached.sidebarDataUrl
          ? `<image data-radar-part="sidebar" x="${x.toFixed(2)}" y="${forecastY.toFixed(2)}" width="${layout.forecastW.toFixed(2)}" height="${layout.forecastH.toFixed(2)}"`
            + ` preserveAspectRatio="none" href="${cached.sidebarDataUrl}"></image>`
          : "";
        return map + divider + forecast;
      }
      const mapX = x + layout.forecastW;
      const forecast = cached.sidebarDataUrl
        ? `<image data-radar-part="sidebar" x="${x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${layout.forecastW.toFixed(2)}" height="${layout.forecastH.toFixed(2)}"`
          + ` preserveAspectRatio="none" href="${cached.sidebarDataUrl}"></image>`
        : "";
      const divider = this._svgHairline(mapX, box.y, 2, box.h);
      const map = `<image data-radar-part="map" x="${mapX.toFixed(2)}" y="${box.y.toFixed(2)}" width="${layout.mapW.toFixed(2)}" height="${layout.mapH.toFixed(2)}"`
        + ` preserveAspectRatio="xMidYMid meet" href="${cached.dataUrl}"></image>`;
      return forecast + divider + map;
    }
    const label = cached?.error
      ? `Radarová mapa se nenačetla: ${cached.error}`
      : "Načítám radarovou mapu…";
    return `<rect x="${x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${w.toFixed(2)}" height="${box.h.toFixed(2)}"`
      + ` fill="#ffffff" stroke="${BLACK}" stroke-width="1"></rect>`
      + this._svgText(label, x + w / 2, box.y + box.h / 2, Math.max(9, box.h * 0.09), { maxWidth: w * 0.92 });
  },

  // A departure board: the line number lives in a filled badge, so it is found by
  // shape before anything is read.
  // The same departures board given two lines per service instead of one.
  //
  // A portrait panel is narrow, and one line had to carry the line number, the
  // destination and the countdown side by side; on a 168 px-wide tag the
  // destination was squeezed to the readability floor and then ellipsised away,
  // which is the one field nobody can guess. Splitting the service across two
  // lines gives the destination the whole width and leaves the times a line of
  // their own, where the scheduled clock time fits next to the countdown.
  //
  // The left column stays a column: the line plate on the first line, the
  // vehicle glyph directly under it on the second, so "which line, what kind of
  // vehicle" is one glance down the margin rather than a hunt across the row.
  _blockBoardTwoLine(row, box) {
    const items = row.board || [];
    const lineHeight = box.h / (items.length || 1);
    const badgeWidth = Math.min(box.w * 0.26, lineHeight * 0.95);
    const badgeHeight = lineHeight * 0.36;
    const right = box.x + box.w;
    const textX = box.x + badgeWidth + Math.max(3, badgeWidth * 0.18);
    // One size per column, chosen so the longest entry in it fits, rather than
    // letting every row shrink to fit on its own. Independent fitting is what a
    // single _svgText call does, and it printed a short destination at 29 px
    // directly above a long one at 17 px - a departures board where the type
    // size tells you nothing except how many letters the word has reads as
    // broken, not as emphasis.
    const fit = (size, values, maxWidth, bold) => values.reduce(
      (smallest, value) => Math.min(smallest, this._svgFitFontSize(value, size, maxWidth, bold, 8.5)),
      size,
    );
    const titleSize = fit(
      Math.max(10, Math.min(lineHeight * 0.30, box.w * 0.13)),
      items.map((item) => item.label), right - textX, true,
    );
    // The clock and the countdown share the second line and therefore share one
    // size, derived from the pair that needs the most room. Sizing them
    // separately - the countdown first, the clock into whatever was left -
    // clipped the clock to "07:…" on a 128 px-wide tag, and a departure time
    // with its minutes cut off is worse than no departure time at all. Text
    // width scales linearly with the font size, so the largest size that fits
    // is arithmetic rather than a search.
    const baseTime = Math.max(10, Math.min(lineHeight * 0.26, box.w * 0.11));
    const timesWidth = Math.max(1, right - textX);
    const timeSize = items.reduce((size, item) => {
      const unit = this._svgTextWidth(item.clock, 1, true)
        + this._svgTextWidth(item.value, 1, false) + 0.6;
      return unit > 0 ? Math.min(size, timesWidth / unit) : size;
    }, baseTime);
    const clockSize = Math.max(8.5, timeSize);
    const valueSize = clockSize;
    const valueWidth = items.reduce(
      (widest, item) => Math.max(widest, this._svgTextWidth(item.value, valueSize, false)), 0,
    );
    const parts = [];
    items.forEach((item, index) => {
      const top = box.y + lineHeight * index;
      const titleCy = top + lineHeight * 0.31;
      const timesCy = top + lineHeight * 0.73;
      const chipInk = this._templateInk(item.color);
      // Same plate rules as the one-line board - see _blockBoard.
      const filled = !!row.filled;
      const accent = filled && item.color !== "red" && this._accentYellow(row);
      const plate = !filled ? "none" : accent ? YELLOW : chipInk;
      const digitInk = !filled ? chipInk : accent ? BLACK : "#ffffff";
      // Two lines per service need a rule between services, or the second line
      // of one reads as the first line of the next.
      if (index > 0) parts.push(this._svgHairline(box.x, top, box.w, 1));
      parts.push(`<rect x="${box.x.toFixed(2)}" y="${(titleCy - badgeHeight / 2).toFixed(2)}" width="${badgeWidth.toFixed(2)}" height="${badgeHeight.toFixed(2)}"`
        + ` rx="2" fill="${plate}" stroke="${accent ? BLACK : chipInk}" stroke-width="1"></rect>`);
      parts.push(this._svgText(item.badge, box.x + badgeWidth / 2, titleCy, Math.max(10, badgeHeight * 0.72), {
        color: digitInk, bold: true, minSize: 8.5, maxWidth: badgeWidth * 0.88,
      }));
      if (item.icon) {
        parts.push(this._svgIcon(item.icon, box.x + badgeWidth / 2, timesCy, Math.min(lineHeight * 0.30, badgeWidth * 0.62), chipInk));
      }
      parts.push(this._svgText(item.label, textX, titleCy, titleSize, {
        anchor: "start", bold: true, minSize: 8.5, maxWidth: right - textX,
      }));
      // The clip guard has to be measured with the size the run is actually
      // drawn at, not with the requested one: a guard computed from baseTime
      // sat a few pixels tighter than the arithmetic above had allowed for and
      // ellipsised a clock that fits. Half a gap rather than a whole one keeps
      // a little slack for the rounding.
      parts.push(this._svgText(item.clock, textX, timesCy, clockSize, {
        anchor: "start", bold: true, minSize: 8.5,
        maxWidth: Math.max(1, timesWidth - valueWidth - clockSize * 0.5),
      }));
      parts.push(this._svgText(item.value, right, timesCy, valueSize, {
        anchor: "end", bold: false, minSize: 8.5, color: chipInk, maxWidth: box.w * 0.46,
      }));
    });
    return parts.join("");
  },

  _blockBoard(row, box) {
    if (row.twoLine) return this._blockBoardTwoLine(row, box);
    const items = row.board;
    const lineHeight = box.h / (items.length || 1);
    const badgeWidth = Math.min(box.w * 0.22, lineHeight * 1.5);
    const badgeHeight = lineHeight * 0.68;
    const right = box.x + box.w;
    const parts = [];
    items.forEach((item, index) => {
      const cy = box.y + lineHeight * (index + 0.5);
      const chipInk = this._templateInk(item.color);
      // A line number is a plate, not an outline - that is what makes a
      // departures board read as one. On a four-colour panel the plate is
      // yellow with the digits in black, which keeps the page light; a red
      // badge stays red and a three-colour panel falls back to a dark plate
      // with the digits knocked out. Boards whose badge is a status glyph
      // rather than a number (presence) leave `filled` off and keep the
      // outline, because a filled plate would claim a meaning the glyph
      // inside it is already carrying.
      const filled = !!row.filled;
      const accent = filled && item.color !== "red" && this._accentYellow(row);
      const plate = !filled ? "none" : accent ? YELLOW : chipInk;
      const digitInk = !filled ? chipInk : accent ? BLACK : "#ffffff";
      parts.push(`<rect x="${box.x.toFixed(2)}" y="${(cy - badgeHeight / 2).toFixed(2)}" width="${badgeWidth.toFixed(2)}" height="${badgeHeight.toFixed(2)}"`
        + ` rx="2" fill="${plate}" stroke="${accent ? BLACK : chipInk}" stroke-width="1"></rect>`);
      parts.push(this._svgText(item.badge, box.x + badgeWidth / 2, cy, Math.max(row.compact ? 10 : 8.5, badgeHeight * 0.65), { color: digitInk, bold: true, minSize: row.compact ? 8.5 : undefined, maxWidth: badgeWidth * 0.88 }));
      const textX = box.x + badgeWidth + Math.max(3, badgeWidth * 0.2);
      const valueWidth = box.w * 0.26;
      parts.push(this._svgText(item.label, textX, cy, Math.max(row.compact ? 10 : 8.5, Math.min(lineHeight * 0.52, box.w * 0.12)), {
        anchor: "start", bold: false, minSize: row.compact ? 8.5 : undefined, maxWidth: right - textX - valueWidth,
      }));
      parts.push(this._svgText(item.value, right, cy, Math.max(row.compact ? 11 : 9.5, Math.min(lineHeight * 0.56, box.w * 0.13)), {
        anchor: "end", bold: !row.compact, minSize: row.compact ? 9 : undefined, color: this._templateInk(item.color), maxWidth: valueWidth,
      }));
    });
    return parts.join("");
  },

  // ------------------------------------------------------------- template ---

  // Declarative content of every template. `v(index, fallback)` resolves the
  // Home Assistant binding for that variable slot, falling back to sample data.
  // Kept separate from _templateSvgRows so the icon warm-up can enumerate the
  // ids without a second copy of the list drifting out of step with this one.
  // `resolveValue`, when given, replaces the normal v(index, fallback) lookup.
  // The only caller that does this is _templateVariableCropBoxes, which needs
  // to know which row a variable index ends up in without caring what value
  // it actually holds.
  //
  // Each template's own row layout lives in its own file under ./templates/
  // (see templates/index.js) - this just rebuilds the live
  // v/series/ratio/day/event/option closures for the requested template and
  // hands them to that template's `design` function. The variable indices are
  // fixed by each template's own catalog entry - v(0) is that template's
  // first bound entity - so a template's arrangement can change freely but
  // its numbering cannot.
  // `width`/`height`, when known, are the panel pixels the finished rows will
  // actually be laid out into - passed through so a template can choose a
  // genuinely different row set for a badge-sized tag versus a wall-mounted
  // panel, not just let the same rows get proportionally squeezed. Both are
  // undefined for callers that build rows without a real target size (icon
  // warm-up enumerating every template's icon names); a template that reads
  // them has to treat that as "assume the common case", the same way it
  // already treats a disconnected entity as "assume the sample value".
  _templateSvgSpecs(template, resolveValue, width, height) {
    const v = resolveValue || ((index, fallback) => this._templateDisplayValue(template, index, fallback));
    // Charts, meters and dials need numbers rather than formatted strings, and the
    // weather and calendar rows need data that arrives from a service call. All of
    // them fall back to the sample so a template still reads as itself before any
    // entity is bound.
    const series = (index, fallback) => this._templateSeries(template, index, fallback);
    const ratio = (index, fallback) => this._templatePercent(template, index, fallback) / 100;
    const day = (index) => this._templateForecastDay(template, index);
    const conditionIcon = (fallback) => this._templateCurrentConditionIcon(template, fallback);
    const event = (index) => this._templateCalendarEntry(template, index);
    const option = (name) => this._templateOptionActive(template, name);
    const transit = () => {
      const config = this._displayTemplateConfig || {};
      const preview = this._transitPreview && this._transitPreview.stop_id === config.transit_stop_id
        ? this._transitPreview
        : null;
      return {
        stop_name: preview?.stop_name || config.transit_stop_name || "Hlavní nádraží",
        departures: Array.isArray(preview?.departures) ? preview.departures : [],
      };
    };
    const customImage = () => {
      const active = this._activeCustomImageAsset?.();
      // No fallback to the raw parrot-source.png here on purpose: it is a
      // full-colour photo, and painting it - even for the instant before the
      // real dither pass finishes - reads as a flash of wrong content, not a
      // loading state. _blockCustomImage draws a blank box instead when this
      // comes back empty, and _requestCustomImageSlotDither/
      // _preloadCustomImageForSlot replace it with the actual dithered render
      // (starting from that same source) as soon as it is ready.
      return active ? this._paletteImageSrc?.(active) : this._customImageDataUrl;
    };
    const helpers = { v, series, ratio, day, conditionIcon, event, option, transit, customImage, width, height };
    return Object.fromEntries(
      DISPLAY_TEMPLATES.map((entry) => [entry.catalog.id, () => entry.design(helpers)]),
    );
  },

  // Most built-in templates are authored against the full BWRY palette. Two content
  // blocks get a yellow accent, the footer remains the red status band, and the
  // uncoloured content stays black on white. Yellow is carried by real surfaces
  // (outlined bands, flat outlined MDI glyphs, chart underlays), not by a fragile thin
  // glyph alone. Keeping this as one shared theme means every current and future
  // catalog template uses all four pigments without duplicating palette rules.
  // _templateInk is the single hardware adaptation point: on a BWR display it
  // maps every yellow accent to red before the SVG is rasterized.
  _fourColorTemplateRows(rows, templateId = "") {
    const themed = structuredClone(Array.isArray(rows) ? rows : []);
    // These five templates have their own deliberately tuned renderer and
    // palette. A global theme must never recolour or restructure them.
    const protectedTemplates = new Set(["custom_image", "weather", "radar", "cz_spot_prices", "calendar"]);
    if (protectedTemplates.has(String(templateId || ""))) return themed;
    // Yellow is for graphic detail only, and only where the detail has enough
    // area to read: gauge arcs, ring and dial fills, a datebox header, a QR
    // frame. It is deliberately NOT used for line-art glyphs - a 17px icon in
    // yellow on white has almost no contrast and comes out as a smudge once
    // the panel thresholds it - and never for type, nor as a fill
    // behind type. Both of those used to happen here: a text or stat row got
    // accent:"yellow", which paints a full slab under the words, and one cell
    // of every list/grid/strip had its text recoloured yellow. On a panel that
    // thresholds each pixel with no dithering, yellow type is the weakest
    // thing on the screen, and a yellow slab behind a heading reads as a
    // highlighter mark rather than as design.
    //
    // It also fixes a real manual/automatic split: svg_blocks.py has no yellow
    // at all (its ink() returns only red or black), so every yellow this pass
    // painted onto a live-data row vanished the moment the backend redrew it.
    const paintYellow = (row) => {
      if (!row) return false;
      if (row.duo) {
        const left = paintYellow(row.duo.left);
        const right = paintYellow(row.duo.right);
        return left || right;
      }
      if (row.qr) { row.qr.accent = "yellow"; return true; }
      for (const key of ["ring", "dial", "spark", "pricetag"]) {
        if (row[key] && typeof row[key] === "object") { row[key].accent = "yellow"; return true; }
      }
      if (row.datebox) {
        row.datebox.color = "yellow";
        return true;
      }
      return false;
    };
    let painted = 0;
    for (const row of themed) {
      if (painted >= 2) break;
      if (row?.footer || row?.flex || row?.gap || row?.radarMap || row?.customImage) continue;
      if (paintYellow(row)) painted += 1;
    }
    themed.forEach((row) => { row.modern = true; });
    return themed;
  },

  _templateSvgRows(template, width, height) {
    const baseTemplate = this._templateBaseDefinition(template);
    if (baseTemplate?.id === "blank" || (baseTemplate?.user_created && !baseTemplate?.base_template_id)) return [];
    const build = this._templateSvgSpecs(baseTemplate, undefined, width, height)[baseTemplate?.id];
    let rows = build ? build() : [
      { icon: "shape-outline", h: 0.22 },
      { text: baseTemplate?.title || "Šablona", h: 0.1, size: 0.07, bold: true },
      { flex: true },
    ];
    const compactLandscapeIds = new Set([
      "air", "birthdays", "garden", "home", "living", "parcel", "presence", "price", "security",
      "server", "shopping", "solar", "thermostat", "transport", "washer", "waste", "water", "wifi",
    ]);
    const compactLandscape = compactLandscapeIds.has(baseTemplate?.id)
      && Number(width) >= Number(height) && Number(height) <= 160;
    if (compactLandscape) rows = rows.map((row) => ({ ...row, compact: true }));
    return this._fourColorTemplateRows(rows, baseTemplate?.id);
  },

  // Where each variable's value actually lands in the rendered template, as a
  // box in the same coordinate space the SVG is drawn in - so the settings
  // dialog can crop straight into the real markup instead of drawing its own
  // stand-in preview that could silently drift out of sync with it.
  //
  // Found by asking the row builder for v(index) a second time with every
  // call replaced by a unique marker string, then scanning the resulting rows
  // for which one absorbed which marker. Box geometry never depends on what
  // v() returns (row heights are fixed fractions, not measured from text), so
  // the swapped-out rows lay out identically to the real ones and the row
  // that got the marker is exactly the row the real value would have landed
  // in. series()/ratio()/day()/event()/option() - chart data, forecasts,
  // calendar entries, the price-tag sale switch - are left resolving for
  // real, since a marker string in a number-typed slot would break the chart
  // math; those variables simply come back without a box, and the caller
  // falls back to the old icon-only preview for just those few.
  _templateVariableCropBoxes(template, width, height) {
    const baseTemplate = this._templateBaseDefinition(template);
    const build = this._templateSvgSpecs(baseTemplate, (index) => `VAR${index}`, width, height)[baseTemplate?.id];
    const rows = build ? build() : [];
    if (!rows.length) return {};
    rows.forEach((row, index) => { row.__rowIndex = index; });
    const collector = [];
    this._layoutTemplateSvg(rows, width, height, collector);
    const rowBoxes = {};
    collector.forEach(({ rowIndex, box }) => { if (!(rowIndex in rowBoxes)) rowBoxes[rowIndex] = box; });
    const scan = (value) => {
      if (typeof value === "string") return [...value.matchAll(/VAR(\d+)/g)].map((match) => Number(match[1]));
      if (Array.isArray(value)) return value.flatMap(scan);
      if (value && typeof value === "object") return Object.values(value).flatMap(scan);
      return [];
    };
    const boxes = {};
    rows.forEach((row) => {
      const box = rowBoxes[row.__rowIndex];
      if (!box) return;
      scan(row).forEach((variableIndex) => { boxes[variableIndex] ??= box; });
    });
    return boxes;
  },

  // Boxes (and the row spec itself, for its static caption/label/colour
  // strings) for the graphical rows series()/ratio()/day()/event() draw (a
  // sparkline, a gauge, a forecast strip, a calendar entry) - keyed by the
  // row's own `group` tag, the same one _stackTemplateBlocks wraps in
  // <g data-template-block="..."> so the panel can find and blank the drawn
  // shape later. Reuses the exact box-collection technique
  // _templateVariableCropBoxes uses for text slots: box geometry is a side
  // effect of the real layout pass, not worth recomputing separately.
  _templateGraphicRowBoxes(template, width, height) {
    // The rows have to be the ones the document is actually built from, not a
    // second batch straight out of _templateSvgSpecs. _templateSvgRows is what
    // stamps `compact` and `modern` on them, and the layout reads both: a
    // compact landscape template is padded by 3 px where a plain one is padded
    // by round(min(w, h) * 0.045) - 6 px on a 296x128 tag. Building raw rows
    // here therefore measured every graphic row in a layout three pixels
    // narrower on each side than the one that got drawn, so an automatic
    // refresh cleared the wrong rectangle and redrew the row a few pixels off
    // from where the manual send had put it. On a departures board that showed
    // up as the old rows still visible underneath the new ones. It also left
    // `compact` off the binding, so the backend redrew the row with the
    // full-size type minimums.
    const rows = this._templateSvgRows(template, width, height);
    if (!rows.length) return {};
    rows.forEach((row, index) => { row.__rowIndex = index; });
    const collector = [];
    this._layoutTemplateSvg(rows, width, height, collector);
    const rowBoxes = {};
    collector.forEach(({ rowIndex, box }) => { if (!(rowIndex in rowBoxes)) rowBoxes[rowIndex] = box; });
    const entries = {};
    rows.forEach((row) => {
      if (!row.group) return;
      const box = rowBoxes[row.__rowIndex];
      if (box) entries[row.group] = { box, row };
    });
    return entries;
  },

  // The crop itself: the same full-template markup real bindings would
  // produce, windowed to just one variable's box via viewBox instead of a
  // redrawn miniature - so it is the actual template at 1:1, not a rendition
  // of it that could disagree on a font size or a color.
  // ---------------------------------------------------------------- export ---

  // Builds the complete SVG document for one or two templates at the display's
  // native resolution. Large displays use the shared layout grid, from one
  // full-screen template up to a 2 × 3 dashboard of six templates.
  async _buildDisplayTemplateSvg(templates, width, height, layout = "single") {
    if (!templates.some(Boolean)) throw new Error("Není vybrána žádná šablona.");

    const slots = this._displayTemplateLayoutSlots?.(layout, width, height)
      || [{ x: 0, y: 0, w: width, h: height, index: 0 }];

    const bodies = [];
    // Index into `templates` positionally, not into a Boolean-filtered copy -
    // a blank slot must stay a gap (skipped, background shows through) so a
    // template that comes after it in the array keeps landing in its own
    // chosen slot instead of sliding forward to fill the gap.
    for (let index = 0; index < slots.length; index++) {
      const template = templates[index];
      if (!template) continue;
      const slot = slots[index];
      const rows = this._templateSvgRows(template, slot.w, slot.h);
      await this._preloadTemplateIcons(rows);
      await this._preloadTemplateRadarImage(rows, slot.w, slot.h);
      await this._preloadTemplateTransitBoard(rows);
      await this._preloadCustomImageForSlot?.(rows, slot.w, slot.h);
      await this._preloadBrandLogoDither?.(rows, slot.w, slot.h);
      const slotName = index === 0 ? "primary" : index === 1 ? "secondary" : `slot-${index + 1}`;
      const markup = this._applyTemplateAdjustmentsToSvgMarkup(this._layoutTemplateSvg(rows, slot.w, slot.h), template, slotName);
      // data-template-slot lets the automation capture find a block inside the
      // slot it actually belongs to. Without it the capture matched
      // [data-template-block] across the whole document, so two templates that
      // both use the same block name (two charts, say) fought over the first
      // slot's node - one overwrote the other's id and the later slots were
      // never bound at all, which shipped them with no values and no chart.
      bodies.push(`<g data-template-slot="${index}" transform="translate(${slot.x.toFixed(2)},${slot.y.toFixed(2)})">`
        + `<rect x="0" y="0" width="${slot.w.toFixed(2)}" height="${slot.h.toFixed(2)}" fill="#ffffff"></rect>`
        + markup + `</g>`);
    }
    const definition = this._displayTemplateLayoutDefinition?.(layout) || { columns: 1, rows: 1 };
    const transposed = height > width;
    // Rounded the same way _snapLayoutSlot rounds the slots themselves, so the
    // divider sits exactly on the seam instead of half a pixel inside one of
    // the two cells it separates.
    const edge = (position, total) => Math.round(position * total);
    if (definition.id === "mixed-5") {
      if (transposed) {
        const splitX = edge(1 / 3, width);
        bodies.push(`<rect x="${splitX.toFixed(2)}" y="0" width="1" height="${height}" fill="${BLACK}"></rect>`);
        bodies.push(`<rect x="0" y="${edge(1 / 2, height).toFixed(2)}" width="${splitX.toFixed(2)}" height="1" fill="${BLACK}"></rect>`);
        for (let row = 1; row < 3; row++) {
          const y = edge(row / 3, height);
          bodies.push(`<rect x="${splitX.toFixed(2)}" y="${y.toFixed(2)}" width="${(width - splitX).toFixed(2)}" height="1" fill="${BLACK}"></rect>`);
        }
      } else {
        const splitY = edge(1 / 3, height);
        bodies.push(`<rect x="0" y="${splitY.toFixed(2)}" width="${width}" height="1" fill="${BLACK}"></rect>`);
        bodies.push(`<rect x="${edge(1 / 2, width).toFixed(2)}" y="0" width="1" height="${splitY.toFixed(2)}" fill="${BLACK}"></rect>`);
        for (let column = 1; column < 3; column++) {
          const x = edge(column / 3, width);
          bodies.push(`<rect x="${x.toFixed(2)}" y="${splitY.toFixed(2)}" width="1" height="${(height - splitY).toFixed(2)}" fill="${BLACK}"></rect>`);
        }
      }
    } else {
      const columns = transposed ? definition.rows : definition.columns;
      const rows = transposed ? definition.columns : definition.rows;
      for (let column = 1; column < columns; column++) {
        const x = edge(column / columns, width);
        bodies.push(`<rect x="${x.toFixed(2)}" y="0" width="1" height="${height}" fill="${BLACK}"></rect>`);
      }
      for (let row = 1; row < rows; row++) {
        const y = edge(row / rows, height);
        bodies.push(`<rect x="0" y="${y.toFixed(2)}" width="${width}" height="1" fill="${BLACK}"></rect>`);
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
      + `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"></rect>`
      + bodies.join("")
      + `</svg>`;
  },

  // Rasterizes the SVG at exactly the panel's resolution and quantizes it to the
  // exact palette the target hardware can actually show.
  _quantizeEinkPixel(red, green, blue) {
    // Bright pixels are white; among the dark ones, a bright red channel means
    // red. Antialiasing between a black glyph and a red area lands on dark warm
    // pixels such as rgb(150, 20, 15) - those stay black here, which is what
    // keeps black text from picking up a red rim.
    //
    // Must stay identical to bwr_masks in render.py, thresholds included, or a
    // panel-rendered manual send and a backend-rendered automatic update put
    // different pixels on the same display.
    const yellow = red >= 161 && green >= 128 && blue < 96;
    if (yellow) return this._displaySupportsYellow?.() ? [244, 196, 0] : [220, 20, 12];
    const luminance = (red * 38 + green * 75 + blue * 15) >> 7;
    if (luminance >= 161) return [255, 255, 255];
    // BWR_RED in render.py.
    return red >= 161 ? [220, 20, 12] : [0, 0, 0];
  },

  // `paintOverlay` draws on top of the finished template, in device pixels, before
  // the three-colour quantiser runs - anything painted after it would be off the
  // palette the panel can actually show.
  async _rasterizeDisplayTemplateSvg(templates, width, height, layout = "single", paintOverlay = null) {
    const svg = await this._buildDisplayTemplateSvg(templates, width, height, layout);
    return this._rasterizeSvgStringToPng(svg, width, height, paintOverlay);
  },

  // The rasterise/quantise tail of _rasterizeDisplayTemplateSvg, split out so a
  // caller that already has a ready SVG string - e.g. a clone of the captured
  // template with its dynamic values blanked out, for automation.py's
  // clean_background tier - can reuse it without re-running _buildDisplayTemplateSvg
  // (which would re-fetch the radar camera frame and other live data unnecessarily).
  async _rasterizeSvgStringToPng(svg, width, height, paintOverlay = null) {
    const bitmap = new Image();
    await new Promise((resolve, reject) => {
      bitmap.onload = resolve;
      bitmap.onerror = () => reject(new Error("Šablonu se nepodařilo převést na obrázek."));
      bitmap.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    if (paintOverlay) paintOverlay(context, width, height);

    const pixels = context.getImageData(0, 0, width, height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const red = pixels.data[index];
      const green = pixels.data[index + 1];
      const blue = pixels.data[index + 2];
      const color = this._quantizeEinkPixel(red, green, blue);
      pixels.data[index] = color[0];
      pixels.data[index + 1] = color[1];
      pixels.data[index + 2] = color[2];
      pixels.data[index + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png");
  },
};
