// One file per template (see ./weather.js, ./price.js, ...), each carrying
// its catalog entry, Home Assistant setup guide and SVG design together.
// This file just gathers them into the shapes the rest of the panel already
// expects: an ordered list, the plain catalog array, and a lookup by id.
//
// Order here is display order in the catalog grid - it has no other meaning,
// so a new template can be inserted wherever it reads best.
import { template as weather } from "./weather.js";
import { template as radar } from "./radar.js";
import { template as czSpotPrices } from "./cz_spot_prices.js";
import { template as home } from "./home.js";
import { template as waste } from "./waste.js";
import { template as solar } from "./solar.js";
import { template as washer } from "./washer.js";
import { template as living } from "./living.js";
import { template as presence } from "./presence.js";
import { template as wifi } from "./wifi.js";
import { template as calendar } from "./calendar.js";
import { template as security } from "./security.js";
import { template as transport } from "./transport.js";
import { template as shopping } from "./shopping.js";
import { template as air } from "./air.js";
import { template as thermostat } from "./thermostat.js";
import { template as water } from "./water.js";
import { template as parcel } from "./parcel.js";
import { template as birthdays } from "./birthdays.js";
import { template as server } from "./server.js";
import { template as garden } from "./garden.js";
import { template as price } from "./price.js";
import { template as shadingTest } from "./shading_test.js";
import { template as shadingLightTest } from "./shading_light_test.js";
import { template as shadingDarkTest } from "./shading_dark_test.js";
import { template as shadingWarmTest } from "./shading_warm_test.js";
import { template as shadingCompleteTest } from "./shading_complete_test.js";

export const DISPLAY_TEMPLATES = [
  weather,
  radar,
  czSpotPrices,
  home,
  waste,
  solar,
  washer,
  living,
  presence,
  wifi,
  calendar,
  security,
  transport,
  shopping,
  air,
  thermostat,
  water,
  parcel,
  birthdays,
  server,
  garden,
  price,
  shadingTest,
  shadingLightTest,
  shadingDarkTest,
  shadingWarmTest,
  shadingCompleteTest,
];

export const DISPLAY_TEMPLATE_CATALOG = DISPLAY_TEMPLATES.map((entry) => entry.catalog);

export const DISPLAY_TEMPLATES_BY_ID = Object.fromEntries(
  DISPLAY_TEMPLATES.map((entry) => [entry.catalog.id, entry]),
);
