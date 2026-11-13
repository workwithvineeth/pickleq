# RallyQ photo set v2 — 12 November 2026

Local asset handoff; no app source, scoring screen, branch, deployment or database changed.

## Contents
- index.html: desktop and 390px phone review gallery with illustrative overlays.
- desktop/: 13 named delivery JPGs at requested desktop dimensions.
- mobile/: 13 exports, each 1080px wide, sized for its mapped phone slot.
- previews/: actual 390px-wide previews.
- originals/: full generated PNGs. These are NOT the compressed shipping assets.
- manifest.json: dimensions, sizes, source provenance, persona, analogy and slot.
- prompts.json: generation prompts, using built-in image_gen, no API key.
- export.py: reproducible sizing and JPEG compression.
- integration.css: opt-in example mapping, not installed in the app.

Every desktop/mobile JPEG is below 400,000 bytes. Generated sources are smaller than requested desktop exports, so those exports are upscaled; this does not add original detail.
Some phone versions retain the whole scene on Night green rather than crop out people/courts. See manifest. Phone layouts are proposals, not screenshots of the running app. Final in-app readability/contrast and 320px checks remain for integration.

## Source mapping checked locally
Review checkout: /Users/kathi.staines@zomato.com/Desktop/PaddleQ-review
Branch fix/15nov-must, local HEAD 241ca30. Existing 15-file fix work preserved.
Remote freshness and live CI were not verified for this asset task.

- public/rallyq/rq.css and src/rallyq/shell/v12.css both carry photo definitions.
- src/rallyq/rallyq.css also overrides the home hero at desktop widths.
- src/rallyq/home/Main.html and prototypes/Main.dc.html contain repeated home-card classes.
- Event.dc.html uses ph-group; Live.dc.html uses ph-night.
- Studio.dc.html uses ph-man; MyStudio.dc.html uses ph-woman.
- Overview.dc.html and MyStudio.dc.html share tiny ph-ball tiles deliberately.
- src/rallyq/social/RallySocial.tsx has BOTH screen template photo classes and a separate exportPoster photo filename map. Update both when integrating, or shared posters will still export old images.
- Do not globally replace ph-group/ph-night/ph-woman: they need slot-specific classes or data attributes.

## Integration approach for Vineeth
1. Review index.html and choose assets.
2. Copy desktop and mobile folders plus adapted integration.css into the public image directory. Keep originals and handoff local.
3. Assign unique data-rq-photo attributes matching filenames; remove conflicting old photo classes/hero overrides. Ensure the prototype renderer forwards the new attribute, or use explicit unique classes instead.
4. Preserve %BASE% / configured base URL handling used by shell/v12.css. Relative CSS image paths resolve against the stylesheet.
5. Add dark gradients behind text; keep photos outside scoring/desk controls. Decorative backgrounds must not supply essential information.
6. Fictional profile photos must stay labelled demo-only. Real profiles use the user's own image or initials. Never pair invented athletes with real winners as though they are the winning players.
7. Social exports need their own matching filenames (Champions, Result, Entries open, Live now) and export parity verification.
8. Check actual mobile routes at 320px and 390px, overlays, profile face positions, score readability, reduced-motion behaviour, and exported poster images before shipping.

No referee photograph was generated: the revised brief explicitly dropped it. Organiser hands is optional. UI Motion Lab and camera tracking are separate workstreams.
