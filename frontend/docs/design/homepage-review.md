# NASA project homepage

The homepage uses a real interactive WebGL Earth, with locally served NASA surface imagery, cloud transparency, night lights, sunlight, and an atmospheric limb. The existing crew-health workspace remains available at `/dashboard.html`. Health data continues to use the existing API configuration and is explicitly labeled as simulated in demo mode.

## Design and visual verification

- Reference: [home-concept.png](home-concept.png), generated with the built-in Image Gen tool.
- Final desktop: [homepage-desktop.png](homepage-desktop.png), 1487 × 1058, matching the reference's native dimensions.
- Mobile: [homepage-mobile.png](homepage-mobile.png), 390px wide, with an 844px viewport and a full-page capture.
- Method: Playwright with system Chrome. Browser/IAB discovery reported that the browser access host was unavailable.
- Both reference and final screenshots were inspected with `view_image`. The implementation was checked faithfully against the reference for the points below.

| Comparison | Final treatment and corrections |
| --- | --- |
| Composition | Large Earth on the right; open editorial copy on the left; compact five-domain health strip below. Adjusted globe scale and vertical placement to match the reference. |
| Copy | Preserved the hero headline, description, navigation, and both CTA labels. |
| Typography | Self-hosted DM Sans, deliberate heading and control sizes, IBM Plex Mono for small planet/data labels. Increased navigation and CTA sizing after review. |
| Palette | Almost-black `#05080e`, white text, muted blue-gray secondary text, and ice-blue `#bce5ff` actions. Isolated homepage styles to prevent dashboard styling from leaking into the hero. |
| Imagery | Actual geographic surface textures on a 3D sphere, with separate clouds and night lighting. Corrected cloud sampling to use the image's alpha channel. |
| Controls | Working pause/resume, zoom, reset, pointer rotation, and keyboard controls. Motion starts paused for reduced-motion preferences. |
| Responsive layout | Checked 320, 390, 760, 1024, and 1487px widths without horizontal overflow. Mobile navigation opens, navigates, and closes correctly. |

Above-the-fold copy review: the reference's hero, navigation, CTA labels, planet caption, drag/zoom hint, and imagery credit match. Intentional differences are the existing Lucide icon family and the workspace-link arrow. Real geographic/cloud imagery and interactive viewing angles replace the reference's generated Earth illustration. Research and mission-log sections continue the same visual system and connect the navigation to the existing data layer. No material layout or interaction issues remain from review.

## Verification

- Production build passed, including both homepage and dashboard HTML entries.
- Lint passed with two existing warnings in `useResource.ts` and `ui.tsx`; no new homepage warnings.
- 13 existing unit tests passed.
- All five homepage browser cases passed: actual visual changes from rotation/zoom/keyboard/drag/reset, pause stability, data-backed domain selection, safe research links, responsive navigation, and image fallback without WebGL.
- All 11 existing dashboard/API browser cases passed across desktop, mobile, and API mode. An ambiguous inventory test locator was narrowed to the actual confirmation message; production inventory behavior was unchanged. Only failed cases were rerun after that correction.
- Desktop/mobile capture reported no browser errors or horizontal overflow.

The build reports a large-chunk notice for the separately lazy-loaded Three.js globe. Rendering is capped at 30fps and pauses when offscreen or the document is hidden. A NASA image remains available when WebGL or texture loading fails.

## Image sources

[NASA/Goddard Scientific Visualization Studio Blue Marble](https://svs.gsfc.nasa.gov/2915/) supplies the surface map and fallback. Night and cloud textures come from the [official Three.js example assets](https://github.com/mrdoob/three.js/tree/dev/examples/textures/planets). These are historical composites with illustrative lighting, rather than a live satellite feed. See [texture credits](../../public/textures/CREDITS.md).

## Concept prompt

Built-in Image Gen was used with the following brief; the generated image is a design reference and is not rendered as the application UI:

> Use case: ui-mockup. Create a polished 1440x1000 desktop website screenshot for the NASA space-health project ASTRA MED. Complete primary homepage surface with header, Earth hero, compact bottom mission-health strip. Extremely realistic large 3D Earth to right, authentic blue oceans, real continents, swirling white clouds, thin atmospheric limb, dramatic sunlight from upper right fading to night at lower left; subtle fine star field in almost-black #05080e space. Planet is the focal point, diameter about 650px, occupies right 55%, no orbit rings crossing text, not sci-fi illustration. Header on black: small simple four-point star icon and wordmark 'ASTRA MED' at left; nav 'Overview', 'Crew health', 'Research', 'Mission log'; understated outlined 'Open workspace' right. Left at x90 y250 white DM Sans editorial heading 'A world away.' newline 'Still human.' at 72px, one line muted description 'Explore the science that keeps people healthy beyond our home planet.' Buttons 'Explore crew health' pale ice-blue solid and 'Browse NASA research' white text arrow. No eyebrow, kicker, badge, made-up telemetry or floating cards. Under planet small caption 'EARTH / OUR HOME PLANET', controls pause, zoom in, zoom out, reset; footer of hero 'Drag to explore · Scroll to zoom' and 'Imagery: NASA Blue Marble'. Fine bottom rule at y820, below compact strip heading 'Mission health, in perspective.' and clearly labeled 'Sample mission · Demo data', five understated health domain columns Radiation, Bone health, Cardiovascular, Immune, Behavioral. Responsive code-native text and controls, genuine interactive WebGL globe implemented separately from this concept. Clean precise restrained scientifically credible space experience, not an official NASA operational tool. No unnecessary sections or imagery.
