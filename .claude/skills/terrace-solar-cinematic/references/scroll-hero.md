# Scroll hero engineering guide

Use this only after approved motion exists. A complete static page comes first.

## Structure

- A tall hero contains a sticky viewport stage.
- Scroll progress maps from 0 to 1 and controls video time.
- Real HTML captions sit over the decorative media.
- The final frame resolves into the first below-fold section.

Start around 350 to 450 viewport heights for a short single clip. Increase scroll distance only when additional story beats need reading room.

## Media preparation

Create a web scrub encode with frequent keyframes:

```sh
ffmpeg -i raw.mp4 -c:v libx264 -crf 19 -preset slow -g 8 -keyint_min 8 -pix_fmt yuv420p -movflags +faststart -an assets/hero-scrub.mp4
```

Create poster and ending frames:

```sh
ffmpeg -i assets/hero-scrub.mp4 -frames:v 1 -q:v 2 assets/hero-poster.jpg
ffmpeg -sseof -0.1 -i assets/hero-scrub.mp4 -update 1 -frames:v 1 -q:v 2 assets/hero-ending.jpg
```

Inspect the output after every encode. Target a practical web size; adjust compression one variable at a time and protect smooth gradients from banding.

## Loading

- Ship the video with `preload="none"` and no initial `src`.
- Paint the poster first.
- Load motion only on eligible desktop-like screens.
- For hosts with unreliable range requests, fetch the complete video as a Blob before seeking.
- Show honest loading progress for large files and abort into the static state after a stalled request.

## Smooth seeking

- Ease displayed progress toward target progress using `requestAnimationFrame` and delta-time normalization.
- Stop the loop when converged and when the hero is offscreen.
- Never issue a new `currentTime` write while a previous seek is in progress; coalesce to the newest pending target.
- Touch the DOM only when caption state or displayed values actually change.

## Caption pacing and legibility

- Give each caption a long fully visible plateau and short eased ramps.
- Test with normal and aggressive wheel flicks; no meaningful beat may be skipped.
- Keep captions in planned negative space.
- Use a global scrim, a local per-caption scrim, and a real text shadow.
- Check the worst frame behind each caption, not the average frame.
- Require at least 4.5:1 contrast for ordinary text and 3:1 for large text.

## Static gates

Use a deliberately designed static hero when any applies:

- Narrow phone layout.
- Portrait tablet or coarse-pointer portrait layout.
- Short landscape phone.
- `prefers-reduced-motion: reduce`.
- Video failure or timeout.

Keep CSS and JavaScript media-query conditions identical and respond to live changes such as rotation or a reduced-motion preference change. The static page must remain complete if the video file is missing.

## Accessibility and performance

- Decorative video uses `aria-hidden="true"`, no controls, and no tab stop.
- Never autoplay audio.
- Provide semantic landmarks, a skip link, visible focus, and 44-pixel touch targets.
- Animate transform and opacity only where possible.
- Pause ambient animations offscreen and on hidden tabs.
- With reduced motion, show all content in its finished state and make no video request.

## Verification

Check at minimum:

- 1280 x 800 and 1440 x 900 desktop.
- 375 x 812 and 375 x 667 phone.
- Fast scroll at the top, middle, and ending.
- Keyboard navigation and every link/button.
- Reduced motion before load and toggled while open.
- Blocked or missing video.
- Slow loading or interrupted video.
- Zero browser-console errors.
- No horizontal overflow.

