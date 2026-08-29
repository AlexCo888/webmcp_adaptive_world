# Generated visual provenance

## Scope

Adaptive World created 15 visual designs with OpenAI's built-in image
generation in ChatGPT on 2026-08-29:

- one Adaptive Gym hero;
- 12 equipment catalog renders;
- one Adaptive Gym app icon; and
- one Digital Passport app icon.

The repository keeps web-delivery derivatives rather than large intermediate
generation files. Content images are WebP; application and install icons are
PNG. This ledger records the generation direction closely enough to reproduce
the intended art direction without treating generated pixels as product
evidence.

## Reference and accuracy policy

The 12 equipment generations used official manufacturer product images only as
visual references for the named equipment's broad geometry and configuration.
Reference images were not copied into the repository, embedded in the output,
or presented as project-owned photography. The Gym hero used an earlier
project-generated Gym image from commit `b169244` only as a composition and
atmosphere reference. The two app icons used no manufacturer reference.

Every resulting image is an original AI-generated visualization. It is not an
official product photograph, a pixel-exact product depiction, or evidence for a
dimension, capability, accessibility feature, availability claim, or model
identity. The authoritative identity and specifications for each catalog record
remain its manufacturer URL in
[`packages/demo-data/src/equipment.ts`](../packages/demo-data/src/equipment.ts)
and the citations in [`SOURCES.md`](./SOURCES.md).

Equipment and icon prompts excluded people; the hero intentionally includes
four adults using the Gym. All prompts excluded logos, legible words,
watermarks, and invented mechanical features. Because generative output can
still introduce inaccuracies, the UI identifies the assets as generated
visualizations and continues to link to the manufacturer source.

## Shared generation direction

Unless a row below says otherwise, each equipment prompt requested an original
3:2 high-end CGI catalog render of the exact named model, visually grounded by
the official manufacturer reference available from the cited product page. The
common art direction was a warm-ivory seamless studio background, a front-left
three-quarter product view, realistic commercial materials, soft editorial
lighting, and 12–15% clear margin around the machine. Negative constraints were
no people, logos, text, watermark, dramatic scenery, cropped equipment, or
impossible mechanics.

## Prompt ledger and versioned masters

| Design                                                   | Versioned master                                                                        | Faithful concise prompt specification                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Adaptive Gym hero                                        | `apps/gym/public/images/adaptive-gym-interior.webp`                                     | Create a new original 8:5 editorial photograph of a warm, realistic, premium inclusive mixed-use Gym, informed only by the prior project-generated hero's composition. Show four adults naturally using a seated cable row, treadmill, kettlebell, and rack/trainer scene across credible cardio, cable, and free-weight zones; preserve generous circulation, accessible spacing, and a center-safe composition for responsive cropping. No logos, signage, or readable text. |
| Life Fitness Integrity+ Treadmill                        | `apps/gym/public/images/equipment/life-fitness-integrity-plus-treadmill.webp`           | Apply the shared 3:2 catalog-render direction to a Life Fitness Integrity+ commercial treadmill, matching the official reference's overall frame, running deck, uprights, and console geometry.                                                                                                                                                                                                                                                                                |
| Life Fitness Integrity+ Elliptical Cross-Trainer         | `apps/gym/public/images/equipment/life-fitness-integrity-plus-elliptical.webp`          | Apply the shared 3:2 catalog-render direction to a Life Fitness Integrity+ elliptical cross-trainer, matching the official reference's pedal, linkage, handle, upright, and console geometry.                                                                                                                                                                                                                                                                                  |
| Life Fitness Heat Row                                    | `apps/gym/public/images/equipment/life-fitness-heat-row.webp`                           | Apply the shared 3:2 catalog-render direction to a Life Fitness Heat Row, matching the official reference's low rail, seat, foot platform, handle, resistance housing, and display geometry.                                                                                                                                                                                                                                                                                   |
| Life Fitness Integrity+ Lifecycle Recumbent Bike         | `apps/gym/public/images/equipment/life-fitness-integrity-plus-recumbent-bike.webp`      | Apply the shared 3:2 catalog-render direction to a Life Fitness Integrity+ Lifecycle recumbent bike, matching the official reference's step-through frame, supported seat, pedals, handles, and console geometry.                                                                                                                                                                                                                                                              |
| SCIFIT PRO2 Total Body                                   | `apps/gym/public/images/equipment/scifit-pro2-total-body.webp`                          | Apply the shared 3:2 catalog-render direction to a SCIFIT PRO2 Total Body ergometer, matching the official reference's accessible seat, bidirectional hand cranks, step-through base, adjustment points, and console geometry.                                                                                                                                                                                                                                                 |
| Life Fitness Insignia Series Chest Press SS-CP           | `apps/gym/public/images/equipment/life-fitness-insignia-chest-press.webp`               | Apply the shared 3:2 catalog-render direction to a Life Fitness Insignia Series Chest Press, matching the official reference's supported seat, press arms, handles, weight-stack tower, and shroud geometry.                                                                                                                                                                                                                                                                   |
| Life Fitness Insignia Series Row SS-RW                   | `apps/gym/public/images/equipment/life-fitness-insignia-row.webp`                       | Apply the shared 3:2 catalog-render direction to a Life Fitness Insignia Series Row, matching the official reference's supported seat, chest pad, pulling arms, handles, weight-stack tower, and shroud geometry.                                                                                                                                                                                                                                                              |
| Life Fitness Insignia Pectoral Fly / Rear Deltoid SS-FLY | `apps/gym/public/images/equipment/life-fitness-insignia-pectoral-fly-rear-deltoid.webp` | Apply the shared 3:2 catalog-render direction to a Life Fitness Insignia Pectoral Fly / Rear Deltoid station, matching the official reference's reversible seating position, dual pivoting arms, handles, weight stack, and shroud geometry.                                                                                                                                                                                                                                   |
| Life Fitness Insignia Series Back Extension SS-BE        | `apps/gym/public/images/equipment/life-fitness-insignia-back-extension.webp`            | Apply the shared 3:2 catalog-render direction to a Life Fitness Insignia Series Back Extension, matching the official reference's supported seat, adjustable back pad, pivot assembly, foot support, weight stack, and shroud geometry.                                                                                                                                                                                                                                        |
| Life Fitness Dual Adjustable Pulley CMDAP                | `apps/gym/public/images/equipment/life-fitness-dual-adjustable-pulley.webp`             | Apply the shared 3:2 catalog-render direction to a Life Fitness CMDAP dual adjustable pulley, matching the official reference's two towers, adjustable cable carriages, cross-member, handles, weight stacks, and shrouds.                                                                                                                                                                                                                                                     |
| Rogue Manta Ray Adjustable Bench                         | `apps/gym/public/images/equipment/rogue-manta-ray-adjustable-bench.webp`                | Apply the shared 3:2 catalog-render direction to a Rogue Manta Ray adjustable bench, matching the official reference's heavy steel base, wheels, handle, split pads, and incline adjustment geometry.                                                                                                                                                                                                                                                                          |
| Eleiko Prestera Half Rack Black BD-1-357                 | `apps/gym/public/images/equipment/eleiko-prestera-half-rack-black.webp`                 | Apply the shared 3:2 catalog-render direction to an Eleiko Prestera Half Rack Black, matching the official reference's uprights, hole pattern, cross-members, J-cups, safety arms, and stable base geometry; show no loose plates or branded marks.                                                                                                                                                                                                                            |
| Adaptive Gym icon                                        | `apps/gym/app/icon.png`                                                                 | Create a production-quality 1:1 app icon: a deep-forest rounded tile with a bold warm-ivory dumbbell/connection mark and one acid-lime central hub. Use very few flat shapes, strong negative space, and a central maskable-safe composition that stays crisp at 32 px. No text, glow, glass, 3D, shadow, mockup, or watermark.                                                                                                                                                |
| Digital Passport icon                                    | `apps/passport/app/icon.png`                                                            | Create a production-quality 1:1 privacy-first app icon: a continuous acid-lime rounded pathway passes through a clear consent boundary toward one restrained off-white person node on a matte dark-forest tile. Keep critical geometry in the central 70% and legible at 16–24 px. No text, medical cross, lock, shield, fingerprint, face, anatomy, glow, glass, 3D, shadow, mockup, or watermark.                                                                            |

## Web-delivery derivatives

| Asset class       | Versioned output                                                   | Dimensions              | Format and delivery policy                                                                                                                      |
| ----------------- | ------------------------------------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Gym hero          | `apps/gym/public/images/adaptive-gym-interior.webp`                | 1600 × 1000             | WebP master sized for the 8:5 responsive hero crop; loaded with `next/image`, explicit responsive `sizes`, and preload as the page's LCP image. |
| Equipment catalog | `apps/gym/public/images/equipment/*.webp`                          | 1536 × 1024 each        | WebP 3:2 masters; loaded with `next/image` and responsive `sizes`. Catalog cards lazy-load by default; the equipment-detail hero is preloaded.  |
| App metadata icon | `apps/{gym,passport}/app/icon.png`                                 | 512 × 512               | Opaque PNG used by the Next.js file-based metadata convention.                                                                                  |
| Apple touch icon  | `apps/{gym,passport}/app/apple-icon.png`                           | 180 × 180               | PNG derived from the corresponding generated icon design.                                                                                       |
| PWA icons         | `apps/{gym,passport}/public/icons/icon-192.png` and `icon-512.png` | 192 × 192 and 512 × 512 | PNG install icons derived from the corresponding generated icon design.                                                                         |
| Maskable PWA icon | `apps/{gym,passport}/public/icons/icon-maskable-512.png`           | 512 × 512               | PNG using the same center-safe generated composition and declared with the maskable purpose.                                                    |

Raster outputs are resized once from their generated design, retain their
intended aspect ratio, and are not upscaled by application CSS. Next.js handles
responsive content-image delivery; local icon files use their declared native
dimensions and MIME types. At this release, the hero is below 160 KiB, every
equipment master is below 40 KiB, each 180 px or 192 px icon is below 24 KiB,
and each 512 px icon is below 160 KiB. Binary inspection found only RIFF/VP8
chunks in the WebP files and only IHDR/IDAT/IEND chunks in the PNG files; no
EXIF, XMP, or ICC metadata is retained.

## UI-vector exception

This policy replaces generated content artwork, not functional interface
vectors. Lucide's runtime icons and the Passport application's small
code-defined `Icon` component remain SVG UI primitives because vectors are the
appropriate accessible, themeable, resolution-independent format for controls
and status glyphs. They are not ImageGen-created illustrations, are not catalog
or hero imagery, and are covered by the applicable software/project licenses
described in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
