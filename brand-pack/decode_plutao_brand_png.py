#!/usr/bin/env python3
"""Decode plutao_brand_*_b64.json into repo paths. Usage: python3 decode_plutao_brand_png.py <json>"""
import json, base64, os, sys
path = sys.argv[1] if len(sys.argv) > 1 else "plutao_brand_png_b64.json"
data = json.load(open(path))
for rel, b64 in data["files_b64"].items():
    target = data.get("repo_targets", {}).get(rel, os.path.join("assets/brand", rel))
    os.makedirs(os.path.dirname(target) or ".", exist_ok=True)
    open(target, "wb").write(base64.b64decode(b64))
    print("wrote", target)
for rel, target in data.get("pwa_copies", {}).items():
    os.makedirs(os.path.dirname(target) or ".", exist_ok=True)
    open(target, "wb").write(base64.b64decode(data["files_b64"][rel]))
    print("wrote", target)
print("done")
