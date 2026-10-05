import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptsDir, "..");
const source = path.join(appDir, "branding", "res");
const target = path.join(appDir, "android", "app", "src", "main", "res");

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true, force: true });
console.log(`Applied Plutão Android branding from ${source}`);
