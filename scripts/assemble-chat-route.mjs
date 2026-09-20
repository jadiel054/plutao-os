#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "../tmp/route_parts_v2");
const out = path.join(__dirname, "../apps/web/src/app/api/chat/route.ts");
if (!fs.existsSync(dir)) {
  console.log("assemble-chat-route: no parts dir, skip");
  process.exit(0);
}
const files = fs
  .readdirSync(dir)
  .filter((f) => /^p\d+\.txt$/.test(f))
  .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
if (files.length === 0) {
  console.log("assemble-chat-route: no part files, skip");
  process.exit(0);
}
const text = files.map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, text);
console.log("assemble-chat-route: wrote", out, text.length, "bytes");
