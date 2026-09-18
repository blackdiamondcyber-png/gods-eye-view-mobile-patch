# 📱 God's Eye View: Mobile Patch Pack

Unofficial patch pack for [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view), a real-time geospatial intelligence console: a photorealistic 3D globe with live aircraft, ships, satellites, fires, traffic, and CCTV cameras. This pack is not affiliated with, and not endorsed by, the upstream project or its author.

Upstream has no mobile layout yet. Its desktop UI (corner HUD readouts, side panels, a bottom dock) overlaps itself badly under about 640px of width. This pack adds two small files that fix that on a phone, plus an optional local launcher. It does not modify any file in the upstream app: everything here is additive.

## What's in this pack

| File                      | Purpose                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mobile-fix.css`          | Phone layout fixes, scoped to `@media (max-width: 640px)`, plus one always-on rule that removes the voice control button (see [Voice control, removed](#voice-control-removed)) |
| `session-memory.js`       | Remembers which data layers were on and which map source was picked, and restores them on the next visit                                                                        |
| `start-gods-eye-view.cmd.example` | Optional Windows launcher that builds the app and opens it at an address you set                                                                                                |
| `LICENSE.upstream`        | A copy of the upstream project's license, kept here for attribution                                                                                                             |

## Install

1. Copy `mobile-fix.css` and `session-memory.js` into the app's `public/` folder.
2. Add these two lines inside `<head>` in `index.html`:

   ```html
   <link rel="stylesheet" href="/mobile-fix.css" />
   <script src="/session-memory.js" defer></script>
   ```

3. Rebuild:

   ```bash
   npm run build
   ```

To revert, delete the two files and those two lines; nothing else changes.

Because this pack never touches app source, it survives upstream updates on its own. The one exception is `index.html` itself: pulling an upstream update that replaces that file will overwrite your two added lines, so re-add them afterward.

## What changed on a phone

Measured in Chrome, emulating a Galaxy S22 Ultra (412x915 CSS pixels, device pixel ratio 3), with the Cameras layer on and 3,663 cameras loaded.

| Measurement                                     | Before                                                                          | After                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Side panel width (of a 412px-wide screen)       | 380px (92%)                                                                     | 176px (43%)                                                         |
| Five collapsed panel bars, combined height      | 250px                                                                           | 196px                                                               |
| HUD telemetry blocks overflowing the right edge | 6 blocks, up to 50px past the edge                                              | 0                                                                   |
| Bottom dock labels                              | Clipped to "L" and "ESETS" (the app's own phone rule caps them at 2.3rem, 37px) | Full text: "LOCATION" and "VISUAL PRESETS"                                 |
| Layer ON/OFF switch height                      | 20px                                                                            | 30px (trade-off: 7 layer rows fit on screen at once, instead of 10) |

Checked with automated browser tests: zero overlapping painted elements across three states (idle, DATA LAYERS panel open, CCTV in use). The layout at 1440x900 (desktop) is unaffected, since these rules are scoped to `max-width: 640px`.

### Voice control, removed

One rule in `mobile-fix.css` sits outside that media query on purpose: it hides the voice control button everywhere, on phone and desktop alike. That is a deliberate removal, not a layout fix: it is the only control in the app that can spend money on its own, and there is no other way to open a voice session. Delete that one rule to bring the button back; the voice feature's own code is untouched.

## Session memory

`session-memory.js` watches the app's own layer toggle switches and map source buttons (it clicks the real controls, it does not reach into app state) and saves the result to `localStorage` under the key `godsEyeView.local.setup.v1`.

- On every visit after the first, whichever layers were on and whichever map source was active come back automatically.
- On the very first visit, on a phone only, it opens on Esri Satellite instead of Google Photorealistic 3D, to save data. After that first visit, whatever source you pick is what you get from then on, including Google 3D. Desktop never takes this branch, so a desktop first visit keeps the app's normal default.
- Reset the saved setup at any time by running this in the browser console:

  ```js
  localStorage.removeItem("godsEyeView.local.setup.v1");
  ```

### Data caveat

Layer state is remembered, so closing the page with the Cameras layer on means the next visit starts pulling camera frames immediately, at about 34 MB per minute (see [Map data usage](#map-data-usage)). Turn Cameras off before closing the tab if you are on a metered connection.

## Map data usage

Measured over about 30 seconds of panning, same route on both map sources:

| Source                         | Data used | Requests |
| ------------------------------ | --------- | -------- |
| Google Photorealistic 3D Tiles | 41.9 MB   | 293      |
| Esri Satellite                 | 1.7 MB    | 65       |

Other reference points:

- Cold load on Google 3D: about 62 MB.
- Idle for 90 seconds, untouched: 0 MB.
- Cameras layer on: about 33.7 MB per minute.

Cesium ion's free tier allows 15 GB per month of streaming, and 1,000 Google Photorealistic 3D Tiles root tile requests per month.

## Optional: Windows launcher

`start-gods-eye-view.cmd.example` is a convenience script for Windows. Copy it to `start-gods-eye-view.cmd` and set `GEV_HOST` at the top. It defaults to `localhost`, which only works on the machine running the server. To reach the app from a phone, set `GEV_HOST` to that machine's LAN address or its Tailscale address, and make sure `HOST` in your `.env` matches, otherwise the server will not be listening on the address you are opening. The script runs `npm run build`, then `npm run preview`. If the build fails, run `npm ci` in the project folder and try again.

## License

This patch pack is released under the MIT License, the same license as upstream.

`LICENSE.upstream` is a copy of the God's Eye View project's own license, kept here for attribution. Its source code is MIT too, but that file carries an extra note worth reading: some bundled datasets (a submarine cable map, flood event imagery) are under separate, NonCommercial licenses, and some live data providers require your own API credentials and restrict commercial use (see upstream's `DATA_SOURCES.md` for the full breakdown). This patch pack does not add, bundle, or touch any of that data; it only adds the files listed above.

All credit for the app itself goes to [bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view).
