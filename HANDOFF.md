# Terrace Solar — homepage pass 1

Status as of 2026-08-18. Static site, no framework, no dependencies, no build step.

> **Update, 2026-08-23: the scroll-scrubbed film hero described below has been
> replaced.** The hero is now a short autoplay/muted/looping clip
> (`assets/video/hero-loop.mp4`, ~7.5 s, trimmed from `hero.mp4`) with normal
> document scrolling underneath — no pinning, no `currentTime` scrubbing, no
> giant scroll-height track. The "Hero film" and "Chaptered hero" sections
> below describe the retired architecture for historical context only; see
> the current `index.html` (`[data-hero]`) and `assets/js/site.js` for what
> actually ships now. `hero.mp4` / `hero-scrub-mobile.mp4` are unused but kept
> on disk in case future edits want to draw from the original 42.875 s master.

## What exists

```
index.html              homepage
assets/css/site.css     styles (light + dark, responsive)
assets/js/site.js       configurator readout only (progressive enhancement)
assets/brand/           logo lockups, sun mark and favicon, derived from the supplied PNG
assets/img/             three site images, extracted from the supplied brochure PDF
assets/products/        fact ledger, now with discrepancy / rights / withheld-claim records
assets/reference/       untouched source material
assets/video/           unchanged — generation.json still "not_started"
.claude/launch.json     local preview server (python -m http.server 4173)
```

Preview locally:

```bash
python -m http.server 4173
```

## Page sequence

Hero → at-a-glance strip → the panel → configure (400–2000 W) → how it works →
mounting → product architecture → battery band → availability + commercial
placeholder table → FAQ → sources and attribution → footer.

The semi-flexible panel leads: it is the hero image, the first content section, the
first architecture card, and the subject of the only two product photographs above
the fold.

## Verified in-browser

Checked at http://localhost:4173 in the preview browser:

- No console errors; no failed requests; every referenced local asset resolves.
- No horizontal overflow at 360 px, 1280 px, or 1440 px. The commercial table is the
  only wide element and it scrolls inside its own container.
- Light and dark schemes both render; all sampled text/background pairs clear WCAG AA
  (lowest measured 4.63:1 in light mode on the accent eyebrow, 7.23:1 in dark mode).
  The logo lockup swaps correctly between schemes.
- Keyboard: skip link appears on first Tab; the size chooser is a real radio group and
  responds to arrow keys with the readout updating live; focus rings are visible on
  buttons, chips, links and FAQ summaries.
- Configurator maths spot-checked at 400 / 1200 / 2000 W — kit, panel and inverter
  counts derive from the brochure's own kit definition, with correct singular/plural.
- With JavaScript disabled the size chooser is hidden and a static note explains the
  800 W example, so no stale figures can be shown.
- `prefers-reduced-motion` is honoured (transitions and smooth scrolling both disabled);
  there is no autoplay, no scroll hijacking, and no video.

## Logo

The supplied `Terrace Solar Logo` PNG is 1254x1254 RGB with **no alpha channel**, so it
could not be dropped straight onto the page — it would have shown as a white rectangle.
It was decoded, alpha-keyed against its white matte, cropped, and downscaled into a small
set of site assets in `assets/brand/`. Composited back over white these reproduce the
source exactly.

- `terrace-solar-lockup.png` / `-dark.png` — primary lockup (sun + TERRACE + SOLAR), used
  in the header and footer. Two files because a raster wordmark cannot be recoloured in
  CSS; the dark file carries a cream wordmark and is selected with `<picture>` on
  `prefers-color-scheme`.
- `terrace-solar-mark.png` / `-dark.png` — the sun mark alone, for small or square use.
- `terrace-solar-full.png` / `-dark.png` — the full lockup including the tagline. Generated
  for completeness but **not used on the site** — see below.
- `favicon-128.png` — square favicon built from the sun mark.

Brand colours were sampled from the artwork: ink `#111c29`, amber `#fba728`. The site's
navy ink now matches the logo exactly.

The amber needed one adjustment. At `#fba728` it is 1.84:1 against the page background
and 1.97:1 under white text — far below the 4.5:1 needed for text or buttons. So the
palette splits it: the brand amber is used for graphics (the logo, list bullets), and a
same-hue deepened `#a06203` carries text, buttons and focus rings at 4.63:1 and 4.95:1.
In dark mode the brand amber works unmodified at 9.62:1 and is used directly.

### Tagline — withheld, needs your decision

The logo's tagline reads **"RESIDENT FRIENDLY • HOA COMPLIANT • ENERGY SMART"**.

"HOA COMPLIANT" is an unqualified compliance claim, and it is the one line in the brand
asset I did not put on the page. HOA, landlord and building rules vary by association and
by property; nothing in the source material substantiates blanket compliance; and the
claim directly contradicts the disclaimers this site carries, which tell the shopper to
check their own HOA before ordering. Publishing both would undercut the disclaimer and
create real exposure.

The site therefore uses the tagline-free primary lockup. The full lockup is generated and
sitting in `assets/brand/` ready to use the moment you decide. Options: reword the middle
claim (something like "DESIGNED FOR HOA REVIEW" is defensible), qualify it, or drop it and
keep the two flanking claims, which are ordinary soft marketing and much lower risk.



## Hero film — delivered, with two encode items outstanding

The finished 42.875 s master is wired in as a scroll-scrubbed, pinned, full-viewport hero.
Scroll position maps to `video.currentTime`: down advances, up reverses, stopping holds the
frame. Nothing autoplays, nothing loops, there are no controls, and the video carries no
audio to the page (it is `muted`).

**What was done to the file, losslessly, without re-encoding:**

`full.mp4` had `moov` *after* `mdat`, so a browser had to download all 40 MB before it could
seek at all. `tools/../scratch` re-muxed it into `assets/video/hero.mp4` with `moov` first
and all 2059 chunk offsets patched. Verified: every offset still lands inside `mdat`, and the
lowest offset lands exactly on the mdat data start. Byte size is unchanged.

**Dev server replaced.** `python -m http.server` implements no Range support whatsoever — it
returned the whole 40 MB for a 1 KB range request — which makes seeking impossible. Replaced
with `tools/serve.py`, a stdlib static server with proper 206 byte-range handling. Verified
returning `206` with correct `Content-Range`.

```bash
python tools/serve.py 4173
```

### ⚠ Still needs ffmpeg (not installed on this machine)

**1. Keyframe density — this is the real scrub-quality fix.** The master has a **66-frame
GOP**: only 16 keyframes across 1029 frames. Every seek must decode up to 65 frames, which
is the main source of scrub lag. The damping in the scrubber hides much of it, but the
proper fix is a denser-keyframe re-encode:

```bash
ffmpeg -i hero.mp4 -an -c:v libx264 -preset slow -crf 20 -g 6 -keyint_min 6 -sc_threshold 0 -pix_fmt yuv420p -movflags +faststart hero-scrub.mp4
```

`-g 6` puts a keyframe every 6 frames. Expect the file to grow — trade size for smoothness,
and consider `-crf 23` and/or 1280x720 to compensate. `-an` also strips the audio track,
which the page does not use.

**2. A real mobile encode.** 40 MB is far too heavy for phones, so **mobile currently gets
the poster still and no video at all** — the `src` is only attached by JS once the viewport
and motion checks pass, so phones never download it. That is honest and fast, but a
lightweight encode would let small screens have the film too:

```bash
ffmpeg -i hero.mp4 -an -vf scale=854:480 -c:v libx264 -preset slow -crf 26 -g 6 -keyint_min 6 -sc_threshold 0 -pix_fmt yuv420p -movflags +faststart hero-mobile.mp4
```

Then add it as a second source selected by a `matchMedia` width check.

**3. `assets/video/hero.mp4` is 40 MB and now tracked.** `.gitignore` was excluding all
`assets/video/*.mp4`; an exception was added for `hero.mp4` so the shipped asset is not
silently dropped. For a real deploy this belongs on a CDN, not in git.

### Dev overrides

The hero deliberately withholds the video from `prefers-reduced-motion` visitors. For
development on a machine where that OS setting is on, two URL flags:

| Flag | Effect |
|---|---|
| `?motion=full` | Force the full cinematic path regardless of the OS reduced-motion setting. Remembered for the tab session. Lifts both the JS gate and the CSS reduced-motion net (via `.film--force`). |
| `?motion=auto` | Clear the override and return to production behaviour. |
| `?debug=1` | On-screen readout: viewport, reduced-motion state, `film--on`, fallback reason, video src, `readyState`/`networkState`, duration, buffered, progress, target time, `currentTime`, track height, error. |
| `?debug=0` | Clear the readout. |

`?motion=full` is a **development** flag only. It does not change production behaviour for
anyone who has not typed it, and reduced-motion visitors still get the poster with the video
never fetched.

### Verified in-browser

- Video loads: `readyState 4`, `duration 42.875 s`, `1280x720`, no error, one request.
- Scroll maps to time in both directions, at 1000 vh / 7200 px of travel:
  `0 -> 0.000s`, `0.25 -> 10.719s`, `0.50 -> 21.438s`, `0.75 -> 32.156s`, `1.0 -> 42.875s`,
  then back down through `0.50 -> 21.438s` and `0 -> 0.000s`. Seeks complete (`seeking:false`).
- A decoded frame at t=18.008 s sampled to a canvas: luma range 5-254, mean 75.9 — real
  picture, not a black or flat frame.
- Stage stays `position: sticky` at full viewport height for the whole track.
- Production path with the override cleared: `film--on` false, **video src never attached,
  zero network requests for the MP4**, poster visible, all 10 captions listed, 8 lower
  sections intact.

### Bugs found and fixed during this pass

1. **The reported fault.** The video was withheld because Chrome reports reduced motion.
   Correct for production, wrong for development — fixed with `?motion=full`.
2. **No recovery after a viewport change.** The `resize` listener was registered inside
   `enable()`, so once the hero fell back it could only re-enable via a matchMedia `change`
   event. If that did not fire, it stayed in fallback forever. The listener is now always
   active, and `frame()` re-checks the gate every tick so the state cannot go stale.
3. **Poster crossfade fired too early.** `film--ready` was added on `loadedmetadata`
   (readyState 1 — duration known, no pixels decoded), which can flash black. Now added on
   `loadeddata` (readyState 2, first frame available).
4. **Background-tab media deferral.** Chrome makes no network request at all for media in a
   hidden tab. Added a `visibilitychange` handler that retries `load()` on return.

### Still not verified


Playback and scrubbing could **not** be confirmed in a browser here: both available browser
surfaces reported `document.visibilityState === "hidden"`, and Chrome defers media loading
and `requestAnimationFrame` in background tabs, so `readyState` never advanced past 0 — for
the untouched original file as well as the re-muxed one. The file structure, the Range
serving, the DOM wiring and the fallbacks are all verified; **the actual scrub feel needs a
human with a foreground tab.**



## Chaptered hero — FILM -> HOLD -> CHAPTER -> FILM

The hero is now a scrollytelling timeline rather than one continuous scrub. Scroll maps to
alternating segments:

    scrub(0 -> 14.20s) | HOLD panel | scrub | HOLD battery | scrub | HOLD stack | scrub |
    HOLD connect | scrub(-> 42.875s)

Inside a scrub segment, scroll drives `video.currentTime`. Inside a hold segment the time is
clamped to that chapter's frame and scroll advances the chapter's reveal instead. The mapping
is purely positional, so scrolling up reverses everything exactly — including the chapter
animations, which retract as you leave.

**Verified by simulating the engine's own algorithm** (viewport 800 px):

- Video time is monotonically non-decreasing with scroll.
- Inside each of the four holds the time is a single constant value — genuinely frozen.
- Chapter progress runs 0 -> 1 across each hold.
- Reversibility: identical scroll position always yields identical state.
- Endpoints exact: `t(0) = 0.000`, `t(end) = 42.875`.
- Total ~1509 vh of scrub track + 100 vh sticky = ~12,871 px page at an 800 px viewport.

### ⚠ Three of the four hold timestamps are estimates

`HOLDS` at the top of the film module in `assets/js/site.js`:

| id | timestamp | status |
|---|---|---|
| `panel` | 14.20 s | **estimate** |
| `battery` | 24.80 s | **estimate** |
| `stack` | 28.96 s | confirmed against the master |
| `connect` | 37.60 s | **estimate** |

To capture the real ones: open `?motion=full&debug=1`, scroll to each equipment shot, and
press **H**. Each press logs the exact `currentTime`, appends it to the on-screen readout and
copies the running list to the clipboard. Paste the four numbers into `HOLDS`.

### ⚠ The master film carries a Descript watermark

A translucent "descript" wordmark is burned into the bottom-right of the footage. It is
visible in every hold frame. This breaks the no-text-no-logos rule the whole storyboard was
built around and cannot be removed in CSS without cropping the frame. It needs a re-export
from a paid Descript tier, or whatever tool stitched the master.

### Header removed

The sticky header — logo, nav and the "Request availability" CTA — is gone entirely, so the
film starts flush at the top of the viewport. Orphaned markup left behind by an earlier edit
was cleaned up too. The nav links still exist in the footer; if the logo should return it
would be as an overlay inside the film stage, not a bar above it.


## Claim discipline

Every public statement carries a source badge naming the brochure page, or is marked as
owner positioning or pending. `assets/products/products.json` now records:

- `withheld_claims` — brochure claims deliberately **not** published: UL 1741 and all
  standards lists, battery cycle/service life, comparative safety claims, price per
  watt, delivery time, install time, "no permits needed", offset percentages, appliance
  runtimes, and inverter reaction time.
- `open_discrepancies` — two conflicts found in the source, published as neither value.
- `asset_rights` — per-file rights status.

"Lightweight" is carried visually (thin profile, one-person handling) and is labelled
owner positioning wherever it appears in words. No weight, dimension, efficiency or
warranty figure is stated anywhere, because the brochure states none.

## Open items for the owner

**Blocking publication**

1. **Image rights.** All three site photographs come from the Craftstrom brochure.
   Written permission from the rights holder is required before this goes public.
2. **Mounting imagery is unusable.** `assets/reference/mounting-reference.png` carries a
   third-party watermark ("emperysolar"). The mounting section is therefore text-only.
   Licensed photography or renders of the actual hardware are needed.
3. **Contact path.** `hello@example.com` is a placeholder. Replace with a monitored
   inbox, or a form with an approved backend and privacy notice.
4. **Legal review** of the disclaimers, the attribution wording, and the decision to
   withhold the claims listed above.
5. **The logo tagline.** "HOA COMPLIANT" is withheld pending your decision — see the Logo
   section above.

**Needs manufacturer confirmation**

6. **Adjustable mount angle.** The brochure's mounting page says 20–40°; the fact ledger
   says 20–30°. Neither is published.
7. **Panel wattage.** Page 2 says "400 Watt Panels"; page 8 defines a 400 W kit as two
   200 W panels. The site uses the page 8 definition.
8. **Datasheet.** Panel dimensions, weight, efficiency and warranty — all currently
   "not stated in source".
9. **Certification documents** with current dates and scopes, if any certification is to
   be shown at all.

**Commercial data still missing**

Price, variants, stock, lead time, shipping, returns, warranty, financing. All are
rendered as explicit "Unknown / Pending owner data" placeholders. There is no checkout
and no purchase path, by design.

## Hero video — superseded

The six-scene API plan and the eleven-keyframe storyboard both did their job: the finished
master exists and is wired in. See "Hero film" above for its current state.

`assets/video/generation.json` remains untouched at `status: "not_started"` with no task IDs
and no outputs — no Runway API call was ever made. All generation was done by hand in the
Runway web app on the existing subscription. The eleven approved keyframes are in
`review/runway/keyframes/`.

## Suggested next pass

Mounting photography once rights are cleared, then the retail layer (variants, price,
stock) once owner data lands — that is what currently blocks the page from being a
storefront rather than a product story.
