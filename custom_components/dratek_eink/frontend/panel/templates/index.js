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
import { template as wifi } from "./wifi.js?v=compact-landscape-content-6";
import { template as calendar } from "./calendar.js";
import { template as security } from "./security.js?v=yellow-shaded-accents-1";
import { template as transport } from "./transport.js?v=yellow-shaded-accents-1";
import { template as shopping } from "./shopping.js?v=compact-landscape-content-6";
import { template as air } from "./air.js?v=compact-landscape-content-6";
import { template as thermostat } from "./thermostat.js?v=compact-landscape-content-6";
import { template as water } from "./water.js?v=compact-landscape-content-6";
import { template as parcel } from "./parcel.js?v=yellow-shaded-accents-1";
import { template as birthdays } from "./birthdays.js?v=compact-landscape-content-6";
import { template as server } from "./server.js?v=yellow-shaded-accents-1";
import { template as garden } from "./garden.js?v=compact-landscape-content-6";
import { template as price } from "./price.js?v=yellow-shaded-accents-1";

export const DISPLAY_TEMPLATES = [
  customImage,
  weather,
  radar,
  czSpotPrices,
  calendar,
  home,
  living,
  thermostat,
  security,
  presence,
  transport,
  shopping,
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
  wifi,
];

export const DISPLAY_TEMPLATE_CATALOG = DISPLAY_TEMPLATES.map((entry) => entry.catalog);

export const DISPLAY_TEMPLATES_BY_ID = Object.fromEntries(
  DISPLAY_TEMPLATES.map((entry) => [entry.catalog.id, entry]),
);
