import os
import re
from pathlib import Path

path = Path("apps/android/android/app/build.gradle")
text = path.read_text()
version_code = os.environ["VERSION_CODE"]
version_name = os.environ["VERSION_NAME"]
if not version_code.isdigit() or int(version_code) < 1:
    raise SystemExit("VERSION_CODE must be a positive integer")
if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:[-.][0-9A-Za-z.-]+)?", version_name):
    raise SystemExit("VERSION_NAME is not a valid Android version name")

text = re.sub(r"versionCode\s+\d+", f"versionCode {version_code}", text, count=1)
text = re.sub(r'versionName\s+"[^"]*"', f'versionName "{version_name}"', text, count=1)

if "release-keystore.properties" not in text:
    prefix = '''def pinnedReleaseProperties = new Properties()
def pinnedReleaseFile = rootProject.file("release-keystore.properties")
if (pinnedReleaseFile.exists()) {
    pinnedReleaseProperties.load(new FileInputStream(pinnedReleaseFile))
}
'''
    signing = '''    signingConfigs {
        release {
            storeFile file(pinnedReleaseProperties["storeFile"])
            storePassword pinnedReleaseProperties["storePassword"]
            keyAlias pinnedReleaseProperties["keyAlias"]
            keyPassword pinnedReleaseProperties["keyPassword"]
        }
    }
'''
    text = text.replace("android {\n", prefix + "android {\n" + signing, 1)
    text = text.replace(
        "    buildTypes {\n        release {\n",
        "    buildTypes {\n        release {\n            signingConfig signingConfigs.release\n",
        1,
    )
path.write_text(text)
