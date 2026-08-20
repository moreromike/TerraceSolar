# Terrace Solar — hero film scene prompts

> **SUPERSEDED (2026-08-19).** This six-scene plan has been replaced by the continuous
> sunlight-journey storyboard in [STORYBOARD.md](STORYBOARD.md) — eleven keyframes and ten
> keyframe-bracketed segments. Kept for reference: the shared negative prompt, the safety
> negatives and the two blocking reference problems below all still apply and carry over.

**Status: prepared, not run. Nothing has been generated and nothing has been spent.**
`generation.json` is untouched at `status: "not_started"`, all six scenes `missing`.

Read the two blocking notes under "Before anything is run" first — two of the six scenes
have reference assignments in `generation.json` that should not be used as written.

---

## Master spec

| | |
|---|---|
| Deliverable | One seamless 16:9 master, 12–18 s total, cut from six scenes |
| Per scene in the cut | ~2.5–3 s |
| Per scene generated | 5 s, then trimmed — gives handles for the cut |
| Method | Image-to-video, one supplied reference per scene |
| Audio | None. The hero is muted and has no audio track |
| Text/logos in footage | None, ever. All copy stays real HTML over the video |
| Loop | Scene 06 resolves into scene 01 on camera direction, colour and light |

**Web use.** The master is still-image-first: `panels-outdoor.jpg` remains the poster and
the video layers on top only after load, only above the mobile breakpoint, and only when
`prefers-reduced-motion` is not set. It must never block first paint.

### Continuity anchors — identical across all six scenes

- **Time and light.** Early morning, sun low, warm daylight around 5000–5600 K. Long soft
  shadows, gentle atmospheric haze. No midday sun, no golden-hour orange push, no overcast.
- **Place.** One residential back terrace: pale grey stone paving, warm vertical timber
  screen behind, low planting at the edges. Same location in every outdoor scene.
- **Product.** Four to six ultra-thin semi-flexible panels, matte dark blue-black, fine
  pale gridlines, thin aluminum frame, sitting low on matte black perforated aluminum
  stands. Same count, same finish, same stand geometry throughout.
- **Camera.** ~1.2 m height, 35 mm equivalent unless noted, moves at roughly 10 cm/s. No
  handheld shake, no whip pans, no crash zooms, no drone.
- **Grade.** Photoreal, natural colour, mild contrast. No stylisation, no film emulation,
  no lens flare added in post.

### Crop-safe composition — applies to every scene

Frame for 16:9 but protect a centre 4:5 column so the master can be cropped to portrait
for mobile without losing the product. Keep the **upper-left third** clear of detail for
the desktop headline, and keep the **lower third** clean for the mobile headline and CTA.
Never place the product across the extreme frame edges.

### Shared negative prompt — paste into every scene, unchanged

```
preserve the supplied product design; ultra-thin semi-flexible solar panel with aluminum
frame; only slight realistic flex; no thick rooftop panel, no warped cells, no extra
cables, no floating hardware, no text, no logos, no unsafe installation
```

### Additional negatives — also every scene

```
no rolling or folding the panel, no bending beyond a few millimetres, no unsupported
sagging, no one standing or walking on a panel, no working over or leaning across a
railing, no roof work, no ladders, no improvised or invented mounts, no connectors that
are not in the reference, no sparks, arcs, glowing wires or animated electricity, no
brand marks, no readable screens, no children, no pets, no crowds
```

---

## Scene 01 — Arrival / context

- **Purpose:** establish that the system already belongs in the space. First frame of the loop.
- **Reference:** `assets/img/panels-outdoor.jpg`
- **In the cut:** ~3 s

> Slow lateral dolly, left to right, across a residential back terrace in early morning.
> Four ultra-thin semi-flexible solar panels sit low on matte black aluminum stands on pale
> stone paving, angled toward a low sun. A warm vertical timber screen stands behind them,
> softly out of focus. The panels are completely rigid and still on their stands — nothing
> moves but the camera and a slight drift of light. Warm low-angle daylight, long soft
> shadows stretching across the paving, faint morning haze. Camera at 1.2 m, 35 mm
> equivalent, steady 10 cm/s lateral move, no shake. The upper left third of frame stays
> open and uncluttered. Photoreal, natural colour.

---

## Scene 02 — Product hero / handling

- **Purpose:** the closest attention to the panel — thin edge profile and one-person handling. This is the shot that carries the whole differentiator.
- **Reference:** `assets/img/panel-handling.jpg`
- **In the cut:** ~3.5 s (longest scene)

> Slow push-in toward the long edge of a single ultra-thin semi-flexible solar panel. One
> adult in a plain grey t-shirt, standing squarely on the ground with both feet planted,
> lifts the panel with two hands on its frame, holds it level, and sets it back down onto
> a low matte black aluminum stand. The movement is slow, controlled and deliberate. The
> panel stays flat and level throughout, with only a few millimetres of natural flex along
> its length — it never bows, curls or folds. Keep the slim edge profile of the panel in
> sharp focus against a softly defocused background. Warm early morning daylight from the
> left, soft shadow under the panel. Camera at 1.1 m, 50 mm equivalent, slow 8 cm/s push-in,
> shallow depth of field. Photoreal, natural colour.

**Watch for on review:** the panel must never bend more than a few millimetres, and both
of the person's hands must stay on the frame for the whole move. Reject the take otherwise.

---

## Scene 03 — Mounting clarity

- **Purpose:** show the real contact point between panel and stand. Believable hardware only.
- **Reference:** `assets/img/panel-handling.jpg` — **not** the reference currently named in `generation.json`, see the blocking note below.
- **In the cut:** ~2.5 s

> Extreme close-up detail of the join where an ultra-thin solar panel's aluminum frame
> meets a matte black perforated aluminum stand. The bracket, its regular row of
> perforations and the panel's thin edge are all crisply visible. Very slow drift of the
> camera to the right, barely moving, revealing the length of the stand's leg and its
> contact with the pale stone paving. Nothing is touched or assembled — this is a still
> observation of hardware that is already in place. Warm raking morning light picking out
> the machined edges of the bracket. Macro, 85 mm equivalent, 4 cm/s drift, very shallow
> depth of field. Photoreal, natural colour.

**Watch for on review:** any fastener, clamp or bracket shape that is not visible in the
reference is an invention — reject it.

---

## Scene 04 — Connected system

- **Purpose:** convey "this connects to your home" through one restrained physical shot. No electrical animation.
- **Reference:** `assets/img/power-meter.jpg` — **not** the reference currently named in `generation.json`, see the blocking note below.
- **In the cut:** ~2.5 s

> A small matte black power meter module with a plain LCD display and two split-core
> current clamps rests on a clean pale surface, its cables coiled neatly beside it. Very
> slow parallax drift of the camera from left to right across the module, bringing the
> display and then the clamps through focus. The device is inert and still — the display
> does not change, nothing blinks, nothing glows, no light travels along any cable. Soft,
> even, cool-neutral daylight from a window off frame, gentle falloff into shadow at the
> edges. 60 mm equivalent, 5 cm/s drift, shallow depth of field. Photoreal, natural colour.

**Watch for on review:** no animated current, no pulsing LEDs, no readable numbers on the
display. If the display resolves into legible digits, reject — those would be fabricated
readings.

---

## Scene 05 — Lifestyle payoff

- **Purpose:** the quiet, occupied home. Payoff without a product pitch.
- **Reference:** `assets/img/battery-home.jpg`
- **In the cut:** ~2.5 s

> A tall cylindrical matte black battery unit stands on a warm wooden floor in a calm,
> lived-in living room, a bicycle leaning against the wall behind it and a potted plant
> catching light to the right. Very slow push-in past the plant toward the battery, with
> soft morning light moving almost imperceptibly across the floor. The room is still and
> empty of people. The thin warm light ring at the base of the unit stays constant and
> subtle — it does not pulse, sweep or animate. 40 mm equivalent, 6 cm/s push-in, shallow
> depth of field, warm interior grade matched to the exterior scenes. Photoreal, natural
> colour.

**Deliberately omitted:** no phone, tablet or app screen. The skill only permits a screen
if a faithful UI reference exists as a separate asset, and we do not have one extracted.
Adding an invented dashboard would fabricate energy figures.

---

## Scene 06 — Loop return

- **Purpose:** resolve back into scene 01 so the master loops with no visible cut.
- **Reference:** `assets/img/panels-outdoor.jpg` (same frame family as scene 01)
- **In the cut:** ~2.5 s

> Slow lateral dolly continuing left to right across the same residential terrace, now
> pulling back slightly to a wider view of the four ultra-thin semi-flexible panels on
> their low matte black stands, pale stone paving and warm timber screen behind. The
> panels are rigid and motionless. Light, colour and camera speed match the opening shot
> exactly so the end of the move can be cross-dissolved into its beginning. Camera at
> 1.2 m, 35 mm equivalent, steady 10 cm/s lateral move easing very slightly at the end.
> Photoreal, natural colour.

**Cut note:** match the last 8–12 frames of this scene to the first frames of scene 01 on
camera position, shadow direction and white balance, then cross-dissolve.

---

## Before anything is run

### Two blocking reference problems in `generation.json`

**Scene 03 currently points at `assets/reference/mounting-reference.png`. Do not use it.**
Two independent reasons: it carries a third-party vendor watermark ("emperysolar"), so it
is not ours to feed into a generation service; and it shows balcony hardware for framed
**glass** panels, not the stands that come with the semi-flexible panels. Feeding it in
would produce mounting footage for the wrong product. Use the stand detail in
`panel-handling.jpg` instead.

**Scene 04 currently points at `assets/reference/system-reference.png`. Do not use it.**
That file is the brochure's "How it works" diagram, with headline text, price range,
courier name and setup-time claims baked into the artwork. Every one of those is on the
withheld-claims list, and text in a reference tends to bleed into the output — directly
against the no-text-in-footage rule. Use the physical power meter shot instead.

I have not edited `generation.json`, since no attempt has been made and the reference
choice is partly yours. Say the word and I will re-point both scenes.

### Still open

- **Image rights.** All six references are Craftstrom brochure photography. Sending them
  to a third-party generation service is a distribution of that material — get the rights
  holder's written permission first. This is the real gate.
- **Runway API specifics are unverified.** Current model names, endpoints, payload shape,
  pricing and terms all need confirming against official documentation before the adapter
  is completed. `tools/runway-generate.mjs` is still a scaffold. I have deliberately not
  guessed at any of it.
- **Spend control.** Two failed attempts per scene, maximum, then stop and record the
  blocker in `generation.json`. Never overwrite a successful take. Log task IDs, output
  paths and errors as you go.
- **Secrets.** `RUNWAYML_API_SECRET` lives in `.env`, which is gitignored. It must never
  appear in client code, prompts, JSON, logs or commits.

### Suggested order

Run **scene 02 first, alone.** It is the hardest shot — a person handling a thin panel is
where the model is most likely to produce over-bending or unsafe posture — and it carries
the product story. If scene 02 cannot be made to work, the film concept needs rethinking
before spending on the other five.
