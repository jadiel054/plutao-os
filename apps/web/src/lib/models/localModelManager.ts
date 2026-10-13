import { Capacitor, registerPlugin } from "@capacitor/core";

export interface InstalledModel {
  id: string;
  name: string;
  filename: string;
  sizeBytes: number;
  path: string;
  downloadedAt: number;
  status: "ready" | "downloading" | "error";
}

export interface DownloadProgress {
  id: string;
  progress: number;
  loadedBytes: number;
  totalBytes: number;
  status: "downloading" | "ready" | "cancelled" | "error";
  error?: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LocalModelPluginInterface {
  listModels(): Promise<{ models: InstalledModel[] }>;
  downloadModel(options: { url: string; id: string; name?: string }): Promise<{ status: string; id: string }>;
  cancelDownload(options: { id: string }): Promise<{ cancelled: boolean; id: string }>;
  importModel(options: { uri: string; name?: string }): Promise<InstalledModel>;
  deleteModel(options: { id: string }): Promise<{ success: boolean; id: string }>;
  loadModel(options: { id: string }): Promise<{ loaded: boolean; modelId: string }>;
  unloadModel(): Promise<{ unloaded: boolean }>;
  chatCompletion(options: {
    messages: ChatMessage[];
    maxTokens?: number;
    temperature?: number;
    modelId?: string;
  }): Promise<{ text: string; done: boolean; modelId: string }>;
  addListener(
    eventName: "downloadProgress",
    listenerFunc: (progress: DownloadProgress) => void
  ): Promise<{ remove: () => Promise<void> }>;
  addListener(
    eventName: "localTokenStream",
    listenerFunc: (event: { token: string; text: string; done: boolean; modelId: string }) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

const LocalModelNative = registerPlugin<LocalModelPluginInterface>("LocalModelPlugin");

const LOCAL_SELECTED_MODEL_KEY = "plutao_selected_local_model_id";
const BROWSER_MOCK_MODELS_KEY = "plutao_browser_mock_installed_models";

export function isNativeLocalSupported(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

export function getSelectedLocalModel(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LOCAL_SELECTED_MODEL_KEY);
  } catch {
    return null;
  }
}

export function setSelectedLocalModel(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id) {
      localStorage.setItem(LOCAL_SELECTED_MODEL_KEY, id);
    } else {
      localStorage.removeItem(LOCAL_SELECTED_MODEL_KEY);
    }
  } catch {
    /* ignore storage error */
  }
}

function getBrowserInstalledModels(): InstalledModel[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(BROWSER_MOCK_MODELS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBrowserInstalledModels(models: InstalledModel[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(BROWSER_MOCK_MODELS_KEY, JSON.stringify(models));
  } catch {
    /* ignore */
  }
}

export async function listInstalledModels(): Promise<InstalledModel[]> {
  if (isNativeLocalSupported()) {
    try {
      const res = await LocalModelNative.listModels();
      return Array.isArray(res.models) ? res.models : [];
    } catch {
      return [];
    }
  }
  return getBrowserInstalledModels();
}

export async function downloadModel(
  options: { url: string; id: string; name?: string; sizeBytes?: number },
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ id: string }> {
  if (isNativeLocalSupported()) {
    let listenerHandle: { remove: () => Promise<void> } | null = null;
    if (onProgress) {
      listenerHandle = await LocalModelNative.addListener("downloadProgress", (p) => {
        if (p.id === options.id || p.id === options.id.replaceAll(/[^a-zA-Z0-9._-]/g, "_")) {
          onProgress(p);
          if ((p.status === "ready" || p.status === "error" || p.status === "cancelled") && listenerHandle) {
            void listenerHandle.remove();
          }
        }
      });
    }
    const res = await LocalModelNative.downloadModel({
      url: options.url,
      id: options.id,
      name: options.name,
    });
    return { id: res.id };
  }

  // Browser simulation fallback for testing / dev UI
  const id = options.id.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
  const total = options.sizeBytes || 1_100_000_000;
  let loaded = 0;
  const interval = setInterval(() => {
    loaded += Math.round(total / 5);
    const progress = Math.min(100, Math.round((loaded / total) * 100));
    const isDone = loaded >= total;
    if (onProgress) {
      onProgress({
        id,
        progress,
        loadedBytes: Math.min(loaded, total),
        totalBytes: total,
        status: isDone ? "ready" : "downloading",
      });
    }
    if (isDone) {
      clearInterval(interval);
      const current = getBrowserInstalledModels();
      const updated: InstalledModel = {
        id,
        name: options.name || id,
        filename: `${id}.gguf`,
        sizeBytes: total,
        path: `/files/models/${id}.gguf`,
        downloadedAt: Date.now(),
        status: "ready",
      };
      saveBrowserInstalledModels([...current.filter((m) => m.id !== id), updated]);
    }
  }, 100);

  return { id };
}

export async function cancelDownload(id: string): Promise<boolean> {
  if (isNativeLocalSupported()) {
    const res = await LocalModelNative.cancelDownload({ id });
    return res.cancelled;
  }
  return true;
}

export async function importModelFile(
  fileOrUri: File | string,
  name?: string
): Promise<InstalledModel> {
  if (isNativeLocalSupported()) {
    let uri: string;
    let importName = name;

    if (typeof fileOrUri === "string") {
      uri = fileOrUri;
    } else {
      importName = name || fileOrUri.name;
      uri = URL.createObjectURL(fileOrUri);
    }

    try {
      return await LocalModelNative.importModel({ uri, name: importName });
    } catch {
      // Fallback if URL object isn't reachable by Java ContentResolver
    }
  }

  const fileName = typeof fileOrUri === "string" ? name || "imported_model" : fileOrUri.name;
  const id = (fileName.endsWith(".gguf") ? fileName.substring(0, fileName.length - 5) : fileName).replaceAll(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );
  const sizeBytes = typeof fileOrUri === "string" ? 1_000_000 : fileOrUri.size;

  const imported: InstalledModel = {
    id,
    name: name || id.replace(/_/g, " "),
    filename: `${id}.gguf`,
    sizeBytes,
    path: `/files/models/${id}.gguf`,
    downloadedAt: Date.now(),
    status: "ready",
  };

  const current = getBrowserInstalledModels();
  saveBrowserInstalledModels([...current.filter((m) => m.id !== id), imported]);
  return imported;
}

export async function deleteModel(id: string): Promise<boolean> {
  const sanitized = id.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
  if (isNativeLocalSupported()) {
    const res = await LocalModelNative.deleteModel({ id: sanitized });
    if (getSelectedLocalModel() === sanitized || getSelectedLocalModel() === id) {
      setSelectedLocalModel(null);
    }
    return res.success;
  }

  const current = getBrowserInstalledModels();
  saveBrowserInstalledModels(current.filter((m) => m.id !== sanitized && m.id !== id));
  if (getSelectedLocalModel() === sanitized || getSelectedLocalModel() === id) {
    setSelectedLocalModel(null);
  }
  return true;
}

export async function loadModel(id: string): Promise<boolean> {
  if (isNativeLocalSupported()) {
    const res = await LocalModelNative.loadModel({ id });
    return res.loaded;
  }
  return true;
}

export async function unloadModel(): Promise<boolean> {
  if (isNativeLocalSupported()) {
    const res = await LocalModelNative.unloadModel();
    return res.unloaded;
  }
  return true;
}

export async function runLocalChatCompletion(
  options: {
    messages: ChatMessage[];
    maxTokens?: number;
    temperature?: number;
    modelId: string;
  },
  onToken?: (token: string, fullText: string) => void
): Promise<string> {
  if (isNativeLocalSupported()) {
    let listenerHandle: { remove: () => Promise<void> } | null = null;
    if (onToken) {
      listenerHandle = await LocalModelNative.addListener("localTokenStream", (e) => {
        if (onToken) onToken(e.token, e.text);
        if (e.done && listenerHandle) {
          void listenerHandle.remove();
        }
      });
    }

    const res = await LocalModelNative.chatCompletion(options);
    return res.text;
  }

  // Fallback simulator for non-native / testing
  const lastUserMsg = [...options.messages].reverse().find((m) => m.role === "user")?.content || "Olá!";
  const responseText = `Resposta local no Plutão (modelo ${options.modelId}):\n\nRecebi "${lastUserMsg}". A resposta foi processada em modo local.`;
  const tokens = responseText.split(/(?<=\s)/);

  let accumulated = "";
  for (const t of tokens) {
    accumulated += t;
    if (onToken) onToken(t, accumulated);
    await new Promise((r) => setTimeout(r, 20));
  }

  return responseText;
}
