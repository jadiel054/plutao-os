from pathlib import Path

path = Path("apps/android/android/app/build.gradle")
text = path.read_text()
if "debug-keystore.properties" not in text:
    prefix = '''def pinnedDebugProperties = new Properties()
def pinnedDebugFile = rootProject.file("debug-keystore.properties")
if (pinnedDebugFile.exists()) {
    pinnedDebugProperties.load(new FileInputStream(pinnedDebugFile))
}
'''
    signing = '''    signingConfigs {
        debug {
            storeFile file(pinnedDebugProperties["storeFile"])
            storePassword pinnedDebugProperties["storePassword"]
            keyAlias pinnedDebugProperties["keyAlias"]
            keyPassword pinnedDebugProperties["keyPassword"]
        }
    }
'''
    text = text.replace("android {\n", prefix + "android {\n" + signing, 1)
    text = text.replace("    buildTypes {\n", "    buildTypes {\n        debug { signingConfig signingConfigs.debug }\n", 1)
    path.write_text(text)
