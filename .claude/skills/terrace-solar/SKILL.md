---
name: terrace-solar
description: Build and iterate the Terrace Solar retail website and hero media from the supplied Craftstrom brochure, with semi-flexible lightweight panels as the visual lead and strict source-grounded claims.
---

# Terrace Solar: zero-to-retail master loop

Own the project from source audit through a deployable, conversion-ready storefront. Work autonomously in small verified passes. Preserve user work and ask only when a missing business decision would materially change the result.

## Source of truth

Read these before product or marketing work:

- `assets/products/products.json` for the compact fact ledger.
- `assets/reference/Craftstrom-Presentation-2026.pdf` when wording, diagrams, or appearance matters.
- `assets/reference/*.png` for product appearance.
- `assets/video/generation.json` before generating or wiring video.

Treat every brochure statement as a manufacturer/source claim, not independent verification. Never invent dimensions, weight, efficiency, warranty, price, availability, certifications, code compliance, installation legality, savings, output guarantees, shipping time, or performance. Preserve `unknown` values. Claims involving safety, certification, lifespan, permits, installation time, price, utility rules, or savings require owner/legal verification before publication. Do not silently convert “semi-flexible” into “fully flexible” or “lightweight” into a numeric weight.

## Primary product hero

Make the semi-flexible, lightweight-feeling panel system the visual differentiator across the hero, product cards, comparison, installation story, mobile composition, and generated media. The brochure explicitly says “semi-flexible” on page 2 and “ultra thin” / “flexible solar panels with aluminum frame and stands for easy install” on page 7. “Lightweight” is the owner’s positioning priority, but the brochure gives no mass; communicate it visually through thin profile and one-person handling, and label any written lightweight claim as owner-supplied until substantiated.

Do not default to thick conventional rooftop panels when the supplied panel imagery is available. Do not depict extreme bending, rolling, folding, unsupported sagging, walking on panels, unsafe railing work, roof work, improvised mounts, fictional hardware, or connectors not present in references.

## Operating loop

Repeat until acceptance checks pass:

1. **Audit** - inspect the existing project, fact ledger, references, generation state, and current UI. Identify the smallest valuable next pass.
2. **Plan** - state the intended outcome, files affected, unknowns, and a concrete verification method. Keep a single active implementation pass.
3. **Build** - implement with semantic HTML, accessible controls, responsive CSS, progressive enhancement, and local assets. Prefer a fast static site unless the repository already establishes a framework.
4. **Generate** - only when media is missing. Update scene state before and after each attempt. Never put secrets in client code, logs, prompts, JSON, or commits.
5. **Verify** - run available checks, preview desktop and mobile, inspect console/network errors, test keyboard navigation and reduced motion, and confirm every product claim against `products.json` or the PDF.
6. **Refine** - fix the highest-impact defect and repeat. Stop paid generation after two failed attempts per scene; record the blocker and preserve outputs.
7. **Handoff** - leave a deployable build, concise status, unresolved placeholders, and exact next actions. Never claim deployment, checkout, analytics, legal approval, or generation succeeded without evidence.

## Retail experience target

Create a calm, premium, practical residential-energy experience. Lead with the product difference, then explain the system without overwhelming the shopper.

Recommended page sequence:

1. Hero: semi-flexible panel in a believable terrace/balcony context; concise benefit statement; primary shop/configure CTA; secondary how-it-works CTA.
2. Thin-and-easy-to-handle proof: close profile, careful one-person positioning, restrained source-grounded copy.
3. Modular system: 400 W steps shown as 400/800/1200/1600/2000 W configurations.
4. How it works: panels -> inverter -> home wiring/outlet -> power meter; battery as an optional/related system component only where supported.
5. Mounting: flat balcony mount and adjustable 20-30 degree balcony/fence mount; distinguish glass-panel hardware imagery from semi-flexible panel imagery.
6. Product architecture: panels, smart inverter, power meter, battery, wiring/mounting.
7. Trust and FAQ: source attribution, compatibility unknowns, installation/permit/utility disclaimers, and support CTA.
8. Retail layer: variants, price, stock, shipping, tax, warranty, returns, checkout and legal copy stay explicit placeholders until owner data exists.

Never create a live purchase path with placeholder commercial data. A demo CTA may say “Request availability” or “Configure your system.”

## Hero motion system

Use a still-image-first hero. Video enhances it and must not block load, readability, reduced-motion behavior, or mobile performance. Keep text as real HTML, not baked into generated footage.

Create a seamless 16:9 master suitable for responsive cropping, then derive web encodes/poster. Aim for 12-18 seconds total using 4-6 short scenes. Favor slow, controlled camera movement, consistent warm daylight, realistic residential architecture, accurate panel proportions, and clean negative space for copy.

### Scene plan

1. **Arrival / context** - premium terrace or balcony at early morning; panel system already belongs in the space; slow lateral reveal.
2. **Product hero / handling** - closest attention to the semi-flexible panel: thin edge profile, subtle controlled flex only, one adult safely lifting or positioning one panel with two hands; no acrobatics or unsafe railing reach.
3. **Mounting clarity** - close detail of the supplied-style stand or balcony hardware; believable fasteners and contact points; no tool or part invention.
4. **Connected system** - panel, inverter/power meter, and home represented through a restrained physical shot or clean motion graphic; no false electrical animation.
5. **Lifestyle payoff** - quiet occupied home/terrace, subtle app glance if a faithful UI reference exists; otherwise omit the screen.
6. **Loop return** - camera/color/action resolves naturally into scene 1 with no logo or text in footage.

### Prompt kernel

Every generation prompt must include: exact reference image(s); scene purpose; product geometry and material cues; camera/lens/motion; lighting; environment; action; continuity anchors; crop-safe composition; and negatives. Include: “preserve the supplied product design; ultra-thin semi-flexible solar panel with aluminum frame; only slight realistic flex; no thick rooftop panel, no warped cells, no extra cables, no floating hardware, no text, no logos, no unsafe installation.” Adjust only what the scene needs.

Use `tools/runway-generate.mjs` as the local secret-safe scaffold. Confirm current Runway API model names, endpoints, payloads, pricing, and terms from official documentation before completing the adapter. Prefer image-to-video with the extracted references. Save returned IDs/paths and errors to `assets/video/generation.json`; save media under `assets/video/` and never overwrite a successful take.

## Product and copy rules

- Use “Terrace Solar” as the storefront brand and “Craftstrom” only for source/product attribution unless the owner directs otherwise.
- Use the modular wattages exactly as the brochure presents them.
- Distinguish direct facts, brochure claims, owner-supplied positioning, and unknowns.
- Avoid “free energy,” guaranteed savings, universal no-permit language, and universal plug-and-play legality.
- Do not republish the brochure’s comparative, safety, certification, price, delivery, runtime, or lifespan claims without explicit approval and current substantiation.
- Add concise disclaimers where local electrical, building, balcony, landlord/HOA, utility, or interconnection rules may apply.

## Engineering and accessibility

- Optimize images and video; lazy-load below the fold; provide poster and fallback imagery.
- Honor `prefers-reduced-motion`; no scroll hijacking; no autoplay audio.
- Maintain visible focus, usable touch targets, semantic landmarks, descriptive alt text, and sufficient contrast.
- Keep secrets server-side/local. Sanitize forms and do not collect sensitive data without an approved backend and privacy notice.
- Avoid new dependencies unless they materially improve the result.

## Acceptance checks

- The first screen clearly features the thin semi-flexible panel, not generic rooftop solar.
- All public-facing claims map to a source entry or are visibly marked for approval.
- Unknown commercial and technical fields remain placeholders.
- Layout works at 360 px, tablet, and desktop widths with video disabled.
- Keyboard, reduced motion, missing media, and slow connection paths remain usable.
- No broken links, missing local assets, console errors, exposed secrets, or untracked generated state.
- Final handoff separates completed work, evidence, and owner decisions still required.

