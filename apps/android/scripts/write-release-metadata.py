import json
import os
from pathlib import Path

version = os.environ["VERSION_NAME"]
code = int(os.environ["VERSION_CODE"])
repository = os.environ["REPOSITORY"]
tag = os.environ["TAG"]
apk_name = f"plutao-{version}.apk"
apk = Path("apps/android/android/app/build/outputs/apk/release/app-release.apk")
sha256 = os.popen(f"sha256sum '{apk}'").read().split()[0]
size = apk.stat().st_size
signing = os.popen(f"keytool -printcert -jarfile '{apk}'").read().split("SHA256: ", 1)[-1].splitlines()[0].strip()
metadata = {
    "versionCode": code,
    "versionName": version,
    "notes": f"Plutão {version}",
    "date": os.environ["RELEASE_DATE"],
    "apkUrl": f"https://github.com/{repository}/releases/download/{tag}/{apk_name}",
    "sha256": sha256,
    "size": size,
    "signingSha256": signing,
}
Path("release-metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
Path(apk_name).write_bytes(apk.read_bytes())
print(f"APK SHA-256: {sha256}")
print(f"APK signing SHA-256: {signing}")
print(f"APK size: {size} bytes")
print(f"apk_name={apk_name}")
with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
    output.write(f"apk_name={apk_name}\nsha256={sha256}\n")
