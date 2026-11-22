/**
 * Ad-hoc visual capture, for eyeballing the dashboard while iterating on design.
 * The assertions that gate the work live in dashboard.spec.ts; this just takes
 * full-page screenshots and reports console errors and horizontal overflow.
 *
 *   npx playwright test --project=setup      # once, to create the session
 *   SHOTS=/tmp/shots TARGETS='[["home","/home",1600,1000,"light"]]' node e2e/shot.mjs
 *
 * Each target is [name, path, width, height, theme].
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";

const AUTH = "e2e/.auth/user.json";
const OUT = process.env.SHOTS || "e2e/.artifacts/shots";
const BASE = "http://localhost:3000";
const targets = JSON.parse(process.env.TARGETS || '[["home","/home",1600,1000,"light"]]');

const browser = await chromium.launch();
let failures = 0;

for (const [name, path, w, h, theme] of targets) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
    colorScheme: theme === "dark" ? "dark" : "light",
    storageState: fs.existsSync(AUTH) ? AUTH : undefined,
  });
  const page = await ctx.newPage();
  const problems = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push("console: " + m.text()); });
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));

  await page.addInitScript((t) => {
    try { localStorage.setItem("theme", t); } catch {}
  }, theme);

  const res = await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important;animation:none!important}" });
  await page.waitForTimeout(350);

  const overflow = await page.evaluate(() => {
    const d = document.documentElement;
    const offenders = [];
    if (d.scrollWidth > d.clientWidth) {
      for (const el of document.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.right > window.innerWidth + 1 && r.width > 0) {
          offenders.push(`${el.tagName.toLowerCase()}.${(el.className || "").toString().slice(0, 60)} right=${Math.round(r.right)}`);
        }
      }
    }
    return { scrollW: d.scrollWidth, clientW: d.clientWidth, offenders: offenders.slice(0, 6) };
  });

  const isDark = await page.evaluate(() => document.documentElement.classList.contains("dark"));

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true, animations: "disabled", caret: "hide" });

  const bad = problems.length || overflow.scrollW > overflow.clientW || res.status() !== 200 || (theme === "dark") !== isDark;
  if (bad) failures++;
  console.log(`${bad ? "FAIL" : "ok  "} ${name.padEnd(24)} status=${res.status()} theme=${isDark ? "dark" : "light"} scroll=${overflow.scrollW}/${overflow.clientW}`);
  problems.slice(0, 5).forEach((p) => console.log("      " + p.slice(0, 200)));
  overflow.offenders.forEach((o) => console.log("      overflow: " + o));
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} target(s) with problems` : "\nall targets clean");
