---
name: terrace-solar-cinematic
description: Continue or build a premium cinematic, scroll-driven Terrace Solar website centered on semi-flexible ultra-thin solar panels. Use to resume the existing Terrace Solar loop without discarding completed work, add the scrubbing hero, improve landing pages and product storytelling, or prepare for launch. Video generation and deployment are optional and provider-neutral.
---

# Terrace Solar cinematic website

Create a premium scroll-driven website for Terrace Solar. The signature experience is a product-led hero that makes the semi-flexible, ultra-thin panel feel tangible: thin edge, slight controlled flex, easy handling, and credible terrace or balcony use. The page then settles into a clear retail story with one primary call to action.

Talk to the user in short, plain language. They should make taste and business decisions, not technical decisions. Explain one next step at a time. Never initiate paid generation, connect an external service, publish, or buy anything without explicit approval immediately before the action.

## Start with what already exists

Inspect the project before asking questions. Prefer, when present:

- `assets/products/products.json` for approved/source-grounded facts.
- `assets/reference/` for product appearance and the supplied Craftstrom brochure.
- `assets/video/generation.json` for media state.
- Existing site files and brand assets.

## Resume protocol: continue, do not restart

Assume an existing Terrace Solar project is a partially completed loop, not a blank project. Before proposing or changing anything:

1. Inventory the current files and identify the active website entry point.
2. Read the product fact ledger, generation state, current page, and existing media references.
3. Summarize the current checkpoint in four short lines: completed, usable assets, missing pieces, and the next smallest step.
4. Map the checkpoint to the gates below and begin at the first incomplete gate. Do not replay completed gates.

Preserve and reuse:

- Approved wording and layout decisions.
- Extracted product images and the source PDF.
- `assets/products/products.json` and all deliberately unknown values.
- Successful or approved video takes.
- Scene IDs, task IDs, prompts, outputs, and errors in `assets/video/generation.json`.
- Existing HTML, CSS, JavaScript, accessibility work, and responsive behavior that still serve the approved direction.
- Existing Runway scaffold and environment-variable names if the project already contains them.

Never replace the current site with a generic template just because this skill has a preferred structure. Upgrade it in place. Before a substantial redesign, preserve the current working version in a clearly named local review snapshot or rely on version control when available. Do not duplicate the source PDF or generate replacement product images when usable originals already exist.

### Checkpoint mapping

- Existing fact ledger and references: source audit is complete.
- Existing functional static homepage: Gate 2 is complete unless the user asks to revise it.
- Existing storyboard or scene records: reuse them and complete only missing motion decisions.
- Approved video in `assets/video/`: skip generation and begin Gate 4.
- `generation.json` with `missing` scenes: preserve its scene IDs and plan only those missing scenes.
- Existing scrub implementation: inspect and repair it using `references/scroll-hero.md`; do not rebuild it automatically.
- Existing deployment: treat the live site as production and require explicit approval before changing it.

If the user says “continue,” “pick up where we left off,” or similar, do not ask them to repeat information already stored in the project. Discover it from the files first.

Read [references/solar-facts.md](references/solar-facts.md) before writing product copy. If the project fact ledger conflicts with this reference, flag the conflict and use neither claim publicly until resolved. Treat brochure statements as source claims, not independent verification.

## The creative direction

The site should feel architectural, warm, precise, and practical, not like generic rooftop-solar advertising. Build around one visual idea: **energy that fits the space**.

Use the panel as the signature element:

- Show the real supplied panel design whenever possible.
- Communicate thinness with edge-on views, layered shadows, measured spacing, and close product detail.
- Show only slight, realistic flex. Never roll, fold, sharply bend, sag, or distort the panel.
- Show safe two-handed handling and credible mounting. Do not depict unsafe leaning over railings or invented hardware.
- Keep conventional thick rooftop panels out of the visual language unless used in a labeled comparison.

Avoid solar clichés: giant roof arrays, glowing green leaves, fantasy energy beams, over-saturated blue skies, generic stock families, and unsupported savings counters. Avoid AI-looking luxury defaults and decorative effects without meaning.

Read [references/design-system.md](references/design-system.md) before creating or substantially restyling the page.

## Build order

Work in small gates so the user does not spend tokens or money on unwanted work.

### Gate 1: One-page direction

Inspect available assets and propose one recommended direction in simple language, including:

- Hero composition.
- Static-first or scroll-video hero.
- Page sequence.
- Primary call to action.
- Information still missing.

If enough context exists, proceed with a static first pass without waiting. Do not generate new media yet.

### Gate 2: Static first pass

Build the complete page using existing imagery. The experience must already feel finished without video. Prefer plain HTML, CSS, and vanilla JavaScript when starting from scratch; preserve an established framework if the project already uses one.

Recommended sequence:

1. Hero: product difference and primary CTA.
2. Thin-profile proof: close panel detail and restrained handling story.
3. Modular system: 400 W increments and listed configurations.
4. How it works: panels, inverter, power meter, household, optional battery where supported.
5. Mounting: distinguish the brochure's glass-panel mounting hardware from semi-flexible panel stands.
6. Product ecosystem: panel, inverter, power meter, battery.
7. Trust and questions: source attribution, compatibility unknowns, local-rule disclaimer.
8. Final CTA: request availability, schedule a consultation, or another owner-approved action.

Do not create a functioning checkout from placeholder prices, stock, warranty, shipping, tax, or return information.

Preview at desktop and phone widths. Fix obvious issues before showing it.

When resuming, keep the current page's strongest approved design choices and add only what the next checkpoint needs. The static page remains the fallback and content foundation for the scrubbing hero, so none of this work is throwaway.

### Gate 3: Motion plan

Only after the static direction is approved, propose motion. Use existing footage if suitable. If generation is desired, first present:

- The exact scenes.
- Which reference image anchors each scene.
- The chosen provider and model.
- Current documented price or credit estimate.
- Number of paid attempts authorized.

The user must approve the plan and cost before any paid request.

When `assets/video/generation.json` exists, update it instead of creating a competing plan. Preserve successful scenes, keep missing scenes marked missing until generated, and record proposed prompts separately from completed outputs. Never reset the file to an all-missing state.

The default hero journey is 12 to 18 seconds across short scenes:

1. Terrace arrival.
2. Thin panel edge and careful handling.
3. Credible mounting detail.
4. Connected system.
5. Quiet home payoff.
6. Natural return to the opening composition.

Every prompt must preserve supplied product geometry and include: slight realistic flex only; no thick rooftop panel; no warped cells; no extra cables; no floating hardware; no fictional controls; no text; no logos; no unsafe installation.

Video generation is provider-neutral. Use a connected provider or a project adapter only when available and explicitly chosen by the user. If Runway is chosen, confirm its current official API endpoint, model, payload, price, and terms before completing or using an adapter. Keep all API secrets outside client code and committed files.

### Gate 4: Scroll treatment

If approved footage exists, implement the scroll experience using [references/scroll-hero.md](references/scroll-hero.md). The video is decorative; real HTML carries all text and calls to action.

Phone, portrait tablet, reduced-motion, failed-video, and slow-network experiences use a deliberately composed static hero. Never make motion a requirement for understanding or conversion.

Integrate the scrub into the existing hero in place:

- Keep the existing headline, CTA, source-grounded copy, and static poster experience unless the user approves changes.
- Treat the current hero image as the poster or temporary scrub background.
- Build and test the scroll mechanics before requiring final generated footage; a short local placeholder clip may be used only for engineering tests and must never ship as product footage.
- Wire final approved footage by replacing the media path and measured byte size, not by rebuilding the page.
- Keep lower sections intact while the sticky hero gains scroll depth above them.
- Record the scrub implementation checkpoint in `assets/video/generation.json` notes or an existing project status file.

### Gate 5: Launch readiness

Before publishing, verify:

- Every public product claim maps to an approved source.
- Unknown commercial fields remain visibly unresolved.
- The entire experience works without video and JavaScript enhancements.
- Keyboard, focus, contrast, touch targets, reduced motion, and semantic structure pass.
- Desktop and phone layouts are visually checked.
- Links, forms, console, and media requests work.
- No secrets, raw generations, review files, or placeholder contact details ship.

Deployment is provider-neutral. Use the user's selected host and confirm the destination before publishing. Verify the live URL over HTTPS after deployment. Never assume that a successful upload means the site works.

## Copy and claim rules

- Use “Terrace Solar” as the storefront brand. Use “Craftstrom” only for accurate source or product attribution unless directed otherwise.
- “Semi-flexible” and “ultra-thin” are source-supported. “Lightweight” is owner positioning, but no numeric panel weight is supplied; do not invent one.
- Avoid guaranteed savings, universal permit-free or plug-and-play claims, universal code compliance, and safety guarantees.
- Certification, testing, lifespan, runtime, installation-time, shipping, price, and utility claims require current verification before publication.
- Where local electrical, building, landlord, HOA, balcony, interconnection, or utility rules may apply, say so plainly.
- Never add testimonials, ratings, customer counts, press logos, awards, or case studies without evidence.

## Finish each pass cleanly

Report:

1. What changed.
2. What was verified.
3. What still needs the owner's decision.
4. The single best next step.

Do not automatically repeat the full workflow. Stop after the requested pass unless a safe, clearly approved next step remains.
