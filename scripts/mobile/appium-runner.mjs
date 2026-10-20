import fs from "node:fs/promises";
import process from "node:process";
import { remote } from "webdriverio";

const actions = JSON.parse(process.env.ACTIONS_JSON || "[]");
const device = process.env.DEVICE_SERIAL;
const out = process.env.OUTPUT_DIR || "out";
await fs.mkdir(out, { recursive: true });
if (!Array.isArray(actions) || actions.length > 100) throw new Error("actions must be an array with at most 100 entries");
const allowed = new Set(["tap", "text", "wait", "screenshot", "assertText"]);
for (const action of actions) {
  if (!action || typeof action !== "object" || !allowed.has(action.type)) throw new Error("unsupported Appium action");
}
const browser = await remote({
  hostname: "127.0.0.1", port: 4723, path: "/", logLevel: "warn",
  capabilities: {
    platformName: "Android", "appium:automationName": "UiAutomator2",
    "appium:udid": device, "appium:noReset": true, "appium:newCommandTimeout": 120,
  },
});
try {
  let step = 0;
  for (const action of actions) {
    step += 1;
    if (action.type === "tap") await browser.$(`android=${String(action.selector)}`).click();
    if (action.type === "text") await browser.$(`android=${String(action.selector)}`).setValue(String(action.value ?? ""));
    if (action.type === "wait") await browser.pause(Math.min(Math.max(Number(action.ms ?? 500), 0), 10_000));
    if (action.type === "assertText") {
      const source = await browser.getPageSource();
      if (!source.includes(String(action.text))) throw new Error(`assertText failed at step ${step}`);
    }
    if (action.type === "screenshot") await browser.saveScreenshot(`${out}/step-${String(step).padStart(3, "0")}.png`);
  }
  await fs.writeFile(`${out}/page-source.xml`, await browser.getPageSource());
  await fs.writeFile(`${out}/result.json`, JSON.stringify({ ok: true, device, steps: actions.length }, null, 2));
} finally {
  await browser.deleteSession();
}
