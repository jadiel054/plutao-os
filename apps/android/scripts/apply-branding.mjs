import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptsDir, "..");
const source = path.join(appDir, "branding", "res");
const target = path.join(appDir, "android", "app", "src", "main", "res");
const manifestPath = path.join(appDir, "android", "app", "src", "main", "AndroidManifest.xml");

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true, force: true });
const manifest = await (await import("node:fs/promises")).readFile(manifestPath, "utf8");
const oauthIntentFilter = `            <intent-filter>\n                <action android:name="android.intent.action.VIEW" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <category android:name="android.intent.category.BROWSABLE" />\n                <data android:scheme="plutao" android:host="oauth" />\n            </intent-filter>`;
if (!manifest.includes('android:scheme="plutao"')) {
  const updatedManifest = manifest.replace(
    `                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>`,
    `                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n${oauthIntentFilter}`
  );
  await (await import("node:fs/promises")).writeFile(manifestPath, updatedManifest);
}
console.log(`Applied Plutão Android branding from ${source}`);
