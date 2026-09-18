/* ---------------------------------------------------------------------------
 * God's Eye View - 3D mesh detail guard (local patch, 2026-09-18)
 *
 * Google Photorealistic 3D Tiles are built from aerial photography and have a
 * finite resolution per area. Get closer than the data supports and the mesh
 * smears into unreadable blobs. It looks like a loading failure, but nothing
 * is failing: measured over downtown Austin, 1,199 tile requests all returned
 * HTTP 200 while the view was completely melted.
 *
 * Calibrated on the running app (1400x860, downtown Austin, waiting for
 * tileset.tilesLoaded at each height before sampling):
 *
 *   height   triangles in view   sharpness vs 1200m
 *    1200m        494,556               100%
 *     800m        555,317               100%
 *     500m        548,748               104%
 *     350m        579,065               101%   <- detail is flat down to here
 *     250m        357,271                70%
 *     180m        139,072                44%
 *     120m         24,985                10%   <- unreadable
 *      80m         24,912                 9%
 *
 * So triangle count in view tracks visible sharpness closely, and unlike an
 * altitude threshold it works anywhere: it measures the geometry that actually
 * exists rather than guessing from height, which would need the ground
 * elevation (unavailable here, since scene.globe.show is false because the
 * tileset replaces the globe).
 *
 * Normalised per 1000 screen pixels so one threshold covers a phone and a
 * desktop. Desktop at full detail is ~410 tri/kpx; the 44% case is ~115.
 *
 * This NEVER moves the camera on its own. It only offers two one-tap actions,
 * because silently flying the camera would fight the CCTV projection and
 * scene playback, which move it deliberately.
 *
 * Revert: delete this file and its <script> line in index.html.
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  var POLL_MS = 1600;
  var DENSITY_LOW = 150; // tri per 1000px: below this the mesh is visibly gone
  var DENSITY_OK = 250; // recovered
  var MIN_PULLBACK_M = 450;
  var SNOOZE_MS = 120000; // after a dismiss, stay quiet this long

  var snoozedUntil = 0;
  var chip = null;
  var shown = false;

  function api() {
    var g = window.__godsEyeView;
    return g && g.viewer && g.tileset ? g : null;
  }

  function density(g) {
    var st = g.tileset.statistics;
    var tri = st && st.numberOfTrianglesSelected;
    if (!tri) return 0;
    var kpx = (window.innerWidth * window.innerHeight) / 1000;
    return kpx > 0 ? tri / kpx : 0;
  }

  function build() {
    if (chip) return chip;
    chip = document.createElement('div');
    chip.id = 'mesh-detail-chip';
    chip.setAttribute('role', 'status');
    chip.innerHTML =
      '<span class="mdc-text"></span>' +
      '<button type="button" class="mdc-btn" data-act="pullback">PULL BACK</button>' +
      '<button type="button" class="mdc-btn" data-act="flat">FLAT MAP</button>' +
      '<button type="button" class="mdc-btn mdc-x" data-act="dismiss" aria-label="Dismiss">×</button>';

    var css = document.createElement('style');
    css.textContent =
      '#mesh-detail-chip{position:fixed;left:50%;bottom:22%;transform:translateX(-50%);' +
      'z-index:150;display:none;align-items:center;gap:8px;' +
      'padding:7px 10px;border-radius:8px;pointer-events:auto;' +
      'background:rgba(8,14,19,.88);border:1px solid rgba(0,212,255,.38);' +
      'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);' +
      'font-family:inherit;font-size:10px;letter-spacing:.09em;' +
      'color:rgba(206,232,239,.92);max-width:min(94vw,640px);box-sizing:border-box}' +
      '#mesh-detail-chip.show{display:flex}' +
      '#mesh-detail-chip .mdc-text{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#mesh-detail-chip .mdc-btn{flex:0 0 auto;min-height:28px;padding:0 9px;cursor:pointer;' +
      'font:inherit;letter-spacing:.09em;color:rgba(0,212,255,.95);' +
      'background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.42);border-radius:5px}' +
      '#mesh-detail-chip .mdc-btn:hover{background:rgba(0,212,255,.18)}' +
      '#mesh-detail-chip .mdc-x{min-width:28px;padding:0;color:rgba(206,232,239,.7);' +
      'border-color:rgba(206,232,239,.28);background:transparent;font-size:13px}' +
      '@media (max-width:640px){#mesh-detail-chip{bottom:26%;font-size:9px;gap:6px;padding:6px 8px}' +
      '#mesh-detail-chip .mdc-btn{min-height:30px;padding:0 7px}}';
    document.head.appendChild(css);

    chip.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.mdc-btn') : null;
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'dismiss') {
        snoozedUntil = Date.now() + SNOOZE_MS;
        hide();
      } else if (act === 'pullback') {
        pullBack();
      } else if (act === 'flat') {
        flatMap();
      }
    });
    document.body.appendChild(chip);
    return chip;
  }

  function show(text) {
    var c = build();
    c.querySelector('.mdc-text').textContent = text;
    c.classList.add('show');
    shown = true;
  }

  function hide() {
    if (chip) chip.classList.remove('show');
    shown = false;
  }

  // Rise until the mesh has detail again. Keeps the same ground point and
  // orientation so it reads as stepping back, not as being teleported.
  function pullBack() {
    var g = api();
    if (!g) return;
    try {
      var C = window.Cesium;
      var cam = g.viewer.camera;
      var carto = cam.positionCartographic;
      var target = Math.max(MIN_PULLBACK_M, carto.height * 2.5);
      cam.flyTo({
        destination: C.Cartesian3.fromRadians(
          carto.longitude,
          carto.latitude,
          target,
        ),
        orientation: { heading: cam.heading, pitch: cam.pitch, roll: cam.roll },
        duration: 1.2,
      });
      hide();
    } catch (e) {
      /* never let a camera call break the page */
    }
  }

  // Click the app's own map source button rather than touching internals, and
  // put the dock tray back if selecting a source slid it open.
  function flatMap() {
    var btn = document.querySelector(
      '.map-source-section button[data-stack-id="esri-imagery"]',
    );
    if (!btn) return;
    var dock = document.querySelector('#control-panel');
    var wasCollapsed = Boolean(dock && dock.classList.contains('collapsed'));
    try {
      btn.click();
    } catch (e) {
      return;
    }
    hide();
    snoozedUntil = Date.now() + SNOOZE_MS;
    if (wasCollapsed) {
      setTimeout(function () {
        var d = document.querySelector('#control-panel');
        if (!d || d.classList.contains('collapsed')) return;
        var t = document.querySelector('#control-panel-toggle');
        try {
          if (t) t.click();
        } catch (e) {}
      }, 1400);
    }
  }

  function tick() {
    var g = api();
    if (!g) return;

    // Only judge a settled view. Mid-stream the mesh is legitimately coarse
    // and will sharpen on its own, so calling that "low detail" would be wrong.
    var st = g.tileset.statistics;
    var pending = (st && st.numberOfPendingRequests) || 0;
    // Say nothing while tiles are still arriving. Mid-stream the mesh is
    // legitimately coarse and sharpens on its own, and it is quick: every
    // altitude sampled during calibration reported tilesLoaded within 1-2s.
    // An indicator for a one second wait is noise, and on a phone it sat
    // on top of the CCTV panel.
    if (!g.tileset.tilesLoaded || pending > 0) return;

    // A flat imagery source has no mesh to measure, so there is nothing to warn about.
    var active = document.querySelector('.map-source-section button.active');
    if (active && active.dataset.stackId !== 'photoreal') {
      hide();
      return;
    }

    var d = density(g);
    if (d >= DENSITY_OK) {
      hide();
      return;
    }
    if (d < DENSITY_LOW) {
      if (Date.now() < snoozedUntil) return;
      // Short form on a phone: the full sentence ellipsised to
      // "LIMITED 3D DETAIL H..." which reads worse than saying less.
      show(
        window.innerWidth <= 640
          ? 'LIMITED 3D DETAIL HERE'
          : 'LIMITED 3D DETAIL HERE · NOT A LOADING ERROR'
      );
      return;
    }
  }

  function start() {
    if (!api()) {
      setTimeout(start, 1000);
      return;
    }
    setInterval(tick, POLL_MS);
  }

  start();
})();
