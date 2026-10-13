package app.plutao.os;

import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "LocalModelPlugin")
public class LocalModelPlugin extends Plugin {

    private final ExecutorService executorService = Executors.newCachedThreadPool();
    private final Map<String, Thread> activeDownloads = new ConcurrentHashMap<>();
    private String loadedModelId = null;
    private GGUFEngine loadedEngine = null;

    private File getModelsDir() {
        File dir = new File(getContext().getFilesDir(), "models");
        if (!dir.exists()) {
            dir.mkdirs();
        }
        return dir;
    }

    private String sanitizeId(String id) {
        if (id == null) return "unknown";
        return id.replaceAll("[^a-zA-Z0-9._-]", "_");
    }

    @PluginMethod
    public void listModels(PluginCall call) {
        try {
            File dir = getModelsDir();
            File[] files = dir.listFiles((d, name) -> name.endsWith(".gguf"));
            JSArray modelsList = new JSArray();

            if (files != null) {
                for (File file : files) {
                    if (GGUFEngine.validateGGUFHeader(file)) {
                        JSObject modelObj = new JSObject();
                        String filename = file.getName();
                        String id = filename.substring(0, filename.length() - 5);
                        modelObj.put("id", id);
                        modelObj.put("name", id.replace("_", " "));
                        modelObj.put("filename", filename);
                        modelObj.put("sizeBytes", file.length());
                        modelObj.put("path", file.getAbsolutePath());
                        modelObj.put("status", "ready");
                        modelObj.put("downloadedAt", file.lastModified());
                        modelsList.put(modelObj);
                    }
                }
            }

            JSObject result = new JSObject();
            result.put("models", modelsList);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to list models: " + e.getMessage());
        }
    }

    @PluginMethod
    public void downloadModel(PluginCall call) {
        String urlStr = call.getString("url");
        String rawId = call.getString("id");

        if (urlStr == null || rawId == null) {
            call.reject("url and id are required");
            return;
        }

        final String id = sanitizeId(rawId);
        File targetFile = new File(getModelsDir(), id + ".gguf");

        if (activeDownloads.containsKey(id)) {
            call.reject("Download already in progress for model: " + id);
            return;
        }

        call.resolve(new JSObject().put("status", "started").put("id", id));

        Thread downloadThread = new Thread(() -> {
            HttpURLConnection connection = null;
            InputStream input = null;
            OutputStream output = null;

            try {
                URL url = new URL(urlStr);
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                connection.connect();

                int responseCode = connection.getResponseCode();
                if (responseCode != HttpURLConnection.HTTP_OK) {
                    notifyError(id, "HTTP error code: " + responseCode);
                    return;
                }

                long fileLength = connection.getContentLengthLong();
                input = connection.getInputStream();
                output = new FileOutputStream(targetFile);

                byte[] data = new byte[8192];
                long total = 0;
                int count;
                long lastNotify = 0;

                while ((count = input.read(data)) != -1) {
                    if (Thread.currentThread().isInterrupted()) {
                        output.close();
                        targetFile.delete();
                        notifyStatus(id, 0, total, fileLength, "cancelled", null);
                        return;
                    }

                    total += count;
                    output.write(data, 0, count);

                    long now = System.currentTimeMillis();
                    if (now - lastNotify > 300 || total == fileLength) {
                        lastNotify = now;
                        int progress = fileLength > 0 ? (int) ((total * 100) / fileLength) : 0;
                        notifyStatus(id, progress, total, fileLength, "downloading", null);
                    }
                }

                output.flush();

                if (!GGUFEngine.validateGGUFHeader(targetFile)) {
                    targetFile.delete();
                    notifyError(id, "Downloaded file failed GGUF magic header validation");
                    return;
                }

                notifyStatus(id, 100, total, fileLength, "ready", null);

            } catch (Exception e) {
                if (targetFile.exists()) {
                    targetFile.delete();
                }
                notifyError(id, e.getMessage());
            } finally {
                activeDownloads.remove(id);
                try {
                    if (output != null) output.close();
                    if (input != null) input.close();
                    if (connection != null) connection.disconnect();
                } catch (Exception ignored) {}
            }
        });

        activeDownloads.put(id, downloadThread);
        downloadThread.start();
    }

    private void notifyStatus(String id, int progress, long loadedBytes, long totalBytes, String status, String error) {
        JSObject event = new JSObject();
        event.put("id", id);
        event.put("progress", progress);
        event.put("loadedBytes", loadedBytes);
        event.put("totalBytes", totalBytes);
        event.put("status", status);
        if (error != null) event.put("error", error);
        notifyListeners("downloadProgress", event);
    }

    private void notifyError(String id, String error) {
        notifyStatus(id, 0, 0, 0, "error", error);
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        String rawId = call.getString("id");
        if (rawId == null) {
            call.reject("id is required");
            return;
        }
        String id = sanitizeId(rawId);
        Thread thread = activeDownloads.remove(id);
        if (thread != null) {
            thread.interrupt();
            call.resolve(new JSObject().put("cancelled", true).put("id", id));
        } else {
            call.resolve(new JSObject().put("cancelled", false).put("reason", "No active download"));
        }
    }

    @PluginMethod
    public void importModel(PluginCall call) {
        String uriStr = call.getString("uri");
        String rawName = call.getString("name", "imported_model");

        if (uriStr == null) {
            call.reject("uri is required");
            return;
        }

        String id = sanitizeId(rawName.endsWith(".gguf") ? rawName.substring(0, rawName.length() - 5) : rawName);
        File targetFile = new File(getModelsDir(), id + ".gguf");

        executorService.execute(() -> {
            try {
                Uri uri = Uri.parse(uriStr);
                InputStream input;
                if (uriStr.startsWith("content://") || uriStr.startsWith("file://")) {
                    input = getContext().getContentResolver().openInputStream(uri);
                } else {
                    input = new FileInputStream(new File(uriStr));
                }

                if (input == null) {
                    call.reject("Could not open input file at " + uriStr);
                    return;
                }

                OutputStream output = new FileOutputStream(targetFile);
                byte[] buffer = new byte[8192];
                int bytesRead;
                long total = 0;

                while ((bytesRead = input.read(buffer)) != -1) {
                    output.write(buffer, 0, bytesRead);
                    total += bytesRead;
                }

                input.close();
                output.flush();
                output.close();

                if (!GGUFEngine.validateGGUFHeader(targetFile)) {
                    targetFile.delete();
                    call.reject("Imported file is not a valid GGUF model");
                    return;
                }

                JSObject result = new JSObject();
                result.put("id", id);
                result.put("name", id.replace("_", " "));
                result.put("filename", targetFile.getName());
                result.put("sizeBytes", total);
                result.put("path", targetFile.getAbsolutePath());
                result.put("status", "ready");
                call.resolve(result);

            } catch (Exception e) {
                call.reject("Failed to import model file: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void deleteModel(PluginCall call) {
        String rawId = call.getString("id");
        if (rawId == null) {
            call.reject("id is required");
            return;
        }

        String id = sanitizeId(rawId);
        File targetFile = new File(getModelsDir(), id + ".gguf");

        if (targetFile.exists()) {
            boolean deleted = targetFile.delete();
            if (id.equals(loadedModelId)) {
                if (loadedEngine != null) {
                    loadedEngine.unload();
                    loadedEngine = null;
                }
                loadedModelId = null;
            }
            call.resolve(new JSObject().put("success", deleted).put("id", id));
        } else {
            call.resolve(new JSObject().put("success", true).put("id", id).put("note", "File did not exist"));
        }
    }

    @PluginMethod
    public void loadModel(PluginCall call) {
        String rawId = call.getString("id");
        if (rawId == null) {
            call.reject("id is required");
            return;
        }

        String id = sanitizeId(rawId);
        File targetFile = new File(getModelsDir(), id + ".gguf");

        if (!targetFile.exists()) {
            call.reject("Model file does not exist: " + targetFile.getAbsolutePath());
            return;
        }

        try {
            if (loadedEngine != null) {
                loadedEngine.unload();
            }

            GGUFEngine engine = new GGUFEngine();
            engine.loadModel(targetFile.getAbsolutePath());

            this.loadedEngine = engine;
            this.loadedModelId = id;

            JSObject result = new JSObject();
            result.put("loaded", true);
            result.put("modelId", id);
            result.put("path", targetFile.getAbsolutePath());
            result.put("sizeBytes", targetFile.length());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to load GGUF model: " + e.getMessage());
        }
    }

    @PluginMethod
    public void unloadModel(PluginCall call) {
        if (loadedEngine != null) {
            loadedEngine.unload();
            loadedEngine = null;
        }
        this.loadedModelId = null;
        call.resolve(new JSObject().put("unloaded", true));
    }

    @PluginMethod
    public void chatCompletion(PluginCall call) {
        JSArray messages = call.getArray("messages");
        String rawId = call.getString("modelId", loadedModelId);
        int maxTokens = call.getInt("maxTokens", 1024);

        if (rawId == null) {
            call.reject("No model loaded or specified");
            return;
        }

        String id = sanitizeId(rawId);
        File targetFile = new File(getModelsDir(), id + ".gguf");

        if (!targetFile.exists()) {
            call.reject("Model file not installed: " + id);
            return;
        }

        executorService.execute(() -> {
            try {
                if (loadedEngine == null || !id.equals(loadedModelId)) {
                    if (loadedEngine != null) {
                        loadedEngine.unload();
                    }
                    GGUFEngine engine = new GGUFEngine();
                    engine.loadModel(targetFile.getAbsolutePath());
                    this.loadedEngine = engine;
                    this.loadedModelId = id;
                }

                String promptText = "";
                if (messages != null && messages.length() > 0) {
                    for (int i = 0; i < messages.length(); i++) {
                        JSONObject msg = messages.getJSONObject(i);
                        if (msg != null) {
                            String role = msg.optString("role", "user");
                            String content = msg.optString("content", "");
                            if ("user".equals(role)) {
                                promptText = content;
                            }
                        }
                    }
                }

                if (promptText.isEmpty()) {
                    promptText = "Olá!";
                }

                final String finalModelId = id;
                String responseText = loadedEngine.generateResponse(promptText, maxTokens, (token, accumulated, done) -> {
                    JSObject tokenEvent = new JSObject();
                    tokenEvent.put("token", token);
                    tokenEvent.put("text", accumulated);
                    tokenEvent.put("done", done);
                    tokenEvent.put("modelId", finalModelId);
                    notifyListeners("localTokenStream", tokenEvent);
                });

                JSObject result = new JSObject();
                result.put("text", responseText);
                result.put("done", true);
                result.put("modelId", id);
                call.resolve(result);

            } catch (Exception e) {
                call.reject("Error during local GGUF completion: " + e.getMessage());
            }
        });
    }
}
