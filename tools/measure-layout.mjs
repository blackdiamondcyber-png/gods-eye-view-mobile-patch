// Measures the phone layout of a running God's Eye View, once as upstream
// ships it and once with this pack installed, and prints both side by side.
//
// The pack is applied the way the README installs it: the three lines are
// added inside <head> of the page as it is served, and the three files are
// served from this repo. Nothing in the upstream checkout is modified, so one
// build measures both.
//
//   npm run build && npm run preview          (in the upstream checkout)
//   node tools/measure-layout.mjs --url http://localhost:4173
//
// Options:
//   --url <url>        the running app (default http://localhost:4173)
//   --browser <path>   a Chromium-family executable; Playwright's own by default
//   --settle <ms>      wait after load before measuring (default 10000)
//   --json <path>      also write the full result as JSON
//   --shots <dir>      also save the idle phone screen, before and after
//
// Needs Playwright (`npm i -D playwright`, or set PLAYWRIGHT_MODULE to the
// absolute path of an existing install).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const URL_ = args.url || "http://localhost:4173";
const SETTLE = Number(args.settle || 10000);
const pwPath = process.env.PLAYWRIGHT_MODULE;
const { chromium } = pwPath ? createRequire(path.join(pwPath, "package.json"))(pwPath) : await import("playwright");

const PACK_FILES = {
  "/mobile-fix.css": ["mobile-fix.css", "text/css"],
  "/session-memory.js": ["session-memory.js", "text/javascript"],
  "/mesh-detail.js": ["mesh-detail.js", "text/javascript"],
};
const HEAD_LINES = [
  '<link rel="stylesheet" href="/mobile-fix.css" />',
  '<script src="/session-memory.js" defer></script>',
  '<script src="/mesh-detail.js" defer></script>',
].join("\n");

const PHONE = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: { width: 1440, height: 900 } };

async function openApp(browser, contextOptions, patched) {
  const context = await browser.newContext(contextOptions);
  if (patched) {
    const origin = new URL(URL_).origin;
    await context.route(`${origin}/**`, async (route) => {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      if (PACK_FILES[p]) {
        const [file, type] = PACK_FILES[p];
        return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(path.join(REPO, file)) });
      }
      if (req.resourceType() === "document") {
        const res = await route.fetch();
        const html = await res.text();
        if (!html.includes("</head>")) throw new Error("served page has no </head> to install into");
        return route.fulfill({ response: res, body: html.replace("</head>", `${HEAD_LINES}\n</head>`) });
      }
      return route.fallback();
    });
  }
  const page = await context.newPage();
  await page.goto(URL_, { waitUntil: "load", timeout: 90000 });
  await page.waitForSelector("#data-panel", { timeout: 60000 });
  await page.waitForTimeout(SETTLE);
  const installed = await page.evaluate(() => !!document.querySelector('link[href="/mobile-fix.css"]'));
  if (installed !== patched) throw new Error(`expected pack installed=${patched}, found ${installed}`);
  return { context, page };
}

// Runs in the page. getBoundingClientRect() is the layout box, not what is
// painted: it ignores clipping ancestors. paintedBox() intersects it with every
// ancestor whose overflow is not visible, which is what a person sees.
const measurePhone = () => {
  const vis = (e) => {
    const s = getComputedStyle(e);
    const b = e.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0;
  };
  const paintedBox = (e) => {
    const b = e.getBoundingClientRect();
    let { left, top, right, bottom } = b;
    for (let a = e.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX !== "visible" || s.overflowY !== "visible") {
        const r = a.getBoundingClientRect();
        left = Math.max(left, r.left);
        top = Math.max(top, r.top);
        right = Math.min(right, r.right);
        bottom = Math.min(bottom, r.bottom);
      }
    }
    return { left, top, right, bottom };
  };
  const W = innerWidth;
  const bars = [...document.querySelectorAll("#left-panel-stack > .panel-collapsible, #right-context-rail > .panel-collapsible")]
    .filter(vis)
    .map((e) => {
      const b = e.getBoundingClientRect();
      return { id: e.id, collapsed: e.classList.contains("collapsed"), x: Math.round(b.x), width: Math.round(b.width), height: Math.round(b.height) };
    });
  const barBoxes = [...document.querySelectorAll("#left-panel-stack > .panel-collapsible, #right-context-rail > .panel-collapsible")]
    .filter(vis)
    .map((e) => ({ id: e.id, b: e.getBoundingClientRect() }));
  // Text cut off: the glyphs' own extent (a Range over the element's text)
  // against what its clipping ancestors and the screen let through. Under a
  // bar: the part of that text still showing overlaps a panel bar, which is
  // opaque, so a person cannot read it there.
  const hud = [...document.querySelectorAll("[id^='hud-']")].filter(vis).map((e) => {
    const b = e.getBoundingClientRect();
    const p = paintedBox(e);
    const range = document.createRange();
    range.selectNodeContents(e);
    const t = range.getBoundingClientRect();
    const hasText = e.textContent.trim().length > 0 && t.width > 0;
    const visibleRight = Math.min(p.right, W);
    const shown = { left: Math.max(t.left, p.left, 0), right: Math.min(t.right, visibleRight), top: Math.max(t.top, p.top), bottom: Math.min(t.bottom, p.bottom) };
    const under = hasText
      ? barBoxes
          .filter(({ b: r }) => Math.min(shown.right, r.right) - Math.max(shown.left, r.left) > 2 && Math.min(shown.bottom, r.bottom) - Math.max(shown.top, r.top) > 2)
          .map(({ id }) => id)
      : [];
    return {
      id: e.id,
      layoutPastEdge: Math.max(0, Math.round(b.right - W)),
      textCutOff: hasText ? Math.max(0, Math.round(t.right - visibleRight)) : 0,
      underBars: under,
    };
  });
  // A label can be clipped by its own box or by an ancestor, on either side
  // ("VISUAL PRESETS" loses its start, "LOCATION" its end), so compare the
  // glyphs' extent with what is painted, the same way as the HUD.
  const dockLabels = [...document.querySelectorAll("#command-dock .location-toolbar-label, #command-dock .panel-title")].filter(vis).map((e) => {
    const p = paintedBox(e);
    const range = document.createRange();
    range.selectNodeContents(e);
    const t = range.getBoundingClientRect();
    const shown = Math.max(0, Math.min(t.right, p.right, W) - Math.max(t.left, p.left, 0));
    return { text: e.textContent.trim(), textWidth: Math.round(t.width), shownWidth: Math.round(shown), clipped: t.width - shown > 1 };
  });
  const logos = [...document.querySelectorAll(".cesium-credit-logoContainer img")].filter(vis).map((e) => Math.round(e.getBoundingClientRect().width));
  const voice = [...document.querySelectorAll("#gev-voice-control")].some(vis);
  return { viewportWidth: W, bars, hud, dockLabels, logos, voiceControlVisible: voice };
};

const measureLayersOpen = () => {
  const vis = (e) => {
    const s = getComputedStyle(e);
    const b = e.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0;
  };
  const panel = document.querySelector("#data-panel");
  const pb = panel.getBoundingClientRect();
  const toggles = [...panel.querySelectorAll(".data-toggle-btn")].filter(vis);
  const heights = [...new Set(toggles.map((t) => Math.round(t.getBoundingClientRect().height)))];
  const inner = panel.querySelector("[class$='-inner']") || panel;
  const ib = inner.getBoundingClientRect();
  const rowsOnScreen = toggles.filter((t) => {
    const b = t.getBoundingClientRect();
    return b.top >= Math.max(0, ib.top) && b.bottom <= Math.min(innerHeight, ib.bottom);
  }).length;
  return { expanded: !panel.classList.contains("collapsed"), panelWidth: Math.round(pb.width), toggleHeights: heights, toggles: toggles.length, togglesFullyOnScreen: rowsOnScreen };
};

const snapshotIds = () => {
  const out = {};
  for (const e of document.querySelectorAll("body [id]")) {
    if (e.closest("svg") || e.tagName === "CANVAS") continue;
    const s = getComputedStyle(e);
    const b = e.getBoundingClientRect();
    const shown = s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0;
    out[e.id] = shown ? [b.x, b.y, b.width, b.height].map((v) => Math.round(v)).join(",") : "hidden";
  }
  return out;
};

async function phoneRun(browser, patched) {
  const { context, page } = await openApp(browser, PHONE, patched);
  const idle = await page.evaluate(measurePhone);
  if (args.shots) await page.screenshot({ path: path.join(args.shots, `phone-${patched ? "after" : "before"}.png`) });
  await page.click("#data-panel .panel-collapse-btn[data-collapse-target]");
  await page.waitForTimeout(1500);
  const layers = await page.evaluate(measureLayersOpen);
  await context.close();
  return { idle, layers };
}

async function desktopRun(browser, patched) {
  const { context, page } = await openApp(browser, DESKTOP, patched);
  const ids = await page.evaluate(snapshotIds);
  await context.close();
  return ids;
}

const browser = await chromium.launch({
  headless: true,
  ...(args.browser ? { executablePath: args.browser } : {}),
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const result = { url: URL_, measuredAt: new Date().toISOString(), phone: {}, desktop: {} };
try {
  result.phone.before = await phoneRun(browser, false);
  result.phone.after = await phoneRun(browser, true);
  // Two loads of each: anything that differs between two loads of the same
  // page (the blinking record dot, a clock) is the app moving on its own, not
  // the pack, and is left out.
  const dBefore = await desktopRun(browser, false);
  const dBeforeAgain = await desktopRun(browser, false);
  const dAfter = await desktopRun(browser, true);
  const dAfterAgain = await desktopRun(browser, true);
  const ids = [...new Set([...Object.keys(dBefore), ...Object.keys(dAfter)])];
  const unstable = ids.filter((id) => dBefore[id] !== dBeforeAgain[id] || dAfter[id] !== dAfterAgain[id]);
  result.desktop.idsCompared = ids.length - unstable.length;
  result.desktop.unstableIgnored = unstable;
  result.desktop.changed = ids
    .filter((id) => !unstable.includes(id) && dBefore[id] !== dAfter[id])
    .map((id) => ({ id, before: dBefore[id] ?? "absent", after: dAfter[id] ?? "absent" }));
} finally {
  await browser.close();
}

const row = (label, b, a) => console.log(`${label.padEnd(44)} ${String(b).padEnd(34)} ${a}`);
const summarize = (r) => {
  const bars = r.idle.bars;
  const hudLayout = r.idle.hud.filter((h) => h.layoutPastEdge > 0);
  const hudCut = r.idle.hud.filter((h) => h.textCutOff > 0);
  const hudUnder = r.idle.hud.filter((h) => h.underBars.length > 0);
  return {
    barWidths: bars.map((b) => b.width).join(" / "),
    barX: [...new Set(bars.map((b) => b.x))].join(", "),
    barHeights: `${bars.reduce((s, b) => s + b.height, 0)}px (${bars.length} bars)`,
    hudLayout: hudLayout.length ? `${hudLayout.length}, up to ${Math.max(...hudLayout.map((h) => h.layoutPastEdge))}px` : "0",
    hudCut: hudCut.length ? `${hudCut.length} (${hudCut.map((h) => `${h.id} ${h.textCutOff}px`).join(", ")})` : "0",
    hudUnder: hudUnder.length ? `${hudUnder.length} (${hudUnder.map((h) => h.id).join(", ")})` : "0",
    dock: r.idle.dockLabels.map((d) => `${d.text}${d.clipped ? ` (${d.shownWidth} of ${d.textWidth}px shown)` : ""}`).join("; ") || "none found",
    logos: r.idle.logos.map((w) => `${w}px`).join(" + ") || "none",
    voice: r.idle.voiceControlVisible ? "visible" : "hidden",
    panelOpen: `${r.layers.panelWidth}px`,
    toggles: `${r.layers.toggleHeights.join("/")}px, ${r.layers.togglesFullyOnScreen} of ${r.layers.toggles} fully on screen`,
  };
};
const b = summarize(result.phone.before);
const a = summarize(result.phone.after);
console.log(`\n${URL_} at 412 x 915, DPR 3, idle unless noted\n`);
row("", "upstream as shipped", "with this pack");
row("Collapsed bar widths", b.barWidths, a.barWidths);
row("Collapsed bar x positions", b.barX, a.barX);
row("Collapsed bar heights, summed", b.barHeights, a.barHeights);
row("HUD layout boxes past the right edge", b.hudLayout, a.hudLayout);
row("HUD readouts with text cut off", b.hudCut, a.hudCut);
row("HUD readouts under a panel bar", b.hudUnder, a.hudUnder);
row("Dock labels", b.dock, a.dock);
row("Attribution logos", b.logos, a.logos);
row("Voice control button", b.voice, a.voice);
row("DATA LAYERS open: panel width", b.panelOpen, a.panelOpen);
row("DATA LAYERS open: switch height, rows", b.toggles, a.toggles);
console.log(`\nDesktop 1440 x 900: ${result.desktop.changed.length} of ${result.desktop.idsCompared} elements with an id moved, resized, appeared or disappeared (${result.desktop.unstableIgnored.length} that change on their own were left out)`);
for (const c of result.desktop.changed) console.log(`  #${c.id}: ${c.before} -> ${c.after}`);
if (args.json) fs.writeFileSync(args.json, JSON.stringify(result, null, 2) + "\n");
