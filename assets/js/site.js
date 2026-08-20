/* Terrace Solar — progressive enhancement only.
   The page is fully readable and usable with JavaScript disabled;
   this script only updates the configurator readout, drives the hero scrub,
   and runs the starting-size estimator. */

(function () {
  'use strict';

  var KIT_W = 400;
  var PANEL_W = 200;

  var form = document.querySelector('[data-config]');
  if (!form) return;

  var out = {
    system: document.querySelector('[data-out="system"]'),
    kits: document.querySelector('[data-out="kits"]'),
    panels: document.querySelector('[data-out="panels"]'),
    inverters: document.querySelector('[data-out="inverters"]')
  };

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  function render() {
    var checked = form.querySelector('input[name="system-size"]:checked');
    if (!checked) return;

    var watts = parseInt(checked.value, 10);
    if (!isFinite(watts) || watts <= 0) return;

    var kits = watts / KIT_W;
    var panels = watts / PANEL_W;

    if (out.system) out.system.textContent = watts.toLocaleString() + ' W';
    if (out.kits) out.kits.textContent = plural(kits, 'kit', 'kits');
    if (out.panels) out.panels.textContent = plural(panels, 'panel', 'panels') + ' x ' + PANEL_W + ' W';
    if (out.inverters) {
      out.inverters.textContent = plural(kits, 'microinverter', 'microinverters') + ' x ' + KIT_W + ' W';
    }
  }

  form.addEventListener('change', render);
  render();
})();


/* ---------------------------------------------------------------------------
   Scroll-scrubbed, chaptered film hero.

   Scroll position drives video currentTime. Native scroll only - nothing is
   hijacked, preventDefault is never called.

   Timeline is alternating segments:
     scrub(0 -> hold1) | hold1 | scrub | hold2 | ... | scrub(-> duration)
   Inside a scrub, scroll maps to time. Inside a hold, time is clamped and the
   chapter's steps reveal instead. Purely positional, so reverse is exact.

   DEV OVERRIDE
     ?motion=full   force the cinematic path even when the OS asks for reduced
                    motion. Remembered for the tab session.
     ?motion=auto   clear the override.
     ?debug=1       on-screen readout. Press H to capture the current timestamp.
--------------------------------------------------------------------------- */

var TerraceFilm = (function () {
  'use strict';

  /* Master film source. Swap the file at this path, or point data-film-src at a
     different file in index.html - no JS change needed. If the replacement has
     the same duration the HOLDS timestamps below keep working unchanged. */
  var VIDEO_SRC = (document.querySelector('[data-film]') || {}).dataset
    ? (document.querySelector('[data-film]').dataset.filmSrc || 'assets/video/hero.mp4')
    : 'assets/video/hero.mp4';

  var DAMPING = 0.16;
  var SETTLE = 0.004;

  /* ===================================================================
     HOLD FRAMES - the equipment shots the film stops on.
     `t` is the timestamp in hero.mp4 to freeze on.
     `vh` is how much scroll that chapter gets, in viewport heights.
     Only `stack` (28.96) is confirmed against the master; the others are
     estimates. Load ?motion=full&debug=1 and press H on each shot to capture.
     =================================================================== */
  var HOLDS = [
    { id: 'panel',   t: 14.20, vh: 190, confirmed: false },
    { id: 'battery', t: 24.80, vh: 190, confirmed: false },
    { id: 'stack',   t: 28.96, vh: 190, confirmed: true  },
    { id: 'connect', t: 37.60, vh: 210, confirmed: false }
  ];

  var SCRUB_VH_PER_SECOND = 17;
  /* the closing fall-to-black needs only enough scroll to hide the seam */
  var TAIL_SCRUB_VH_PER_SECOND = 6;
  var INTRO_FADE_LEAD = 2.0;

  var root = document.querySelector('[data-film]');
  if (!root) return null;

  var track = root.querySelector('[data-film-track]');
  var video = root.querySelector('[data-film-video]');
  var captions = [].slice.call(root.querySelectorAll('.film__caption'));
  var intro = root.querySelector('[data-film-intro]');
  var chapterEls = {};
  [].slice.call(root.querySelectorAll('[data-chapter]')).forEach(function (el) {
    chapterEls[el.getAttribute('data-chapter')] = el;
  });

  /* captions were the prototype's narration; the equipment chapters replace
     them, so they are optional now */
  if (!track || !video) {
    if (window.console) {
      console.error('[film] markup missing', { track: !!track, video: !!video });
    }
    return null;
  }

  /* ---- dev flags ---- */
  var forceMotion = false;
  var debug = false;
  try {
    var qs = new URLSearchParams(window.location.search);
    var m = qs.get('motion');
    if (m === 'full') {
      window.sessionStorage.setItem('ts-motion', 'full');
    } else if (m === 'auto' || m === 'off') {
      window.sessionStorage.removeItem('ts-motion');
    }
    forceMotion = window.sessionStorage.getItem('ts-motion') === 'full';

    /* Debug is URL-only and never persisted, so the public URL is always clean. */
    window.sessionStorage.removeItem('ts-debug');
    debug = qs.get('debug') === '1';
  } catch (e) {
    forceMotion = window.location.search.indexOf('motion=full') !== -1;
    debug = window.location.search.indexOf('debug=1') !== -1;
  }

  var wideQuery = window.matchMedia('(min-width: 900px) and (min-height: 600px)');
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  var enabled = false;
  var loaded = false;
  var inView = true;
  var rafId = 0;
  var progress = 0;
  var shownTime = 0;
  var targetTime = 0;
  var duration = 0;
  var lastIndex = -1;
  var loadError = null;
  var timeline = [];
  var totalPx = 0;
  var activeChapter = null;
  var holding = false;

  function clamp01(n) { return n < 0 ? 0 : (n > 1 ? 1 : n); }
  function reducedMotionWins() { return motionQuery.matches && !forceMotion; }

  function fallbackReason() {
    if (enabled) return null;
    if (!wideQuery.matches) {
      if (window.innerWidth < 900) {
        return 'viewport width ' + window.innerWidth + 'px is under 900px';
      }
      return 'viewport height ' + window.innerHeight + 'px is under 600px';
    }
    if (reducedMotionWins()) {
      return 'prefers-reduced-motion is on - add ?motion=full to override';
    }
    return 'gate passes but hero not enabled - sync() has not run since the last change';
  }

  function buildTimeline() {
    timeline = [];
    if (!duration) return;
    var vh = window.innerHeight / 100;
    var prev = 0;

    HOLDS.forEach(function (h) {
      if (h.t > prev) {
        timeline.push({ type: 'scrub', from: prev, to: h.t,
                        px: Math.max(1, (h.t - prev) * SCRUB_VH_PER_SECOND * vh) });
      }
      timeline.push({ type: 'hold', at: h.t, id: h.id, px: Math.max(1, h.vh * vh) });
      prev = h.t;
    });
    if (duration > prev) {
      timeline.push({ type: 'scrub', from: prev, to: duration,
                      px: Math.max(1, (duration - prev) * TAIL_SCRUB_VH_PER_SECOND * vh) });
    }

    totalPx = timeline.reduce(function (sum, seg) { return sum + seg.px; }, 0);
    track.style.height = Math.round(totalPx + window.innerHeight) + 'px';
  }

  function trackScroll() {
    var rect = track.getBoundingClientRect();
    var travel = rect.height - window.innerHeight;
    if (travel <= 0) return 0;
    return Math.max(0, Math.min(travel, -rect.top));
  }

  function resolve() {
    var x = trackScroll();
    var acc = 0;
    for (var i = 0; i < timeline.length; i++) {
      var seg = timeline[i];
      if (x < acc + seg.px || i === timeline.length - 1) {
        var local = clamp01((x - acc) / seg.px);
        if (seg.type === 'scrub') {
          return { time: seg.from + (seg.to - seg.from) * local, chapter: null, cp: 0 };
        }
        return { time: seg.at, chapter: seg.id, cp: local };
      }
      acc += seg.px;
    }
    return { time: 0, chapter: null, cp: 0 };
  }

  function computeProgress() {
    var rect = track.getBoundingClientRect();
    var travel = rect.height - window.innerHeight;
    return travel > 0 ? clamp01(-rect.top / travel) : 0;
  }

  function setCaption(p) {
    if (!captions.length) return;
    var i = Math.min(captions.length - 1, Math.floor(p * captions.length));
    if (i === lastIndex) return;
    lastIndex = i;
    for (var n = 0; n < captions.length; n++) {
      captions[n].classList.toggle('is-active', n === i);
    }
  }

  function setChapter(id, cp) {
    if (id !== activeChapter) {
      if (activeChapter && chapterEls[activeChapter]) {
        chapterEls[activeChapter].classList.remove('is-live', 'is-in');
      }
      activeChapter = id;
      if (id && chapterEls[id]) chapterEls[id].classList.add('is-live');
    }
    if (!id) { root.classList.remove('is-holding'); return; }
    root.classList.add('is-holding');
    var el = chapterEls[id];
    if (!el) return;

    var inner = el.querySelector('.chapter__inner');
    if (inner) inner.style.setProperty('--c', cp.toFixed(3));

    /* Progressive disclosure inside the hold: steps arrive one at a time across
       the hold's scroll range, so only a couple of ideas are on screen at once.
       Purely positional, so scrolling back up hides them again in reverse. */
    var steps = el.__steps || (el.__steps = [].slice.call(el.querySelectorAll('.chapter__step')));
    if (!steps.length) return;

    var LEAD = 0.06, TAIL = 0.90;
    var span = (TAIL - LEAD) / steps.length;

    for (var i = 0; i < steps.length; i++) {
      var start = LEAD + i * span;
      /* once shown, a step stays shown - the whole chapter fades out together */
      steps[i].classList.toggle('is-shown', cp >= start);
    }
  }

  function frame() {
    rafId = 0;
    if (!enabled) return;

    /* Self-correcting gate. resize and matchMedia change events are the primary
       signal, but some embedded viewports never dispatch them. */
    if (!wideQuery.matches || reducedMotionWins()) { disable(); return; }

    progress = computeProgress();
    root.style.setProperty('--p', progress.toFixed(4));
    setCaption(progress);

    if (duration > 0) {
      if (!timeline.length) buildTimeline();
      var r = resolve();
      targetTime = r.time;
      holding = !!r.chapter;
      setChapter(r.chapter, r.cp);

      var lead = HOLDS.length ? HOLDS[0].t - INTRO_FADE_LEAD : duration;
      var introOpacity = lead > 0 ? clamp01(1 - targetTime / lead) : 0;
      if (intro) root.style.setProperty('--intro', introOpacity.toFixed(3));

      shownTime += (targetTime - shownTime) * DAMPING;
      if (holding && Math.abs(targetTime - shownTime) < 0.02) shownTime = targetTime;
      if (progress <= 0) { shownTime = 0; }
      if (progress >= 1) { shownTime = duration; }

      if (!video.seeking && Math.abs(video.currentTime - shownTime) > SETTLE) {
        try { video.currentTime = shownTime; } catch (e) { /* not seekable yet */ }
      }
      if (Math.abs(targetTime - shownTime) > SETTLE) { schedule(); }
    }
    if (debug) { paintDebug(); }
  }

  function schedule() {
    if (rafId || !enabled || !inView) return;
    rafId = window.requestAnimationFrame(frame);
  }

  function load() {
    if (loaded) return;
    loaded = true;
    video.setAttribute('src', VIDEO_SRC);
    video.preload = 'auto';
    video.load();
  }

  video.addEventListener('loadedmetadata', function () {
    duration = video.duration || 0;
    loadError = null;
    if (window.console) {
      console.log('[film] metadata loaded: ' + duration.toFixed(3) + 's, ' +
                  video.videoWidth + 'x' + video.videoHeight);
    }
    buildTimeline();
    schedule();
  });

  /* Cross to the video only once a frame exists. loadedmetadata is readyState 1
     - duration known but no pixels decoded - so hiding the poster there flashes
     black. loadeddata is readyState 2, first frame available. */
  video.addEventListener('loadeddata', function () {
    root.classList.add('film--ready');
    buildTimeline();
    schedule();
  });

  video.addEventListener('error', function () {
    loadError = video.error
      ? ('code ' + video.error.code + ' ' + (video.error.message || ''))
      : 'unknown';
    if (window.console) console.error('[film] video failed:', loadError, VIDEO_SRC);
    if (debug) paintDebug();
  });

  /* never plays on its own */
  video.addEventListener('play', function () { video.pause(); });

  /* Chrome defers media loading in background tabs - retry on return */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && enabled && video.readyState === 0) {
      video.load();
      schedule();
    }
  });

  function enable() {
    if (enabled) return;
    enabled = true;
    root.classList.add('film--on');
    if (forceMotion) root.classList.add('film--force');
    load();
    window.addEventListener('scroll', schedule, { passive: true });
    schedule();
  }

  function disable() {
    if (!enabled) return;
    enabled = false;
    root.classList.remove('film--on');
    root.classList.remove('film--force');
    window.removeEventListener('scroll', schedule);
    if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
    root.style.removeProperty('--p');
    root.style.removeProperty('--intro');
    root.classList.remove('is-holding');
    track.style.removeProperty('height');
    timeline = [];
    if (activeChapter && chapterEls[activeChapter]) {
      chapterEls[activeChapter].classList.remove('is-live', 'is-in');
    }
    activeChapter = null;
    holding = false;
    progress = 0;
    lastIndex = -1;
    for (var i = 0; i < captions.length; i++) {
      captions[i].classList.toggle('is-active', i === 0);
    }
  }

  function sync() {
    if (wideQuery.matches && !reducedMotionWins()) { enable(); } else { disable(); }
    if (debug) paintDebug();
  }

  function listen(q) {
    if (q.addEventListener) { q.addEventListener('change', sync); }
    else if (q.addListener) { q.addListener(sync); }
  }

  /* Always listening, enabled or not. matchMedia change events are the primary
     signal but are not guaranteed in every embedded viewport. */
  window.addEventListener('resize', function () {
    buildTimeline();
    sync();
    schedule();
  }, { passive: true });

  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (inView) schedule();
    }, { rootMargin: '100px' }).observe(track);
  }

  /* ---- debug readout ---- */
  var panel = null;
  function paintDebug() {
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'filmdiag';
      panel.setAttribute('role', 'status');
      panel.style.cssText = 'position:fixed;top:8px;left:8px;z-index:9999;' +
        'background:#0b1220;color:#e8ecf4;' +
        'font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;padding:8px 10px;' +
        'border-radius:8px;border:1px solid #2b3a55;min-width:300px;' +
        'white-space:pre;box-shadow:0 8px 28px rgba(0,0,0,.45);pointer-events:none';
      document.body.appendChild(panel);
    }
    var v = video;
    panel.textContent = [
      'FILM DIAGNOSTIC',
      'viewport       ' + window.innerWidth + ' x ' + window.innerHeight,
      'reduced-motion ' + (motionQuery.matches ? 'YES' : 'no') +
        (forceMotion ? '  OVERRIDDEN' : ''),
      'film--on       ' + (enabled ? 'YES' : 'NO'),
      'fallback       ' + (fallbackReason() || '-'),
      'video src      ' + (v.getAttribute('src') || 'not attached'),
      'readyState     ' + v.readyState + '    networkState ' + v.networkState,
      'duration       ' + (duration ? duration.toFixed(3) + 's' : '-'),
      'buffered       ' + (v.buffered.length ? v.buffered.end(0).toFixed(1) + 's' : 'none'),
      'progress       ' + progress.toFixed(4),
      'target time    ' + targetTime.toFixed(3) + 's',
      'currentTime    ' + (v.currentTime || 0).toFixed(3) + 's' +
        (v.seeking ? '  (seeking)' : ''),
      'track height   ' + Math.round(track.getBoundingClientRect().height) + 'px',
      'mode           ' + (holding ? 'HOLD - ' + activeChapter : 'scrub'),
      'chapter        ' + (activeChapter || '-'),
      'segments       ' + timeline.length,
      'press H        capture this timestamp as a hold',
      'error          ' + (loadError || 'none')
    ].join('\n');
  }

  listen(wideQuery);
  listen(motionQuery);
  sync();

  if (debug) {
    paintDebug();
    window.setInterval(paintDebug, 250);

    /* Press H to record the frame currently on screen. */
    window.__holds = [];
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'h' && ev.key !== 'H') return;
      var t = +video.currentTime.toFixed(3);
      window.__holds.push(t);
      var text = window.__holds.join(', ');
      if (window.console) console.log('[film] captured hold at ' + t + 's -> [' + text + ']');
      try { navigator.clipboard.writeText(text); } catch (e) { /* no clipboard */ }
      if (panel) {
        panel.textContent += String.fromCharCode(10) +
          'captured       ' + t + 's  (' + window.__holds.length + ' total)';
      }
    });
  }

  if (window.console) {
    console.log('[film] init', {
      videoElement: !!video,
      src: VIDEO_SRC,
      forceMotion: forceMotion,
      reducedMotion: motionQuery.matches,
      gatePasses: wideQuery.matches,
      enabled: enabled,
      fallbackReason: fallbackReason()
    });
  }

  return {
    root: root, video: video, track: track, captions: captions,
    wideQuery: wideQuery, motionQuery: motionQuery,
    isEnabled: function () { return enabled; },
    isForced: function () { return forceMotion; },
    getProgress: function () { return enabled ? progress : computeProgress(); },
    getTargetTime: function () { return targetTime; },
    getDuration: function () { return duration; },
    getIndex: function () { return lastIndex; },
    getFallbackReason: fallbackReason,
    getError: function () { return loadError; },
    forceEnable: function () { forceMotion = true; sync(); }
  };
})();


/* ---------------------------------------------------------------------------
   SDG&E Solar Savings Calculator - "Find your fit."

   Every assumption used anywhere in this calculator lives in
   SOLAR_CALCULATOR_CONFIG below. Nothing is hard-coded in the calculation
   functions or the render function - if a number changes, it changes here.

   STATUS OF RATE FIGURES:
   - rates.touDr1                 - supplied project assumptions
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
  function wattsLabel(w) { return Math.round(w).toLocaleString() + ' W'; }

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
      setText('usageDisplay', Math.round(state.usage).toLocaleString() + ' kWh');
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
   How it works - short sticky reveal. Same positional idea as the film: scroll
   position drives which steps are shown, steps stay once shown, and the whole
   group fades as the section leaves. No scroll hijacking.
--------------------------------------------------------------------------- */
(function () {
  'use strict';
  var root = document.querySelector('[data-steps]');
  if (!root) return;
  var track = root.querySelector('[data-steps-track]');
  var steps = [].slice.call(root.querySelectorAll('.step'));
  if (!track || !steps.length) return;

  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var narrow = window.matchMedia('(max-width: 899px)');
  var ticking = false;
  /* same dev override the film uses, so both behave consistently */
  var forced = window.location.search.indexOf('motion=full') !== -1;
  function reduced() { return motionQuery.matches && !forced; }

  function apply() {
    ticking = false;
    if (reduced() || narrow.matches) {
      root.classList.remove('steps--on');
      steps.forEach(function (el) { el.classList.add('is-shown'); });
      return;
    }
    root.classList.add('steps--on');
    var rect = track.getBoundingClientRect();
    var travel = rect.height - window.innerHeight;
    var p = travel > 0 ? Math.max(0, Math.min(1, -rect.top / travel)) : 0;
    var LEAD = 0.08, TAIL = 0.88;
    var span = (TAIL - LEAD) / steps.length;
    for (var i = 0; i < steps.length; i++) {
      steps[i].classList.toggle('is-shown', p >= LEAD + i * span);
    }
    root.style.setProperty('--sp', p.toFixed(3));
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(apply);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', apply);
  apply();
})();


/* ---- shop summary line ---- */
(function () {
  'use strict';
  var form = document.querySelector('[data-shop]');
  if (!form) return;
  var out = form.querySelector('[data-shop-out]');
  if (!out) return;

  function render() {
    var size = form.querySelector('input[name="shop-size"]:checked');
    var batt = form.querySelector('input[name="shop-batt"]:checked');
    var kwh = batt ? parseInt(batt.value, 10) : 0;
    out.textContent = (size ? parseInt(size.value, 10).toLocaleString() + ' W system' : '') +
      ' · ' + (kwh ? kwh + ' kWh storage' : 'no storage');
  }
  form.addEventListener('change', render);
  render();
})();
