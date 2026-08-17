// One file per template (see ./weather.js, ./price.js, ...), each carrying
// its catalog entry, Home Assistant setup guide and SVG design together.
// This file just gathers them into the shapes the rest of the panel already
// expects: an ordered list, the plain catalog array, and a lookup by id.
//
// Order here is display order in the catalog grid - it has no other meaning,
// so a new template can be inserted wherever it reads best.
import { template as weather } from "./weather.js";
import { template as radar } from "./radar.js";
import { template as customImage } from "./custom_image.js";
import { template as czSpotPrices } from "./cz_spot_prices.js";

// Everything below is parked in ./nenastaveno/ while each one gets verified
// again one at a time - move a file back up next to weather.js/radar.js
// (fixing its "../shared.js" import back to "./shared.js" if it has one),
// uncomment its import and its DISPLAY_TEMPLATES entry below, confirm it
// still renders and binds correctly, then move on to the next.
// import { template as home } from "./nenastaveno/home.js";
// import { template as waste } from "./nenastaveno/waste.js";
// import { template as solar } from "./nenastaveno/solar.js";
// import { template as washer } from "./nenastaveno/washer.js";
// import { template as living } from "./nenastaveno/living.js";
// import { template as presence } from "./nenastaveno/presence.js";
// import { template as wifi } from "./nenastaveno/wifi.js";
// import { template as calendar } from "./nenastaveno/calendar.js";
// import { template as security } from "./nenastaveno/security.js";
// import { template as transport } from "./nenastaveno/transport.js";
// import { template as shopping } from "./nenastaveno/shopping.js";
// import { template as air } from "./nenastaveno/air.js";
// import { template as thermostat } from "./nenastaveno/thermostat.js";
// import { template as water } from "./nenastaveno/water.js";
// import { template as parcel } from "./nenastaveno/parcel.js";
// import { template as birthdays } from "./nenastaveno/birthdays.js";
// import { template as server } from "./nenastaveno/server.js";
// import { template as garden } from "./nenastaveno/garden.js";
// import { template as price } from "./nenastaveno/price.js";

export const DISPLAY_TEMPLATES = [
  customImage,
  weather,
  radar,
  czSpotPrices,
  // home,
  // waste,
  // solar,
  // washer,
  // living,
  // presence,
  // wifi,
  // calendar,
  // security,
  // transport,
  // shopping,
  // air,
  // thermostat,
  // water,
  // parcel,
  // birthdays,
  // server,
  // garden,
  // price,
];

export const DISPLAY_TEMPLATE_CATALOG = DISPLAY_TEMPLATES.map((entry) => entry.catalog);

export const DISPLAY_TEMPLATES_BY_ID = Object.fromEntries(
  DISPLAY_TEMPLATES.map((entry) => [entry.catalog.id, entry]),
);
