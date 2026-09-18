/* ---------------------------------------------------------------------------
 * God's Eye View - remember my setup (local patch, 2026-09-18)
 *
 * The app starts every visit from scratch: all 18 data layers OFF and the map
 * source back on Google 3D. On a phone that means re-tapping Cameras every
 * time, and silently going back to the heaviest imagery.
 *
 * Measured on a Galaxy S22 Ultra, ~30s of panning:
 *   Google 3D (photoreal)   41.9 MB   293 requests to tile.googleapis.com
 *   Esri Satellite           1.7 MB    65 requests
 *
 * So this does two things:
 *   1. Remembers which layers were on and which map source was picked, and
 *      restores them on the next visit.
 *   2. On a phone ONLY, and ONLY the very first time (before there is anything
 *      to restore), starts on Esri Satellite instead of Google 3D. After that
 *      first visit whatever you pick is what you get, including Google 3D.
 *      A laptop never hits this branch, so it keeps Google 3D as normal.
 *
 * It drives the app's own controls rather than its internals: layer rows carry
 * data-layer-id, map buttons carry data-stack-id, and a programmatic click
 * works even while a panel is collapsed (verified: 0 -> 1 layers with the
 * panel shut). Nothing here reaches into app state.
 *
 * Revert: delete this file and its <script> line in index.html.
 * Reset just the saved setup: localStorage.removeItem('godsEyeView.local.setup.v1')
 * ------------------------------------------------------------------------- */
(function () {
  'use strict';

  var KEY = 'godsEyeView.local.setup.v1';
  var PHONE = 640;
  var READY_TIMEOUT_MS = 90000;
  var SAVE_POLL_MS = 4000;
  var SETTLE_MS = 2500;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null; // private window, blocked storage - just don't restore
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      /* storage full or blocked; remembering is a convenience, not a feature */
    }
  }

  function layerRows() {
    return Array.prototype.slice.call(
      document.querySelectorAll('.data-toggle-row[data-layer-id]'),
    );
  }

  function sourceButtons() {
    return Array.prototype.slice.call(
      document.querySelectorAll('.map-source-section button[data-stack-id]'),
    );
  }

  // A layer is "on" when its feed state is anything other than off. Cameras
  // never reaches 'on': it streams continuously, so it sits at 'loading' for
  // as long as it is running - measured at 45s+ with live frames rendering on
  // both map sources. Testing for === 'on' silently dropped the layer most
  // worth remembering.
  function enabled(row) {
    var btn = row.querySelector('.data-toggle-btn');
    return Boolean(btn) && btn.dataset.feedState !== 'off';
  }

  function readState() {
    var on = [];
    layerRows().forEach(function (row) {
      if (enabled(row)) on.push(row.dataset.layerId);
    });
    var active = sourceButtons().filter(function (b) {
      return b.classList.contains('active');
    })[0];
    return {
      layers: on.sort(),
      mapSource: active ? active.dataset.stackId : null,
    };
  }

  // The markup for these controls exists well before the app binds its
  // handlers, so counting elements is not enough: an early click lands on a
  // button nobody is listening to and is silently lost. Wait for evidence the
  // controllers actually ran - feed state stamped on every toggle, and a map
  // source marked active.
  //
  // Deliberately NOT waiting for the first-run dialog to close. A programmatic
  // click reaches the control straight through that overlay (verified: layers
  // restore with the dialog fully up), and gating on it meant that leaving the
  // dialog open for 90s made the restore time out and never run at all.
  function ready() {
    var rows = layerRows();
    if (rows.length < 5) return false;
    var stamped = rows.filter(function (row) {
      var btn = row.querySelector('.data-toggle-btn');
      return btn && typeof btn.dataset.feedState === 'string' && btn.dataset.feedState !== '';
    });
    if (stamped.length < rows.length) return false;
    var btns = sourceButtons();
    if (btns.length < 2) return false;
    var anyActive = btns.some(function (b) {
      return b.classList.contains('active');
    });
    return anyActive;
  }

  function whenReady(cb) {
    var started = Date.now();
    (function poll() {
      if (ready()) return setTimeout(function () {
        cb(true);
      }, SETTLE_MS);
      if (Date.now() - started > READY_TIMEOUT_MS) return cb(false);
      setTimeout(poll, 400);
    })();
  }

  // Click only what actually differs, one at a time, so a slow layer does not
  // stack a queue of requests on top of the tile load that is already running.
  function restore(saved, done) {
    var want = {};
    (saved.layers || []).forEach(function (id) {
      want[id] = true;
    });

    var todo = layerRows().filter(function (row) {
      if (!row.querySelector('.data-toggle-btn')) return false;
      return enabled(row) !== Boolean(want[row.dataset.layerId]);
    });

    function step(i) {
      if (i >= todo.length) return done();
      var btn = todo[i].querySelector('.data-toggle-btn');
      try {
        if (btn) btn.click();
      } catch (e) {
        /* one stubborn layer must not stop the rest */
      }
      setTimeout(function () {
        step(i + 1);
      }, 900);
    }

    if (saved.mapSource) setMapSource(saved.mapSource);
    setTimeout(function () {
      step(0);
    }, 1200);
  }

  // Picking a map source makes the app slide the VISUAL PRESETS tray open, and
  // left open it covers the CCTV panel. The tray was not requested, so put
  // the dock back exactly as it was found.
  function setMapSource(stackId) {
    var target = sourceButtons().filter(function (b) {
      return b.dataset.stackId === stackId;
    })[0];
    if (!target || target.classList.contains('active')) return false;

    var dock = document.querySelector('#control-panel');
    var wasCollapsed = Boolean(dock && dock.classList.contains('collapsed'));

    try {
      target.click();
    } catch (e) {
      return false;
    }

    if (wasCollapsed) {
      setTimeout(function () {
        var d = document.querySelector('#control-panel');
        if (!d || d.classList.contains('collapsed')) return;
        var toggle = document.querySelector('#control-panel-toggle');
        try {
          if (toggle) toggle.click();
        } catch (e) {
          /* leaving the tray open is ugly, not broken */
        }
      }, 1400);
    }
    return true;
  }

  // Poll rather than hook click handlers: layers also change on their own
  // (turning Cameras on opens the CCTV panel, and the rail auto-collapses
  // panels), and a poll catches every one of those without guessing at which
  // events the app fires.
  function watch() {
    var last = JSON.stringify(readState());
    setInterval(function () {
      if (!ready()) return;
      var now = readState();
      var s = JSON.stringify(now);
      if (s === last) return;
      last = s;
      now.firstRunDone = true;
      save(now);
    }, SAVE_POLL_MS);
  }

  whenReady(function (ok) {
    if (!ok) return; // app never finished loading; leave it completely alone
    var saved = load();

    if (saved && saved.firstRunDone) {
      restore(saved, watch);
      return;
    }

    // First ever visit in this browser. On a phone, start light.
    if (window.innerWidth <= PHONE) setMapSource('esri-imagery');
    setTimeout(function () {
      var state = readState();
      state.firstRunDone = true;
      save(state);
      watch();
    }, 2500);
  });
})();
