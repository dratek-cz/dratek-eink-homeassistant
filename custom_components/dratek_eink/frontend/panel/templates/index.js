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
import { template as home } from "./home.js?v=compact-landscape-content-6";
import { template as waste } from "./waste.js?v=compact-landscape-content-6";
import { template as solar } from "./solar.js?v=compact-landscape-content-6";
import { template as washer } from "./washer.js?v=compact-landscape-content-6";
import { template as living } from "./living.js?v=compact-landscape-content-6";
import { template as presence } from "./presence.js?v=compact-landscape-content-6";
import { template as wifi } from "./wifi.js?v=wifi-credentials-1";
import { template as calendar } from "./calendar.js";
import { template as security } from "./security.js?v=yellow-shaded-accents-1";
import { template as transport } from "./transport.js?v=transit-clock-footer-1";
import { template as shopping } from "./shopping.js?v=shopping-live-list-1";
import { template as air } from "./air.js?v=air-gauge-first-1";
import { template as thermostat } from "./thermostat.js?v=thermostat-dial-curve-2";
import { template as water } from "./water.js?v=water-chart-rebalance-1";
import { template as parcel } from "./parcel.js?v=yellow-shaded-accents-1";
import { template as birthdays } from "./birthdays.js?v=compact-landscape-content-6";
import { template as server } from "./server.js?v=yellow-shaded-accents-1";
import { template as garden } from "./garden.js?v=compact-landscape-content-6";
import { template as price } from "./price.js?v=yellow-shaded-accents-1";
// INTERNAL - remove with the rest of the brand-logo feature before the retail
// release (PRIVATE-NOTES.md). Imported last so it also sits last in the grid.
import { template as dratekLogo } from "./dratek_logo.js?v=logo-dither-1";

export const DISPLAY_TEMPLATES = [
  customImage,
  weather,
  radar,
  czSpotPrices,
  calendar,
  transport,
  // Next to the departures board on purpose: both are the "what do I need to
  // know on the way out of the door" pair, and both now read a real list from
  // Home Assistant rather than printing a sample of one.
  shopping,
  // Beside the shopping list on purpose: both are the household's own notes
  // pinned to a display - one you read on the way out, one you hand to a guest.
  wifi,
  home,
  living,
  thermostat,
  security,
  presence,
  air,
  water,
  parcel,
  birthdays,
  server,
  garden,
  price,
  waste,
  solar,
  washer,
  // Always the last tile in the catalog - it is not a template anyone
  // arranges next to another, it is a one-click room reset.
  dratekLogo,
];

export const DISPLAY_TEMPLATE_CATALOG = DISPLAY_TEMPLATES.map((entry) => entry.catalog);

export const DISPLAY_TEMPLATES_BY_ID = Object.fromEntries(
  DISPLAY_TEMPLATES.map((entry) => [entry.catalog.id, entry]),
);
