# Everything this pack changes

Three files: 41 CSS rules and two scripts. No app source file is modified, so the
pack survives upstream updates unless `index.html` is overwritten.

Every number below was measured on the running app in Chrome emulating a
Galaxy S22 Ultra (412 x 915 CSS px, device pixel ratio 3), with the Cameras
layer on and 3,663 cameras loaded. Nothing here is estimated.

|                                   | Before                      | After                   |
| --------------------------------- | --------------------------- | ----------------------- |
| Panel width                       | 380px (92% of screen)       | 176px (43%)             |
| Collapsed bar widths              | 380 / 380 / 176 / 380 / 380 | all 176, all at x=16    |
| Five collapsed bars stacked       | 250px                       | 196px                   |
| HUD telemetry past the right edge | 6 blocks, up to 50px off    | none                    |
| Bottom dock labels                | "L" and "ESETS"             | both read in full       |
| Attribution logos                 | 138px + 98px wide           | 59px + 65px             |
| Layer ON/OFF switch height        | 20px                        | 30px                    |
| Map data, ~30s of panning         | 41.9 MB (Google 3D)         | 1.7 MB (Esri Satellite) |

Re-measured on 23 Sep 2026 with `tools/measure-layout.mjs` against upstream
[`75869d0`](https://github.com/bilawalsidhu/gods-eye-view/commit/75869d0c103794e4c60f879b6a9f8ca531634694) (18 Sep, the commit this pack was written against) and [`082074a`](https://github.com/bilawalsidhu/gods-eye-view/commit/082074a00684af97458b85529093e2b2a9f28ed1)
(22 Sep); results in `tools/results/`. The panel width, bar width and height,
dock label and switch rows reproduce exactly, as does the first logo (138px to
59px); the second logo did not appear in these runs, which had no API keys set.
Two corrections to what this file used to say. The desktop layout at 1440 x 900
is not untouched: removing the voice control (1.9) re-centres the bottom dock,
moving its two panels 70px. And the zero-overlap check is withdrawn, for the
reason given under "A metric that cannot separate before from after".

---

## 1. Phone layout (`mobile-fix.css`)

Every rule is inside `@media (max-width: 640px)` except the voice control,
which is noted below. The desktop layout is untouched.

### 1.1 HUD corners

The console puts telemetry in four screen corners. At 412px they met in the
middle and ran off the edge.

- `.hud-corner` capped at `42vw` with `overflow: hidden`, so left and right
  corners can never meet.
- The telemetry readouts are inline `<span>`s, and **`max-width` does nothing
  on an inline element**. They are given `display: inline-block` so the cap
  applies at all.
- `.hud-content` and `.hud-summary-wrap` carry a hard-coded `width: 420px`.
  Released to `auto`.
- Corners re-anchored to 6px from each edge, with ellipsis truncation and
  8px to 12px type so a clipped line still says something.
- `#hud-timestamp` and `#hud-orbit` are positioned independently of
  `.hud-corner` by a hard `left: 296px`, so a width cap alone still left them
  off-screen. Re-anchored to the right edge instead.

### 1.2 Status chips

`REFRESHING LIVE DATA` and `LOADING FRAMES n/n` are centred overlays that
landed directly on top of the DATA LAYERS and SCENES bars.

- `#cctv-sync-chip` pinned to the top strip, centred, above everything.
- `#global-loading-status` right-anchored and capped at `36vw`, because the
  left panel stack starts at y=70 and is 239px wide, so a centred chip will
  always cross it.

### 1.3 Side panels

- `#left-panel-stack` and `#right-context-rail` capped at `58vw`.
- `.panel-glow` and `.title-glow` were 4px wider than their panel on both
  sides. Constrained.
- **`--left-stack-top` is driven instead of overriding the container's
  `top`.** This one matters: `#data-panel`'s height is
  `min(620px, calc(100vh - var(--left-stack-top) - var(--left-stack-gap) - 36px))`.
  Moving the container without moving the variable desyncs the two and
  silently shrinks the open layer list. An early version of this pack set
  `top: 30vh` directly and cut the open DATA LAYERS panel from 322px to 125px,
  one row clipped mid-word.

### 1.4 Collapsed panel bars

The five shut bars ate 250px of a 915px screen doing nothing.

- A shut panel was 68px tall but its `.panel-header` is only 40px of that. The
  rest is wrapper padding sized for a desktop sidebar. Removed **while
  collapsed only**, so an open panel keeps the app's own spacing.
- `layers.css` pins three of the bars with **both** `height: 50px` and
  `min-height: 50px`. Zeroing `min-height` alone changes nothing; `height:
auto` is also required.
- `#pp-toggles` uses its own header row with a separate 50px floor.
- Collapsed bars set to a uniform 176px.
- **`#right-context-rail` is `align-items: flex-end`.** Narrowing the bars
  pushed them to x=79 while the left stack's stayed at x=16. No margin can
  beat flex alignment; the container has to align to the start.
- The decorative halo is drawn 20px taller than its panel on each side, which
  bleeds onto neighbours behind a 40px bar. Constrained when collapsed.

### 1.5 Tap targets

Compact must not mean untappable. Nothing here shrinks a control.

- `.panel-collapse-btn` held at 32px. It is the open/close target and the
  reason 40px is the floor for a collapsed bar.
- `.data-toggle-btn` raised from 20px to 30px. This is the ON/OFF switch for
  every layer. **Trade-off: 7 layer rows fit on screen instead of 10.**
- `#cctv-camera-select` raised to 34px tall and 66px wide.
- `.cctv-cal-value` raised from 22px to 28px.

### 1.6 Bottom dock

The dock labels rendered as "L" and "ESETS".

- The cause is upstream's own phone rule: `command-dock-trays.css` clamps both
  labels to `max-width: 2.3rem` (37px) with an ellipsis and shrinks each tray
  to `3.25rem` (52px). One label clips from the head, the other from the tail,
  because they have opposite text alignment.
- Fixed by driving `--dock-side-compact` to `8.75rem`, which the app's own
  `min-width: calc(var(--dock-side-compact) - 1.5rem)` formula flows from, and
  by removing the label clamp.
- **The variable is declared on `#command-dock`, not on `:root`.** Setting it
  at the root has no effect.

### 1.7 Camera thumbnails

- Panel preview capped at `18vh`, map-pinned overlays at `30vw` / `12vh`.
- Camera labels truncated at `38vw`.

### 1.8 Attribution

Capped, never hidden: both providers require visible attribution, and hiding
it puts free-tier use at risk.

- Credit text reduced to 8px and width-capped.
- **The CESIUM ion and Google logos are images, so `font-size` does nothing to
  them.** They were ~138px and ~98px wide. Capped to 12px tall.

### 1.9 Voice control

`#gev-voice-control` is hidden with `display: none`. This is the one rule
**outside** the media query, so it applies on desktop too.

- `display: none` rather than opacity, so it is gone from hit testing.
- There is no keyboard shortcut for voice (the only binding on `v` is
  clean-view), so this closes the only control in the app that can spend money
  on a metered API.
- `panelLayoutController.js` lists it as a layout obstacle. A `display: none`
  element measures 0 x 0, so it simply stops reserving space. Nothing divides
  by its size.
- Delete this one block to bring it back. The voice code is untouched.

---

## 2. Session memory (`session-memory.js`)

The app starts every visit with all 18 data layers off and the map source back
on Google 3D, so any setup has to be rebuilt by hand each time.

**What it does**

- Remembers which layers were on and which map source was picked, and restores
  them on the next visit.
- On a phone only, and only on the very first visit, opens on Esri Satellite.
  After that, whatever you pick is what you get, Google 3D included. A desktop
  never reaches that branch.
- State lives in `localStorage` under `godsEyeView.local.setup.v1`. Reset with
  `localStorage.removeItem('godsEyeView.local.setup.v1')`.

**How it hooks in**

It drives the app's own controls rather than reaching into its internals.
Layer rows carry `data-layer-id`, map source buttons carry `data-stack-id`, so
it reads and sets state the same way a tap would. A programmatic `.click()`
works even while a panel is collapsed, which is verified behaviour, so it does
not need to open anything to restore state.

**Three things that were not obvious**

1. **The Cameras layer never reports `on`.** It streams continuously, so its
   `data-feed-state` sits at `loading` for as long as it is running, measured
   at 45s+ with live frames rendering, on both map sources. Testing for
   `=== 'on'` silently drops it. The test has to be `!== 'off'`.
2. **Do not wait for the first-run dialog to close.** A programmatic click
   reaches the control straight through that overlay. Gating on it means that
   leaving the dialog open long enough makes the restore time out and never
   run at all.
3. **Setting the map source slides the VISUAL PRESETS tray open**, and left
   open it covers the entire CCTV panel. The script records whether the tray
   was shut and puts it back.

**Readiness matters.** The markup for these controls exists well before the app
binds its handlers, so counting elements is not enough: an early click lands on
a button nobody is listening to and is silently lost. The script waits for feed
state to be stamped on every toggle and for a map source to be marked active,
then settles before touching anything.

**Caveat.** Because layers are remembered, closing with Cameras on means the
next visit starts pulling camera frames immediately, roughly 34 MB a minute.

---

## 3. Mesh detail guard (`mesh-detail.js`)

Independent of the other two files. It answers one question: why does part of
the 3D view look melted?

Because Google's mesh has a finite resolution per area, and below roughly 350 m
it runs out. Verified it is not a failure: 1,199 tile requests, every one HTTP
200, while the view was unreadable.

| Camera height | Triangles in view | Sharpness vs 1200m |
| ------------- | ----------------- | ------------------ |
| 350 m         | 579,065           | 101%               |
| 250 m         | 357,271           | 70%                |
| 180 m         | 139,072           | 44%                |
| 120 m         | 24,985            | 10%                |

Keyed on triangles in view, normalised per 1000 screen pixels, rather than on
altitude. Altitude would need the ground elevation, and `scene.globe.show` is
false here because the tileset replaces the globe, so `globe.getHeight()`
returns undefined and the app's own `floorAltitudeM()` returns null until it is
warmed.

Shows a dismissible chip with **PULL BACK** and **FLAT MAP**. Never moves the
camera by itself: the CCTV projection and scene playback move it deliberately,
and fighting them would be worse than the problem.

No loading indicator, deliberately. Tiles settled within 1-2 seconds at every
altitude sampled, so it was noise, and on a phone it covered the CCTV panel.

## 4. `index.html`

Three lines, each with a comment saying how to revert.

```html
<link rel="stylesheet" href="/mobile-fix.css" />
<script src="/session-memory.js" defer></script>
<script src="/mesh-detail.js" defer></script>
```

---

## Notes for anyone adapting this

### Measuring a layout is harder than it looks

Two traps produced 16 reported collisions that did not exist.

- **`getBoundingClientRect()` returns the layout box, not what is on screen.**
  It ignores every clipping ancestor and every scroll offset. One readout
  measured `right=461` on a 412px viewport; its parent is `overflow: hidden`
  at x=402 and a hit test at x=405 returns the globe canvas. Nothing painted
  past the edge. Controls scrolled below a panel's fold report positions
  further down the page the same way, which reads as a collision with whatever
  is actually there. Intersect with every ancestor whose overflow is not
  `visible`, then clamp to the viewport.
- **Both panel stacks are `pointer-events: none` with transparent
  backgrounds,** and their boxes stretch well past their contents. Comparing
  raw boxes flags them against HUD text they neither cover nor block. Filter to
  elements that actually paint.

### A metric that cannot separate before from after is not evidence

After fixing both traps, the stricter check reported zero overlaps, on the
unpatched build too. It could not have shown the patch helped. Plain
dimensions did: panel width, stacked bar height, elements past the edge. If you
change this pack, re-measure with it disabled before quoting any result.

### Useful things about the app itself

- `/api/setup/status` returns 404 under `npm run preview`. This is intended
  upstream: their own test asserts it. The in-app key panel needs `npm run dev`.
- `.cctv-panel-inner` already has an 8px scrollbar and `scrollbar-gutter:
stable`. Styling it only makes the app's own affordance worse.
- The CCTV panel already caps and scrolls itself, holding roughly 720px of
  controls in a 311px box.
- The CCTV refresh cadence is already tuned: 10s for the active camera, 60s
  idle, 5 minutes for static providers.
- Idle costs nothing. Ninety seconds untouched transfers 0 MB.
- The setup doctor reporting "OpenSky OAuth credentials not configured" does
  not mean flights are broken. Live Flights works anonymously. Military
  Flights (268 aircraft), Satellites (832) and Space Missions (27) all work
  with no keys at all.
- Cesium ion's free tier allows 15 GB/month of streaming and 1,000 Google
  Photorealistic 3D Tiles root tiles per month, which is worth knowing before
  leaving Google 3D on over a mobile connection.
