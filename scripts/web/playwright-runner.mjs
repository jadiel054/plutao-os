import fs from "node:fs/promises";
import { chromium } from "@playwright/test";

const url = new URL(process.env.TARGET_URL);
const allowedHosts = (process.env.ALLOWED_HOSTS || url.hostname).split(",").map((v) => v.trim()).filter(Boolean);
if (!allowedHosts.includes(url.hostname)) throw new Error("TARGET_URL_HOST_NOT_ALLOWED");
const actions = JSON.parse(process.env.ACTIONS_JSON || "[]");
if (!Array.isArray(actions) || actions.length > 100) throw new Error("actions must be an array with at most 100 entries");
const out = process.env.OUTPUT_DIR || "out";
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ recordVideo: { dir: out } });
await context.tracing.start({ screenshots: true, snapshots: true });
const page = await context.newPage();
try {
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30_000 });
  let step = 0;
  for (const action of actions) {
    step += 1;
    if (!action || typeof action !== "object") throw new Error(`invalid action ${step}`);
    if (action.type === "click") await page.getByRole(String(action.role || "button"), { name: String(action.name) }).click();
    else if (action.type === "fill") await page.locator(String(action.selector)).fill(String(action.value ?? ""));
    else if (action.type === "waitForText") await page.getByText(String(action.text)).waitFor({ timeout: 15_000 });
    else if (action.type === "screenshot") await page.screenshot({ path: `${out}/step-${String(step).padStart(3, "0")}.png`, fullPage: true });
    else if (action.type === "assertText") await page.getByText(String(action.text)).waitFor({ timeout: 15_000 });
    else throw new Error(`unsupported action ${String(action.type)}`);
  }
  await page.screenshot({ path: `${out}/final.png`, fullPage: true });
  await fs.writeFile(`${out}/result.json`, JSON.stringify({ ok: true, url: url.toString(), steps: actions.length }, null, 2));
} finally {
  await context.tracing.stop({ path: `${out}/trace.zip` });
  await browser.close();
}
