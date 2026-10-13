package app.plutao.os;

import java.io.File;
import java.io.FileInputStream;

public class GGUFEngine {

    private static boolean isNativeLoaded = false;

    static {
        try {
            System.loadLibrary("gguf_engine");
            isNativeLoaded = true;
        } catch (Throwable t) {
            isNativeLoaded = false;
        }
    }

    public static boolean isNativeAvailable() {
        return isNativeLoaded;
    }

    private long nativeHandle = 0;

    public static boolean validateGGUFHeader(File file) {
        if (file == null || !file.exists() || file.length() < 4) {
            return false;
        }
        try (FileInputStream fis = new FileInputStream(file)) {
            byte[] header = new byte[4];
            int read = fis.read(header);
            return read == 4 && header[0] == 'G' && header[1] == 'G' && header[2] == 'U' && header[3] == 'F';
        } catch (Exception e) {
            return false;
        }
    }

    public boolean loadModel(String modelPath) throws Exception {
        File file = new File(modelPath);
        if (!file.exists()) {
            throw new Exception("Model file does not exist at " + modelPath);
        }
        if (!validateGGUFHeader(file)) {
            throw new Exception("File is not a valid GGUF format (missing GGUF magic bytes)");
        }

        if (isNativeLoaded) {
            this.nativeHandle = nativeLoadModel(modelPath);
            if (this.nativeHandle == 0) {
                throw new Exception("Failed to load GGUF model weights into C++ memory context");
            }
        } else {
            throw new Exception("Native C++ library libgguf_engine.so is not available on this device");
        }
        return true;
    }

    public interface TokenCallback {
        void onToken(String token, String accumulated, boolean done);
    }

    public String generateResponse(String promptText, int maxTokens, TokenCallback callback) throws Exception {
        if (this.nativeHandle == 0) {
            throw new Exception("GGUF Engine model weights are not loaded");
        }

        return nativeGenerate(this.nativeHandle, promptText, maxTokens, callback);
    }

    public void unload() {
        if (isNativeLoaded && this.nativeHandle != 0) {
            nativeFreeModel(this.nativeHandle);
            this.nativeHandle = 0;
        }
    }

    private native long nativeLoadModel(String path);
    private native String nativeGenerate(long handle, String prompt, int maxTokens, TokenCallback callback);
    private native void nativeFreeModel(long handle);
}
