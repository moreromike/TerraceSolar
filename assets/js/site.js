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
   "What size fits you?" - a starting-point estimator, not an engineering tool.

   EVERY assumption lives in CALC below. Nothing is hard-coded elsewhere.
   The rate / sunlight / loss values are PROVISIONAL placeholders chosen so the
   widget works; they were not researched and must be replaced before launch.
   billToSize is the owner-specified mapping; systemSizesW is documented product
   data (brochure p.2 and p.6).
--------------------------------------------------------------------------- */

var CALC = {
  /* PROVISIONAL - replace with a real figure for the target market */
  electricityRateUsdPerKwh: 0.17,

  /* PROVISIONAL - average daily peak sun hours */
  peakSunHoursPerDay: 4.2,

  /* PROVISIONAL - system losses, 1.0 = no loss */
  systemDerate: 0.80,

  /* PROVISIONAL - share of produced energy actually used on site. The system
     does not export, so anything not used is throttled away. */
  selfConsumptionShare: 0.90,

  daysPerMonth: 30.4,

  /* DOCUMENTED - brochure p.2 and p.6: 400 W increments, 400 to 2000 W */
  systemSizesW: [400, 800, 1200, 1600, 2000],

  /* Bill-to-size anchor points, owner-specified. The slider INTERPOLATES
     between these rather than stepping at them, so every dollar of movement
     changes the estimate - the estimate does not visibly freeze mid-range.
     The displayed size still snaps to a real 400 W increment (see
     snapToSize); only the underlying production/savings math stays fully
     continuous. bill is inclusive at each anchor. */
  billSizeAnchors: [
    { bill: 75,  w: 400 },
    { bill: 125, w: 800 },
    { bill: 175, w: 1200 },
    { bill: 225, w: 1600 },
    { bill: 275, w: 2000 },
    { bill: 350, w: 2000 }
  ],

  /* ------------------------------------------------------------------
     CALIFORNIA PLUG-IN CAP - editable.
     SB 868 is a BILL, not enacted law. Nothing about it is published on the
     public page. This never caps the main "estimated system size" figure -
     it only adds a secondary note when the estimate exceeds the plug-in
     ceiling, so a $300 bill still shows its real ~2000 W estimate instead
     of a number frozen at 1200 W. Set enabled:false to hide the note.
     ------------------------------------------------------------------ */
  caPlugIn: {
    enabled: true,
    capW: 1200,
    label: 'Plug-in starting configuration',
    note: 'Larger configurations may have different requirements.'
  },

  /* DRAFT copy for a future California launch. NOT rendered anywhere. Only use
     once the bill is enacted, effective, and confirmed to apply. Local building
     and electrical permit requirements are NOT covered by this and must be
     verified separately.
     - 'No traditional utility interconnection agreement for qualifying systems.'
     - 'No utility approval before use for qualifying systems.'
     - 'A simple utility registration may still be required.' */
  caLaunchDraftCopy: null,

  /* the slider tops out here; at or above it we show "+" and keep the largest */
  billCapUsd: 350
};

(function () {
  'use strict';

  var root = document.querySelector('[data-sizer]');
  if (!root) return;

  var input = root.querySelector('[data-sizer-input]');
  if (!input) return;

  var out = {
    bill: root.querySelector('[data-out="bill"]'),
    size: root.querySelector('[data-out="size"]'),
    kwh: root.querySelector('[data-out="kwh"]'),
    savings: root.querySelector('[data-out="savings"]'),
    storage: root.querySelector('[data-out="storage"]'),
    pluginNote: root.querySelector('[data-out="pluginNote"]')
  };

  /* Linear interpolation between the anchor points. This is what makes the
     slider feel responsive across its whole range instead of only at five
     fixed jumps - moving from $201 to $230 moves this number too. */
  function interpolateW(bill) {
    var a = CALC.billSizeAnchors;
    if (bill <= a[0].bill) return a[0].w;
    for (var i = 0; i < a.length - 1; i++) {
      if (bill >= a[i].bill && bill <= a[i + 1].bill) {
        var t = (bill - a[i].bill) / (a[i + 1].bill - a[i].bill);
        return a[i].w + t * (a[i + 1].w - a[i].w);
      }
    }
    return a[a.length - 1].w;
  }

  /* Snaps a continuous wattage to the nearest documented system size. A real
     system ships in 400 W increments even though the underlying estimate
     used for production/savings is continuous. */
  function snapToSize(w) {
    var sizes = CALC.systemSizesW;
    var nearest = sizes[0];
    var best = Math.abs(w - nearest);
    for (var i = 1; i < sizes.length; i++) {
      var d = Math.abs(w - sizes[i]);
      if (d < best) { best = d; nearest = sizes[i]; }
    }
    return nearest;
  }

  /* Suggested storage responds to the bill directly, in its own bands, so it
     does not feel locked one-to-one to the system-size ladder. Editable,
     non-binding guidance - never presented as a requirement. */
  function suggestStorage(bill) {
    if (bill < 125) return { label: '1 kWh', note: 'optional' };
    if (bill < 200) return { label: '1 kWh', note: '' };
    if (bill < 250) return { label: '1-2 kWh', note: '' };
    if (bill < 300) return { label: '2 kWh', note: '' };
    return { label: '2-4 kWh', note: '' };
  }

  function monthlyKwh(sizeW) {
    return (sizeW / 1000) *
           CALC.peakSunHoursPerDay *
           CALC.systemDerate *
           CALC.daysPerMonth;
  }

  function sizerRender() {
    var bill = parseFloat(input.value) || 0;
    var atCap = bill >= CALC.billCapUsd;

    /* estimatedW is continuous and uncapped - it drives production and
       savings so they move on every dollar. recommendedW is the same
       estimate snapped to a real increment for the headline number, and it
       is never capped by the plug-in limit, so it keeps climbing to 2000 W
       at the top of the range instead of freezing at 1200 W. */
    var estimatedW = interpolateW(bill);
    var recommendedW = snapToSize(estimatedW);

    var ca = CALC.caPlugIn;
    var capped = ca && ca.enabled && recommendedW > ca.capW;

    if (out.pluginNote) {
      if (capped) {
        out.pluginNote.innerHTML = ca.label + ': <b>' + ca.capW.toLocaleString() +
          ' W</b><br>' + ca.note;
        out.pluginNote.hidden = false;
      } else {
        out.pluginNote.hidden = true;
        out.pluginNote.innerHTML = '';
      }
    }

    var producedKwh = monthlyKwh(estimatedW);
    var usedKwh = producedKwh * CALC.selfConsumptionShare;
    var savings = usedKwh * CALC.electricityRateUsdPerKwh;

    if (out.bill) out.bill.textContent = '$' + Math.round(bill) + (atCap ? '+' : '');
    if (out.size) out.size.textContent = recommendedW.toLocaleString() + ' W';

    var st = suggestStorage(bill);
    if (out.storage) out.storage.textContent = st.label + (st.note ? ' ' + st.note : '');

    if (out.kwh) out.kwh.textContent = Math.round(producedKwh) + ' kWh';
    if (out.savings) out.savings.textContent = '$' + Math.round(savings);

    input.setAttribute('aria-valuetext',
      '$' + Math.round(bill) + (atCap ? ' or more' : '') + ' per month');

    /* Update slider gradient background */
    var percent = ((bill - 75) / (350 - 75)) * 100;
    percent = Math.max(0, Math.min(100, percent));
    input.style.setProperty('--slider-percent', percent + '%');
  }

  input.addEventListener('input', sizerRender);
  sizerRender();
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
