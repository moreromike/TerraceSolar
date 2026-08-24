/* Terrace Solar — progressive enhancement only.
   The page is fully readable and usable with JavaScript disabled; this
   script plays the autoplay hero loop, reveals sections lightly as they
   scroll into view, and drives the configurator/calculator readouts.
   Nothing here hijacks scroll, calls preventDefault, or maps scroll
   position to video currentTime. */

/* ---------------------------------------------------------------------------
   Generic scroll reveal: fade + slight rise, one-shot, for any [data-reveal]
   element. Reduced-motion and no-IntersectionObserver visitors just see the
   content immediately - this is decoration, never a gate on reading it.
--------------------------------------------------------------------------- */
(function () {
  'use strict';
  var els = [].slice.call(document.querySelectorAll('[data-reveal]'));
  if (!els.length) return;

  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motionQuery.matches || !window.IntersectionObserver) {
    els.forEach(function (el) { el.classList.add('is-shown'); });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-shown');
      io.unobserve(entry.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

  els.forEach(function (el) { io.observe(el); });
})();


/* ---------------------------------------------------------------------------
   Hero: autoplay cinematic loop.

   No scroll listener, no rAF loop, no currentTime writes, no waiting for
   scroll or IntersectionObserver to fire before starting - the hero is
   always above the fold, so playback starts the instant the browser will
   allow it. A poster image is always painted first and stays visible until
   a frame has actually decoded (.film--ready); if the browser blocks
   autoplay outright, the poster remains and the first click/tap anywhere
   on the page retries play() (which always satisfies autoplay policy).

   This is a muted, looping, decorative background loop - no scroll-linked
   or flashing motion - so it is intentionally NOT gated behind
   prefers-reduced-motion, the same choice most premium sites make for
   ambient hero video. Reduced motion still fully applies everywhere else
   on the page (scroll reveals, transitions - see the global CSS rule and
   initReveal above).

   Reusable pattern: any future CinematicSection can reuse this same shape
   of controller against a different root - it only depends on the
   data-*-src attributes and the .film__video/__poster structure, not on
   anything hero-specific.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var root = document.querySelector('[data-hero]');
  if (!root) return;

  var video = root.querySelector('[data-hero-video]');
  if (!video) return;

  /* Belt-and-suspenders for iOS Safari: the muted HTML attribute is
     usually enough, but setting the IDL properties directly guarantees
     the element is actually muted before any play() is attempted. */
  video.muted = true;
  video.defaultMuted = true;

  var mobileQuery = window.matchMedia('(max-width: 767px)');
  var dataset = root.dataset || {};
  var src = (mobileQuery.matches && dataset.heroSrcMobile) || dataset.heroSrc;
  if (!src) return;
  var rate = parseFloat(dataset.heroRate) || 1;

  function applyRate() { video.playbackRate = rate; }

  /* Chrome can abort/suspend playback of muted background video it decides
     is decorative - both on the very first play() (before the element has
     laid out: "video-only background media was paused to save power") and,
     separately, at every loop restart (the native `loop` seek-to-0 counts
     as a fresh autoplay attempt subject to the same heuristic). Neither is
     a real "autoplay blocked" case - a prompt retry reliably clears it. So
     rather than treat every 'pause' as final, treat any pause we didn't
     ask for ourselves as something to recover from automatically, with a
     short retry chain that only gives up and waits for a real interaction
     (which always satisfies autoplay policy) after repeated failures. */
  var intentionalPause = false;
  var retryTimer = null;

  function tryPlay(onFail) {
    var p = video.play();
    if (p && p.catch) { p.catch(onFail || function () {}); }
  }

  function pauseIntentionally() {
    intentionalPause = true;
    video.pause();
  }

  function resume() {
    intentionalPause = false;
    tryPlay();
  }

  video.addEventListener('pause', function () {
    if (intentionalPause || video.ended) return;
    if (retryTimer) return; /* a retry is already in flight */
    retryTimer = window.setTimeout(function () {
      retryTimer = null;
      tryPlay(function () {
        /* still blocked after a prompt retry - wait for a real interaction */
        function onInteract() { tryPlay(); }
        document.addEventListener('click', onInteract, { once: true });
        document.addEventListener('touchstart', onInteract, { once: true, passive: true });
        document.addEventListener('keydown', onInteract, { once: true });
      });
    }, 200);
  });

  video.addEventListener('loadedmetadata', applyRate);
  video.addEventListener('loadeddata', function () {
    root.classList.add('film--ready');
  });

  /* First play attempt, once there's an actual frame to show - calling
     play() any earlier (readyState 0) is the single biggest trigger for
     the power-save abort above, so this alone clears most of the risk;
     the 'pause' watchdog above is what recovers if it happens anyway. */
  video.addEventListener('canplay', function firstPlay() {
    video.removeEventListener('canplay', firstPlay);
    applyRate();
    tryPlay();
  });

  video.addEventListener('error', function () {
    if (window.console) console.error('[hero] video failed to load:', src, video.error);
  });

  var attached = false;
  function attach() {
    if (attached) return;
    attached = true;
    video.setAttribute('src', src);
    video.load();
    /* the 'pause' watchdog above covers the actual first play attempt too -
       video.load() leaves the element paused, and this first pause is
       exactly what triggers the watchdog's retry chain */
  }
  attach();

  /* Pause off-screen video for performance, resume when it scrolls back. */
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      if (!attached) return;
      var visible = entries[0].isIntersecting;
      if (visible && video.paused) { resume(); }
      else if (!visible && !video.paused) { pauseIntentionally(); }
    }, { rootMargin: '200px' }).observe(root);
  }

  document.addEventListener('visibilitychange', function () {
    if (!attached) return;
    if (document.visibilityState === 'visible') {
      resume();
    } else {
      pauseIntentionally();
    }
  });
})();



/* ---------------------------------------------------------------------------
   SDG&E Solar Savings Calculator - "Find my system."

   REBUILT 2026-08-24. The previous model computed
   `production x flat self-consumption% x flat rate`, using a single
   occupancy-keyed self-consumption percentage (e.g. "mixed" = 30-35%
   regardless of anything else) borrowed from large-rooftop-system thinking,
   where production routinely exceeds household load. For a 400-1200 W
   plug-in system that assumption is backwards: a small system's output is
   usually well within a household's continuous daytime draw (fridge, HVAC,
   electronics, standby loads), so self-consumption is normally HIGH, and it
   should fall as the SYSTEM gets big relative to the HOUSEHOLD, not
   according to a fixed lookup table. This file replaces that model with an
   explicit physical flow:

     household usage -> estimated solar production -> estimated household
     daytime load -> direct self-consumption (whichever is smaller) ->
     excess solar -> battery charging (capacity-limited) -> round-trip
     losses -> battery discharge (valued at the peak rate it displaces) ->
     remaining unused/exported energy (uncompensated, not counted) ->
     avoided-cost calculation -> monthly/annual savings, capped so avoided
     energy never exceeds actual household usage and avoided cost never
     exceeds the customer's own stated/implied bill.

   No hourly interval data exists for this, so the household-load and
   production-window figures below are explicit, named, conservative
   approximations - not measurements. They are centralized here so a single
   changed constant updates every downstream number; nothing is
   hard-coded inside the calculation functions themselves.

   SDG&E residential rate assumptions
   Verified: 2026-08-24
   Source: SDG&E TOU-DR1 rate tables - see assets/products/rates-san-diego.json
   for the exact source URLs (summer peak ~69.65c/kWh, winter peak ~48c/kWh).
   touElec/flat/other remain PROVISIONAL, not tariff-verified - do not
   present those three as exact.

   Inland vs. coastal now affects SOLAR PRODUCTION only (sun exposure /
   marine-layer cloudiness), never the electricity RATE - no SDG&E TOU-DR1
   tariff charges a different retail $/kWh by inland/coastal location, so
   the previous model's "Inland = $0.73/kWh vs Coastal = $0.55/kWh" was not
   representing a real rate distinction. Keeping production and rate as two
   separate factors, rather than one blended number, is what fixes that.

   This is a starting-point estimator, not an engineering tool, a quote, or
   a guarantee. See the in-UI "See assumptions" disclosure for the
   customer-facing version of these notes.
--------------------------------------------------------------------------- */

var SEASONS = { summerMonths: 4, winterMonths: 8 }; // Jun-Sep / Oct-May

var SOLAR_ASSUMPTIONS = {
  /* San Diego baseline; not the customer's actual rooftop/balcony sun -
     shading, orientation and weather vary. Held constant across seasons
     (5.75 is already treated as an annual average), same simplification
     the previous model used. */
  peakSunHours: 5.75,
  /* Real-world system efficiency / derate (wiring, temperature, soiling,
     inverter conversion, connector losses). 82-88% is a typical range for
     a well-sited small system; 85% is the documented default actually
     used below - the old code's "6.9 kWh/day after losses" figure was
     never run through a derate factor at all. */
  systemEfficiency: 0.85,
  /* Coastal San Diego sees somewhat more marine-layer cloud cover than
     inland; modest, not dramatic, per the source instructions. */
  coastalProductionFactor: 0.93,
  /* Approximate hours per day production is high enough to matter, used
     only to convert an average daytime load (kW) into a comparable energy
     cap (kWh) against production - not a claim about sunrise/sunset. */
  productionWindowHours: 10,
  /* Even in a household whose average daytime draw comfortably exceeds a
     small system's average output, production is peaked around solar noon
     while load is comparatively flatter, so some midday surplus almost
     always exists. Caps direct self-consumption below 100% even when the
     load-vs-production ratio alone would suggest full absorption - this is
     what keeps a battery meaningfully useful even in "load-rich" homes,
     and keeps the no-battery case from claiming production it likely
     couldn't have fully soaked up in the same instant it was made. */
  maxDirectCoincidence: 0.85,
  daysPerMonth: 30.4
};

/* Average daytime (production-window) household power draw, expressed as a
   multiple of the home's 24-hour average power draw. >1 means the home
   draws MORE than average during the day (people home, AC, cooking); <1
   means less (still running the fridge, router, standby loads, maybe a
   pool pump, just without a fully-occupied daytime). This is what lets
   self-consumption scale with the actual relationship between usage and
   system size instead of a fixed per-occupancy percentage. */
var DAYTIME_LOAD_FACTOR = {
  usuallyHome: 1.20,
  mixed: 0.90,
  mostlyAway: 0.65
};

var BATTERY_ASSUMPTIONS = {
  /* 85-92% is a typical round-trip range for LiFePO4 battery systems;
     88% used as the documented default. Never treated as 100%. */
  roundTripEfficiency: 0.88,
  /* Default assumed storage size by system size, used only because this
     calculator's battery input is a simple on/off switch (the Shop
     configurator's 1-4 kWh selector is a separate, more precise control).
     Non-binding guidance, same role the old storageSuggestion field played. */
  defaultKwhBySize: { 400: 1, 800: 1, 1200: 1.5, 1600: 2, 2000: 3 }
};

/* SDG&E residential rate assumptions - see file header for source/date.
   One flat number per period per plan; touDr1 is the only one cross-checked
   against a live source this pass. */
var RATE_ASSUMPTIONS = {
  touDr1: {
    summer: { superOffPeak: 0.2500, offPeak: 0.4756, peak: 0.6965 },
    winter: { superOffPeak: 0.2800, offPeak: 0.3400, peak: 0.4800 }
  },
  /* PROVISIONAL - not verified against a current published tariff. */
  touElec: {
    summer: { superOffPeak: 0.22, offPeak: 0.40, peak: 0.55 },
    winter: { superOffPeak: 0.24, offPeak: 0.29, peak: 0.40 }
  },
  /* PROVISIONAL - approximate flat/tiered blended rate, no TOU component;
     same figure in every period so the weighting math below still applies
     unchanged rather than needing a separate code path. */
  flat: {
    summer: { superOffPeak: 0.32, offPeak: 0.32, peak: 0.32 },
    winter: { superOffPeak: 0.30, offPeak: 0.30, peak: 0.30 }
  },
  /* Used for "Other" plans - deliberately conservative/generic; the UI
     tells the customer this estimate is less precise. */
  other: {
    summer: { superOffPeak: 0.28, offPeak: 0.28, peak: 0.28 },
    winter: { superOffPeak: 0.26, offPeak: 0.26, peak: 0.26 }
  }
};

/* How UNSTORED solar production is distributed across TOU periods for a
   typical San Diego daylight production curve (panel output roughly
   9am-6pm, tapering at the edges). Most lands in off-peak/super-off-peak;
   a modest tail overlaps the start of the evening peak window (peak starts
   at 4pm in summer, so long summer days genuinely do overlap it a little).
   Weights sum to 1 per season. This single mechanism is what values direct
   solar at a blended rate instead of the old model's TWO overlapping
   mechanisms (a self-consumption % AND a separate "peak usage share"
   discount) - replacing both avoids double-discounting the same effect. */
var SOLAR_TOU_DISTRIBUTION = {
  summer: { superOffPeak: 0.30, offPeak: 0.55, peak: 0.15 },
  winter: { superOffPeak: 0.35, offPeak: 0.55, peak: 0.10 }
};

/* Battery-shifted energy is deliberately moved to displace the single most
   expensive period, so it's valued at that season's peak rate - not a
   further-discounted or further-inflated number. */
function peakRateFor(plan, season) {
  var r = RATE_ASSUMPTIONS[plan] || RATE_ASSUMPTIONS.other;
  return r[season].peak;
}

function blendedDirectRate(plan, season) {
  var r = (RATE_ASSUMPTIONS[plan] || RATE_ASSUMPTIONS.other)[season];
  var w = SOLAR_TOU_DISTRIBUTION[season];
  return r.superOffPeak * w.superOffPeak + r.offPeak * w.offPeak + r.peak * w.peak;
}

/* Approximate share of a HOUSEHOLD's (not solar's) usage that falls in each
   TOU period, used only to back-estimate kWh from a dollar bill amount and
   to cap savings at the implied bill. Computed from the same
   RATE_ASSUMPTIONS table below rather than a separately invented number,
   so a bill-mode estimate stays mathematically tied to the selected plan. */
var HOUSEHOLD_USAGE_TOU_SHARE = { superOffPeak: 0.30, offPeak: 0.45, peak: 0.25 };
function averageHouseholdRate(plan) {
  var r = RATE_ASSUMPTIONS[plan] || RATE_ASSUMPTIONS.other;
  var w = HOUSEHOLD_USAGE_TOU_SHARE;
  function seasonAvg(s) { return r[s].superOffPeak * w.superOffPeak + r[s].offPeak * w.offPeak + r[s].peak * w.peak; }
  return (seasonAvg('summer') * SEASONS.summerMonths + seasonAvg('winter') * SEASONS.winterMonths) / 12;
}

var SOLAR_CALCULATOR_CONFIG = {
  /* balcony is 800 W (2x400 W kit), not 850 - kept aligned to the actual
     purchasable 400 W increments sold in the configurator below. Recommended
     sizes must always map to a real configuration, never an arbitrary number. */
  systems: {
    balcony: 800,
    patio: 1200,
    customMin: 400,
    customMax: 1200,
    customStep: 50
  },

  estimatedCosts: {
    solarOnly850:     { min: 900,  max: 1200 },
    solarOnly1200:    { min: 1200, max: 1600 },
    solarBattery850:  { min: 1900, max: 2500 },
    solarBattery1200: { min: 2200, max: 2900 }
  },

  /* Applied around the primary modeled result so the calculator never shows
     false dollar-level precision (e.g. "$83.17/mo") - a range, not a point
     estimate, per the explicit design requirement. */
  uncertainty: 0.10
};

(function () {
  'use strict';

  var root = document.querySelector('[data-calc]');
  if (!root) return;

  var CFG = SOLAR_CALCULATOR_CONFIG;

  var state = {
    zip: '',
    mode: 'bill',        // 'bill' | 'usage'
    bill: 175,
    usage: 600,
    rate: 'touDr1',
    location: 'inland',
    system: 'patio',      // 'balcony' | 'patio' | 'custom'
    customSize: 800,
    battery: false,
    occupancy: 'mixed'
  };

  var out = {};
  [].slice.call(root.querySelectorAll('[data-calc-out]')).forEach(function (el) {
    out[el.getAttribute('data-calc-out')] = el;
  });
  var compareBox = root.querySelector('[data-calc-compare]');

  /* ------------------------------------------------------------------
     Calculation engine. Every function below reads only from CFG and its
     own arguments - no other hard-coded rates or thresholds.
     ------------------------------------------------------------------ */

  function systemSizeW() {
    if (state.system === 'balcony') return CFG.systems.balcony;
    if (state.system === 'patio') return CFG.systems.patio;
    return Math.max(CFG.systems.customMin, Math.min(CFG.systems.customMax, state.customSize));
  }

  /* AC production for one day: system size x San Diego peak sun hours x a
     real-world efficiency/derate factor. Example at the default 1200 W:
     1.2 x 5.75 x 0.85 = 5.87 kWh/day (~178 kWh/month) - this is the actual
     computed value, not a separately hand-typed one, so it can't drift out
     of sync with SOLAR_ASSUMPTIONS. */
  function estimateSolarProduction(sizeW, location) {
    var kwh = (sizeW / 1000) * SOLAR_ASSUMPTIONS.peakSunHours * SOLAR_ASSUMPTIONS.systemEfficiency;
    if (location === 'coastal') kwh *= SOLAR_ASSUMPTIONS.coastalProductionFactor;
    return kwh; // kWh/day
  }

  /* Average power the household draws during the production window, scaled
     by how the occupancy pattern's daytime draw compares to its own 24-hour
     average - see DAYTIME_LOAD_FACTOR above. Returns kW, not kWh, because
     it's compared against production as an instantaneous-capacity proxy,
     not summed directly. */
  function estimateHouseholdDaytimeLoad(monthlyKwh, occupancy) {
    var avgW = (monthlyKwh * 1000) / (SOLAR_ASSUMPTIONS.daysPerMonth * 24);
    var factor = DAYTIME_LOAD_FACTOR[occupancy] || DAYTIME_LOAD_FACTOR.mixed;
    return (avgW * factor) / 1000; // kW
  }

  /* Direct (unstored) self-consumption for one day: the smaller of (a) what
     the home's estimated daytime load could absorb over the production
     window and (b) production itself, further capped at
     maxDirectCoincidence so even a load-rich home isn't credited with
     soaking up 100% of a peaked production curve against a flatter load
     curve. This is what makes self-consumption scale with the actual
     usage-to-system-size ratio instead of a fixed occupancy percentage. */
  function estimateDirectSolarUse(dailyProductionKwh, monthlyKwh, occupancy) {
    var loadKw = estimateHouseholdDaytimeLoad(monthlyKwh, occupancy);
    var loadCapKwh = loadKw * SOLAR_ASSUMPTIONS.productionWindowHours;
    var coincidenceCapKwh = dailyProductionKwh * SOLAR_ASSUMPTIONS.maxDirectCoincidence;
    return Math.min(dailyProductionKwh, loadCapKwh, coincidenceCapKwh);
  }

  /* Excess solar (production minus direct use) charges the battery, up to
     its capacity; round-trip losses are applied once, on the way out, not
     hidden inside the charge step too. Cannot create energy and cannot
     discharge more than was actually captured. */
  function estimateBatteryShift(excessDailyKwh, batteryKwh) {
    var chargeKwh = Math.min(Math.max(0, excessDailyKwh), batteryKwh);
    return chargeKwh * BATTERY_ASSUMPTIONS.roundTripEfficiency; // dischargeable kWh
  }

  function defaultBatteryKwh(sizeW) {
    return BATTERY_ASSUMPTIONS.defaultKwhBySize[sizeW] || 1.5;
  }

  /* Step 1 - estimate monthly usage. Bill-mode back-estimates kWh using the
     blended average rate for the SELECTED plan (derived from the same
     RATE_ASSUMPTIONS table used everywhere else), not a separate number. */
  function estimateMonthlyKwh() {
    if (state.mode === 'usage') return state.usage;
    return state.bill / averageHouseholdRate(state.rate);
  }

  /* Combines every step above for one season: production -> direct use ->
     excess -> battery shift -> avoided-cost value, each valued at the rate
     it actually displaces (direct solar at a blended off-peak-weighted
     rate, battery-shifted energy at the peak rate) - then caps total
     avoided energy at the home's actual usage. Returns the dollar savings
     plus the intermediate kWh figures, for use in the assumptions text. */
  function calculateAvoidedEnergyCost(seasonKey, sizeW, monthlyKwh, location, occupancy, batteryKwh, plan) {
    var dailyProd = estimateSolarProduction(sizeW, location);
    var directDaily = estimateDirectSolarUse(dailyProd, monthlyKwh, occupancy);
    var excessDaily = Math.max(0, dailyProd - directDaily);
    var batteryDischargeDaily = batteryKwh > 0 ? estimateBatteryShift(excessDaily, batteryKwh) : 0;

    var directMonthly = directDaily * SOLAR_ASSUMPTIONS.daysPerMonth;
    var batteryMonthly = batteryDischargeDaily * SOLAR_ASSUMPTIONS.daysPerMonth;

    var totalAvoidedKwh = directMonthly + batteryMonthly;
    if (totalAvoidedKwh > monthlyKwh && totalAvoidedKwh > 0) {
      var scale = monthlyKwh / totalAvoidedKwh;
      directMonthly *= scale;
      batteryMonthly *= scale;
    }

    var directRate = blendedDirectRate(plan, seasonKey);
    var battRate = peakRateFor(plan, seasonKey);
    var savings = (directMonthly * directRate) + (batteryMonthly * battRate);

    return {
      savings: savings,
      dailyProductionKwh: dailyProd,
      directMonthlyKwh: directMonthly,
      batteryMonthlyKwh: batteryMonthly,
      directRate: directRate,
      batteryRate: battRate
    };
  }

  function costRangeFor(sizeW, hasBattery) {
    var c = CFG.estimatedCosts;
    var lo = hasBattery ? c.solarBattery850 : c.solarOnly850;
    var hi = hasBattery ? c.solarBattery1200 : c.solarOnly1200;
    var t = (sizeW - CFG.systems.balcony) / (CFG.systems.patio - CFG.systems.balcony);
    var min = lo.min + t * (hi.min - lo.min);
    var max = lo.max + t * (hi.max - lo.max);
    min = Math.max(0, Math.round(min / 50) * 50);
    max = Math.max(min, Math.round(max / 50) * 50);
    return { min: min, max: max };
  }

  function withUncertainty(value) {
    var u = CFG.uncertainty;
    return { min: value * (1 - u), max: value * (1 + u) };
  }

  /* Runs the full model for a given battery state (used both for the live
     display and for the with/without storage comparison), returning every
     figure the UI needs. */
  function calculateSavings(batteryOverride) {
    var battery = typeof batteryOverride === 'boolean' ? batteryOverride : state.battery;
    var sizeW = systemSizeW();
    var usageKwh = estimateMonthlyKwh();
    var batteryKwh = battery ? defaultBatteryKwh(sizeW) : 0;

    var summer = calculateAvoidedEnergyCost('summer', sizeW, usageKwh, state.location, state.occupancy, batteryKwh, state.rate);
    var winter = calculateAvoidedEnergyCost('winter', sizeW, usageKwh, state.location, state.occupancy, batteryKwh, state.rate);

    /* An estimate should never claim to save more than the customer's
       stated (or bill-mode-implied) monthly bill, and should never offset
       the fixed/minimum charges that persist regardless of solar - this
       caps at the full bill as a simple, conservative proxy for "the
       usage-based portion of the bill" since a fixed-charge breakdown
       isn't available per plan. */
    var impliedBill = state.mode === 'bill' ? state.bill : usageKwh * averageHouseholdRate(state.rate);
    var summerMonthly = Math.min(summer.savings, impliedBill);
    var winterMonthly = Math.min(winter.savings, impliedBill);

    /* Seasonal blend, not a flat x12 multiply - production is held constant
       across seasons (5.75 peak sun hours is already an annual average),
       so only the rate differs by season. */
    var annual = (summerMonthly * SEASONS.summerMonths) + (winterMonthly * SEASONS.winterMonths);
    var blendedMonthly = annual / 12;

    return {
      usageKwh: usageKwh,
      sizeW: sizeW,
      batteryKwh: batteryKwh,
      summerMonthly: summerMonthly,
      winterMonthly: winterMonthly,
      annual: annual,
      blendedMonthly: blendedMonthly,
      impliedBill: impliedBill,
      summer: summer,
      winter: winter
    };
  }

  function model(batteryOverride) { return calculateSavings(batteryOverride); }

  /* Applies the +/-uncertainty band around a value, then clamps the upper
     bound so the DISPLAYED range never implies savings above the stated (or
     implied) bill - the uncertainty band must not undo Step 5's cap. */
  function withUncertaintyCapped(value, ceiling) {
    var r = withUncertainty(value);
    r.max = Math.min(r.max, ceiling);
    r.min = Math.min(r.min, r.max);
    return r;
  }

  /* ------------------------------------------------------------------
     Formatting helpers
     ------------------------------------------------------------------ */

  function money(n) { return '$' + Math.round(Math.max(0, n)).toLocaleString(); }
  function moneyRange(range) { return money(range.min) + '–' + money(range.max); }
  function wattsLabel(w) { return Math.round(w).toLocaleString() + ' W'; }

  /* Brief highlight so a changed number reads as "live" without a full
     numeric tween - short count/number transition only, per spec. */
  function pulse(el) {
    if (!el) return;
    el.classList.remove('is-pulsing');
    // eslint-disable-next-line no-unused-expressions
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('is-pulsing');
  }

  function setText(key, text) {
    var el = out[key];
    if (!el) return;
    if (el.textContent !== text) {
      el.textContent = text;
      pulse(el);
    }
  }

  /* ------------------------------------------------------------------
     Render
     ------------------------------------------------------------------ */

  var compareTimer = null;

  function showCompareBriefly() {
    if (!compareBox) return;
    var withM = model(true);
    var withoutM = model(false);
    setText('compareWith', money(withM.blendedMonthly) + '/mo');
    setText('compareWithout', money(withoutM.blendedMonthly) + '/mo');
    compareBox.hidden = false;
    compareBox.setAttribute('aria-hidden', 'false');
    compareBox.classList.add('is-visible');
    if (compareTimer) clearTimeout(compareTimer);
    compareTimer = setTimeout(function () {
      compareBox.classList.remove('is-visible');
      compareTimer = setTimeout(function () {
        compareBox.hidden = true;
        compareBox.setAttribute('aria-hidden', 'true');
      }, 400);
    }, 4200);
  }

  function render() {
    var sizeW = systemSizeW();
    var m = model();

    var monthly = withUncertaintyCapped(m.blendedMonthly, m.impliedBill);
    var annual = withUncertaintyCapped(m.annual, m.impliedBill * 12);
    var summer = withUncertaintyCapped(m.summerMonthly, m.impliedBill);
    var winter = withUncertaintyCapped(m.winterMonthly, m.impliedBill);

    setText('monthlyRange', moneyRange(monthly));
    setText('annualRange', 'About ' + moneyRange(annual) + '/year');
    setText('summerRange', moneyRange(summer) + '/mo');
    setText('winterRange', moneyRange(winter) + '/mo');
    setText('systemSize', wattsLabel(sizeW));
    setText('batteryStatus', state.battery ? 'Included' : 'Not included');

    var cost = costRangeFor(sizeW, state.battery);
    setText('costRange', moneyRange(cost));

    var paybackFast = cost.min / (annual.max || 1);
    var paybackSlow = cost.max / (annual.min || 1);
    setText('paybackRange', paybackFast.toFixed(1) + '–' + paybackSlow.toFixed(1) + ' years');

    var storageStat = root.querySelector('[data-calc-out="batteryStatus"]').closest('.calc__stat');
    if (storageStat) storageStat.classList.toggle('calc__stat--on', state.battery);

    if (out.assumeRate) {
      var planNames = { touDr1: 'TOU-DR1', touElec: 'TOU-ELEC', flat: 'Flat/tiered', other: 'a generic' };
      var locNames = { inland: 'Inland SDG&E', coastal: 'Coastal SDG&E' };
      out.assumeRate.textContent = 'Rate assumptions for ' + (planNames[state.rate] || 'the selected') +
        ' and ' + (locNames[state.location] || 'the selected location') + '.';
    }
    if (out.assumeOccupancy) {
      var occNames = { usuallyHome: 'usually home', mixed: 'mixed', mostlyAway: 'mostly away' };
      out.assumeOccupancy.textContent = 'Daytime usage share assumes "' +
        (occNames[state.occupancy] || state.occupancy) + '" is representative of your home.';
    }
    if (out.assumeBattery) {
      out.assumeBattery.textContent = state.battery
        ? 'Assumes roughly ' + m.batteryKwh + ' kWh of storage for a ' + wattsLabel(sizeW) + ' system, charged from excess solar and used to offset the evening peak.'
        : 'Without a battery, only solar used directly at the time it’s made is credited - excess production is not banked or exported for credit.';
    }

    var rateHintEl = out.rateHint;
    if (rateHintEl) rateHintEl.hidden = state.rate !== 'other';
  }

  /* ------------------------------------------------------------------
     Input wiring
     ------------------------------------------------------------------ */

  function setActiveSeg(group, value) {
    group.forEach(function (btn) {
      var active = btn.getAttribute('data-value') === value;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  /* San Diego County ZIP ranges (approximate - covers 919xx and 920xx-921xx).
     Purely informational: it toggles an honest "outside our current focus
     area" hint, it does NOT silently reassign inland/coastal or swap rate
     tables - that stays under the visitor's own control via the segmented
     buttons below, since a ZIP-to-utility/CCA mapping precise enough to do
     that automatically isn't something this static site can verify. */
  function isSanDiegoCountyZip(zip) {
    var z = parseInt(zip, 10);
    if (!zip || zip.length !== 5 || isNaN(z)) return null;
    return (z >= 91901 && z <= 91980) || (z >= 92003 && z <= 92199);
  }

  var zipInput = root.querySelector('[data-calc-input="zip"]');
  if (zipInput) {
    zipInput.addEventListener('input', function () {
      state.zip = zipInput.value.replace(/[^0-9]/g, '').slice(0, 5);
      if (zipInput.value !== state.zip) zipInput.value = state.zip;
      var inSD = isSanDiegoCountyZip(state.zip);
      if (out.zipHint) out.zipHint.hidden = inSD !== false;
    });
  }

  // mode toggle (bill / usage)
  var modeButtons = [].slice.call(root.querySelectorAll('[data-calc-mode-btn]'));
  modeButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var m = btn.getAttribute('data-calc-mode-btn');
      if (m === state.mode) return;
      state.mode = m;
      modeButtons.forEach(function (b) {
        var active = b === btn;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      [].slice.call(root.querySelectorAll('[data-calc-mode-panel]')).forEach(function (panel) {
        panel.hidden = panel.getAttribute('data-calc-mode-panel') !== m;
      });
      render();
    });
  });

  // bill slider
  var billInput = root.querySelector('[data-calc-input="bill"]');
  if (billInput) {
    billInput.addEventListener('input', function () {
      state.bill = parseFloat(billInput.value) || 0;
      setText('billDisplay', money(state.bill));
      var pct = ((state.bill - billInput.min) / (billInput.max - billInput.min)) * 100;
      billInput.style.setProperty('--slider-percent', pct + '%');
      render();
    });
  }

  // usage slider
  var usageInput = root.querySelector('[data-calc-input="usage"]');
  if (usageInput) {
    usageInput.addEventListener('input', function () {
      state.usage = parseFloat(usageInput.value) || 0;
      setText('usageDisplay', Math.round(state.usage).toLocaleString() + ' kWh');
      var pct = ((state.usage - usageInput.min) / (usageInput.max - usageInput.min)) * 100;
      usageInput.style.setProperty('--slider-percent', pct + '%');
      render();
    });
  }

  // rate plan
  var rateSelect = root.querySelector('[data-calc-input="rate"]');
  if (rateSelect) {
    rateSelect.addEventListener('change', function () {
      state.rate = rateSelect.value;
      render();
    });
  }

  // location segmented control
  var locationBtns = [].slice.call(root.querySelectorAll('[data-calc-input="location"]'));
  locationBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.location = btn.getAttribute('data-value');
      setActiveSeg(locationBtns, state.location);
      render();
    });
  });

  // system size segmented control + custom slider
  var systemBtns = [].slice.call(root.querySelectorAll('[data-calc-input="system"]'));
  var customSizeInput = root.querySelector('[data-calc-input="customSize"]');
  systemBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.system = btn.getAttribute('data-value');
      setActiveSeg(systemBtns, state.system);
      if (customSizeInput) customSizeInput.hidden = state.system !== 'custom';
      render();
    });
  });
  if (customSizeInput) {
    customSizeInput.addEventListener('input', function () {
      state.customSize = parseFloat(customSizeInput.value) || CFG.systems.customMin;
      if (out.customLabel) out.customLabel.textContent = wattsLabel(state.customSize);
      render();
    });
  }

  // battery switch
  var batterySwitch = root.querySelector('[data-calc-input="battery"]');
  if (batterySwitch) {
    batterySwitch.addEventListener('click', function () {
      state.battery = !state.battery;
      batterySwitch.classList.toggle('is-on', state.battery);
      batterySwitch.setAttribute('aria-pressed', state.battery ? 'true' : 'false');
      render();
      showCompareBriefly();
    });
  }

  // daytime usage segmented control
  var occupancyBtns = [].slice.call(root.querySelectorAll('[data-calc-input="occupancy"]'));
  occupancyBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.occupancy = btn.getAttribute('data-value');
      setActiveSeg(occupancyBtns, state.occupancy);
      render();
    });
  });

  render();
})();


/* ---------------------------------------------------------------------------
   "Wherever there's sun and an outlet." - the one contained interactive How
   It Works moment (Panels -> Microinverter -> Outlet, Power meter shown
   separately).

   Not scroll-linked: an IntersectionObserver fires once when the section
   scrolls into view, then a short automatic staggered reveal plays through
   the sequence on a timer. Simpler and more reliable than driving it off
   continuous scroll position, and it still reads as one deliberate beat.
--------------------------------------------------------------------------- */
(function () {
  'use strict';
  var root = document.querySelector('[data-conn]');
  if (!root) return;
  var steps = [].slice.call(root.querySelectorAll('[data-conn-step]'));
  var arrows = [].slice.call(root.querySelectorAll('[data-conn-arrow]'));
  var storage = root.querySelector('[data-conn-storage]');
  if (!steps.length) return;

  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  function showAll() {
    steps.forEach(function (el) { el.classList.add('is-shown'); });
    arrows.forEach(function (el) { el.classList.add('is-shown'); });
    if (storage) storage.classList.add('is-shown');
  }

  if (motionQuery.matches || !window.IntersectionObserver) {
    showAll();
    return;
  }

  var STEP_DELAY = 220; /* ms between each beat of the sequence */
  var played = false;

  function play() {
    if (played) return;
    played = true;
    steps.forEach(function (el, i) {
      window.setTimeout(function () {
        el.classList.add('is-shown');
        if (arrows[i - 1]) arrows[i - 1].classList.add('is-shown');
      }, i * STEP_DELAY);
    });
    if (storage) {
      window.setTimeout(function () { storage.classList.add('is-shown'); }, steps.length * STEP_DELAY);
    }
  }

  var io = new IntersectionObserver(function (entries) {
    if (entries[0].isIntersecting) { play(); io.disconnect(); }
  }, { threshold: 0.35 });
  io.observe(root);
})();


/* ---------------------------------------------------------------------------
   Shop configurator - live, text-only order summary and a progress
   indicator that tracks which step the customer is engaging with. No
   product imagery here by design.
   Panel/microinverter counts per size come straight off each option's
   data-panels/data-inverters attributes in the HTML (the documented 400 W
   kit ratio), not computed or invented here. Battery unit count is the
   selected kWh value directly - 1 unit = 1 kWh, per products.json.
--------------------------------------------------------------------------- */
(function () {
  'use strict';
  var form = document.querySelector('[data-shop]');
  if (!form) return;

  var out = {};
  [].slice.call(form.querySelectorAll('[data-shop-out]')).forEach(function (el) {
    out[el.getAttribute('data-shop-out')] = el;
  });

  var batteryLine = form.querySelector('[data-battery-line]');
  var progressSteps = [].slice.call(document.querySelectorAll('[data-shop-progress] [data-progress-step]'));

  function setProgress(step) {
    progressSteps.forEach(function (el) {
      el.classList.toggle('is-active', el.getAttribute('data-progress-step') === String(step));
    });
  }

  function render() {
    var sizeInput = form.querySelector('input[name="shop-size"]:checked');
    var battInput = form.querySelector('input[name="shop-batt"]:checked');
    var kwh = battInput ? parseInt(battInput.value, 10) : 0;

    if (sizeInput) {
      var w = parseInt(sizeInput.value, 10);
      var panels = parseInt(sizeInput.getAttribute('data-panels'), 10);
      var inverters = parseInt(sizeInput.getAttribute('data-inverters'), 10);

      if (out.size) out.size.textContent = w.toLocaleString() + ' W';
      if (out.panelsLabel) out.panelsLabel.textContent = panels + ' × 200 W panels';
      if (out.invertersLabel) out.invertersLabel.textContent = inverters + ' × ' +
        (inverters === 1 ? 'microinverter' : 'microinverters');
    }

    if (out.storage) out.storage.textContent = kwh ? kwh + ' kWh' : 'None';
    if (out.batteryLabel) out.batteryLabel.textContent = kwh + (kwh === 1 ? ' battery unit' : ' battery units');
    if (batteryLine) batteryLine.hidden = kwh === 0;
  }

  form.addEventListener('change', function (e) {
    render();
    if (e.target.name === 'shop-size') setProgress(2);
    else if (e.target.name === 'shop-batt') setProgress(3);
  });

  render();
  setProgress(1);
})();


/* ---------------------------------------------------------------------------
   "What can storage help power?" - live runtime estimator.

   Every assumption lives in STORAGE_EXAMPLES below - load wattages and the
   usable-energy factor are not scattered through the render logic.
   usableEnergyFactor (0.80) is a conservative provisional placeholder until
   actual usable battery capacity and full system-loss data are finalized -
   see the in-UI caption, which labels every number an estimate.

   Deliberately excludes central air, ovens/ranges, EV charging and other
   high continuous/surge 240 V loads: no verified inverter/battery output
   documentation in this project supports promising those, so they are not
   offered as examples here regardless of what the runtime math would say.
--------------------------------------------------------------------------- */
var STORAGE_EXAMPLES = {
  usableEnergyFactor: 0.80,

  loads: [
    { id: 'router',   label: 'Wi-Fi + router',        watts: 20 },
    { id: 'lighting', label: 'LED lighting',           watts: 50 },
    { id: 'laptop',   label: 'Laptop',                 watts: 65 },
    { id: 'security', label: 'Security system',        watts: 25 },
    { id: 'tv',       label: 'TV',                     watts: 100 },
    { id: 'desktop',  label: 'Desktop / electronics',  watts: 200 }
  ],

  /* Curated per storage size, not just the same five cards with a bigger
     number - which loads are worth showing changes as storage grows. */
  tiers: {
    1: { label: 'Everyday essentials',       visible: ['router', 'lighting', 'laptop', 'security'] },
    2: { label: 'More evening flexibility',  visible: ['router', 'lighting', 'laptop', 'security', 'tv', 'desktop'] },
    4: { label: 'More energy, for longer',   visible: ['router', 'lighting', 'laptop', 'security', 'tv', 'desktop'] }
  }
};

(function () {
  'use strict';
  var root = document.querySelector('[data-useit-loads]');
  if (!root) return;

  var sizeInputs = [].slice.call(document.querySelectorAll('input[name="useit-size"]'));
  var tierLabel = document.querySelector('[data-useit-tier-label]');
  var items = {};
  [].slice.call(root.querySelectorAll('li[data-load]')).forEach(function (li) {
    items[li.getAttribute('data-load')] = li;
  });

  /* estimated runtime hours = storage kWh x 1000 x usableEnergyFactor / watts */
  function runtimeHours(kwh, watts) {
    return (kwh * 1000 * STORAGE_EXAMPLES.usableEnergyFactor) / watts;
  }

  /* customer-friendly rounding - never "39.83 hr", always "~40 hr". Plain
     integer rounding matches the supplied reference examples exactly
     (e.g. a 25 W security system at 1 kWh rounds to ~32 hr, not ~30). */
  function friendlyHours(hours) {
    return '~' + Math.round(hours) + ' hr';
  }

  function render() {
    var checked = document.querySelector('input[name="useit-size"]:checked');
    var kwh = checked ? parseInt(checked.value, 10) : 1;
    var tier = STORAGE_EXAMPLES.tiers[kwh] || STORAGE_EXAMPLES.tiers[1];

    if (tierLabel) tierLabel.textContent = tier.label;

    STORAGE_EXAMPLES.loads.forEach(function (load) {
      var li = items[load.id];
      if (!li) return;
      var visible = tier.visible.indexOf(load.id) !== -1;
      li.hidden = !visible;
      if (visible) {
        var out = li.querySelector('[data-runtime]');
        if (out) out.textContent = friendlyHours(runtimeHours(kwh, load.watts));
      }
    });
  }

  sizeInputs.forEach(function (input) {
    input.addEventListener('change', render);
  });
  render();
})();
