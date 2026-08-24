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
   SDG&E Solar Savings Calculator - "Find your fit."

   Every assumption used anywhere in this calculator lives in
   SOLAR_CALCULATOR_CONFIG below. Nothing is hard-coded in the calculation
   functions or the render function - if a number changes, it changes here.

   STATUS OF RATE FIGURES:
   - rates.touDr1                 - supplied project assumptions. Cross-checked
                                     2026-08-24 against search-derived SDG&E
                                     TOU-DR1 figures in
                                     assets/products/rates-san-diego.json
                                     (summer peak ~69.65c/kWh, winter peak
                                     ~48c/kWh combined). Those are close to but
                                     not identical to the generation+delivery
                                     split below (summer ~73c, winter ~40c) -
                                     UNRESOLVED CONFLICT, not silently fixed:
                                     the search result gives only a bundled
                                     peak total, not the generation/delivery
                                     split this model needs, so decomposing it
                                     would fabricate precision. Re-derive from
                                     the actual SDG&E tariff PDF (linked in
                                     rates-san-diego.json) before treating
                                     either figure as final.
   - rates.touElec, rates.flat,
     rates.other                  - PROVISIONAL placeholders, NOT verified
                                     against a published current tariff.
                                     Do not present these as exact.
   - averageRateForBillEstimate   - PROVISIONAL, used only to back-estimate
                                     kWh usage from a dollar bill amount.
   - estimatedCosts                - PROVISIONAL, for range-of-magnitude only.

   This is a starting-point estimator, not an engineering tool, a quote, or
   a guarantee. See the in-UI "See assumptions" disclosure for the customer-
   facing version of these notes.
--------------------------------------------------------------------------- */

var SOLAR_CALCULATOR_CONFIG = {

  /* Regional average peak sun hours per day. Not the customer's actual
     rooftop/balcony sunlight - shading, orientation and weather vary. */
  peakSunHours: 5.75,

  daysPerMonth: 30.4,

  seasons: {
    summerMonths: 4,   // June - September
    winterMonths: 8    // October - May
  },

  /* Approximate blended $/kWh used ONLY to back-estimate monthly usage when
     the customer enters a dollar bill instead of a kWh figure. Not a tariff
     calculation - a rough conversion so the "Bill" input mode has something
     to work from. */
  averageRateForBillEstimate: {
    touDr1:  { inland: 0.335, coastal: 0.205 },
    touElec: { inland: 0.300, coastal: 0.190 },
    flat:    { inland: 0.320, coastal: 0.280 },
    other:   { inland: 0.320, coastal: 0.280 }
  },

  /* Avoided-cost assumptions: what a self-consumed or battery-discharged
     kWh is assumed to be worth, by plan / location / season. Generation +
     delivery approximate the combined avoided rate SDG&E customers see on
     TOU-DR1; touElec/flat/other are provisional placeholders in the same
     shape so they stay swappable without touching calculation code. */
  rates: {
    touDr1: {
      inland: {
        summer: { generation: 0.43635, delivery: 0.29479 }, // combined ~$0.73/kWh
        winter: { generation: 0.14748, delivery: 0.25353 }  // combined ~$0.40/kWh
      },
      coastal: {
        summer: { generation: 0.43635, delivery: 0.11530 }, // combined ~$0.55/kWh
        winter: { generation: 0.14748, delivery: 0.11530 }  // combined ~$0.26/kWh
      }
    },

    /* PROVISIONAL - not verified against a current published tariff. */
    touElec: {
      inland:  { summer: { generation: 0.38, delivery: 0.24 }, winter: { generation: 0.16, delivery: 0.21 } },
      coastal: { summer: { generation: 0.38, delivery: 0.10 }, winter: { generation: 0.16, delivery: 0.10 } }
    },

    /* PROVISIONAL - approximate flat/tiered blended rate, no TOU component. */
    flat: {
      inland:  { summer: { generation: 0.32, delivery: 0 }, winter: { generation: 0.30, delivery: 0 } },
      coastal: { summer: { generation: 0.28, delivery: 0 }, winter: { generation: 0.26, delivery: 0 } }
    },

    /* Used for "Other" plans. Deliberately conservative and generic - the
       UI tells the customer this estimate is less precise. */
    other: {
      inland:  { summer: { generation: 0.30, delivery: 0 }, winter: { generation: 0.28, delivery: 0 } },
      coastal: { summer: { generation: 0.26, delivery: 0 }, winter: { generation: 0.24, delivery: 0 } }
    }
  },

  /* Approximate share of monthly usage that falls in the 4-9pm peak window,
     when no interval data is available. Used, on TOU plans only, to keep
     the no-battery estimate conservative: without storage, daytime solar
     mostly can't reach the evening peak window, so the value it displaces
     is discounted by roughly this share. A battery can shift production
     into that window, so the discount does not apply when battery is on. */
  peakUsageShare: {
    inland:  { min: 0.12, max: 0.15 },
    coastal: { min: 0.08, max: 0.10 }
  },

  /* Share of gross production a battery can capture and make useful,
     including shifting it into the peak window. */
  batteryCapture: {
    balcony: 0.80,
    patio: 0.82,
    customDefault: 0.82
  },

  /* Without a battery, only the share of production that coincides with
     the home actually drawing power gets used - the rest is not exported
     or credited. This is what keeps a no-battery estimate honest. */
  selfConsumption: {
    usuallyHome: { min: 0.40, max: 0.50 },
    mixed:       { min: 0.30, max: 0.35 },
    mostlyAway:  { min: 0.15, max: 0.25 }
  },

  systems: {
    balcony: 850,
    patio: 1200,
    customMin: 400,
    customMax: 1200,
    customStep: 50
  },

  /* Gross daily production before losses, at the 5.75 peak-sun-hour
     assumption above - kept explicit so the "~4.9 / ~6.9 kWh/day" figures
     stay traceable to a config value rather than only a derived one. */
  grossDailyKwh: {
    balcony: 4.9,
    patio: 6.9
  },

  /* Non-binding storage suggestion by system size - guidance only, never
     presented as a requirement. */
  storageSuggestion: {
    balcony: '1 kWh',
    patio: '1-2 kWh',
    customDefault: '1-2 kWh'
  },

  estimatedCosts: {
    solarOnly850:     { min: 900,  max: 1200 },
    solarOnly1200:    { min: 1200, max: 1600 },
    solarBattery850:  { min: 1900, max: 2500 },
    solarBattery1200: { min: 2200, max: 2900 }
  },

  /* Applied around the primary modeled result so the calculator never shows
     false dollar-level precision (e.g. "$83.17/mo"). */
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

  function mid(range) { return (range.min + range.max) / 2; }

  function systemSizeW() {
    if (state.system === 'balcony') return CFG.systems.balcony;
    if (state.system === 'patio') return CFG.systems.patio;
    return Math.max(CFG.systems.customMin, Math.min(CFG.systems.customMax, state.customSize));
  }

  function grossDailyKwhFor(sizeW) {
    /* Interpolate/extrapolate off the two documented reference points
       using the shared peak-sun-hour basis, so any custom wattage stays
       consistent with the 850 W / 1200 W figures above. */
    var perWatt = CFG.grossDailyKwh.patio / CFG.systems.patio;
    return sizeW * perWatt;
  }

  function batteryCaptureFor() {
    if (state.system === 'balcony') return CFG.batteryCapture.balcony;
    if (state.system === 'patio') return CFG.batteryCapture.patio;
    return CFG.batteryCapture.customDefault;
  }

  /* Step 1 - estimate monthly usage */
  function estimateMonthlyKwh() {
    if (state.mode === 'usage') return state.usage;
    var rateTable = CFG.averageRateForBillEstimate[state.rate] || CFG.averageRateForBillEstimate.other;
    var avgRate = rateTable[state.location];
    return state.bill / avgRate;
  }

  /* Step 3 + 4 combined for one season: production, applicable capture /
     self-consumption share, avoided rate (with the peak-window discount
     for TOU plans when there is no battery), then usable kWh x rate. */
  function seasonSavings(seasonKey, usageKwh) {
    var sizeW = systemSizeW();
    var grossDaily = grossDailyKwhFor(sizeW);
    var producedKwh = grossDaily * CFG.daysPerMonth;

    var isTou = state.rate === 'touDr1' || state.rate === 'touElec';
    var rateTable = (CFG.rates[state.rate] || CFG.rates.other)[state.location][seasonKey];
    var avoidedRate = rateTable.generation + rateTable.delivery;

    var usableKwh;
    var effectiveRate = avoidedRate;

    if (state.battery) {
      usableKwh = producedKwh * batteryCaptureFor();
      /* battery can shift production into the peak window, so no discount */
    } else {
      var sc = CFG.selfConsumption[state.occupancy];
      usableKwh = producedKwh * mid(sc);
      if (isTou) {
        var peak = CFG.peakUsageShare[state.location];
        effectiveRate = avoidedRate * (1 - mid(peak));
      }
    }

    /* Step 5 - never offset more energy than the home actually uses */
    usableKwh = Math.min(usableKwh, usageKwh);

    var savings = usableKwh * effectiveRate;
    return savings;
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
  function model(batteryOverride) {
    var savedBattery = state.battery;
    if (typeof batteryOverride === 'boolean') state.battery = batteryOverride;

    var usageKwh = estimateMonthlyKwh();
    var summerMonthly = seasonSavings('summer', usageKwh);
    var winterMonthly = seasonSavings('winter', usageKwh);

    /* Step 5, restated at the whole-bill level: an estimate should never
       claim to save more than the customer's stated (or bill-mode-implied)
       monthly bill. */
    var impliedBill = state.mode === 'bill'
      ? state.bill
      : usageKwh * (CFG.averageRateForBillEstimate[state.rate] || CFG.averageRateForBillEstimate.other)[state.location];
    summerMonthly = Math.min(summerMonthly, impliedBill);
    winterMonthly = Math.min(winterMonthly, impliedBill);

    /* Step 6 - seasonal blend, not a flat x12 multiply */
    var annual = (summerMonthly * CFG.seasons.summerMonths) + (winterMonthly * CFG.seasons.winterMonths);
    var blendedMonthly = annual / 12;

    if (typeof batteryOverride === 'boolean') state.battery = savedBattery;

    return {
      usageKwh: usageKwh,
      summerMonthly: summerMonthly,
      winterMonthly: winterMonthly,
      annual: annual,
      blendedMonthly: blendedMonthly,
      impliedBill: impliedBill
    };
  }

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
        ? 'Battery capture assumes roughly ' + Math.round(batteryCaptureFor() * 100) + '% of production is usable, including shifting energy into the peak window.'
        : 'Without a battery, only the modeled self-consumption share of production is credited - not full production.';
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
