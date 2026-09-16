/**
 * Artifact Utilities & Type Detection — Context Layer
 */

export interface ArtifactTypeInfo {
  type: string;
  extension: string;
}

export function detectArtifactType(name?: string, content: string = ""): ArtifactTypeInfo {
  const trimmedName = name?.trim().toLowerCase() ?? "";

  if (trimmedName.endsWith(".md") || trimmedName.endsWith(".markdown")) {
    return { type: "text/markdown", extension: "md" };
  }
  if (trimmedName.endsWith(".json")) {
    return { type: "application/json", extension: "json" };
  }
  if (trimmedName.endsWith(".csv")) {
    return { type: "text/csv", extension: "csv" };
  }
  if (trimmedName.endsWith(".log")) {
    return { type: "text/x-log", extension: "log" };
  }
  if (trimmedName.endsWith(".js") || trimmedName.endsWith(".ts") || trimmedName.endsWith(".py")) {
    const ext = trimmedName.split(".").pop() || "txt";
    return { type: `text/x-${ext}`, extension: ext };
  }

  const trimmedContent = content.trim();

  if (
    (trimmedContent.startsWith("{") && trimmedContent.endsWith("}")) ||
    (trimmedContent.startsWith("[") && trimmedContent.endsWith("]"))
  ) {
    try {
      JSON.parse(trimmedContent);
      return { type: "application/json", extension: "json" };
    } catch {
      /* not valid JSON */
    }
  }

  if (
    trimmedContent.startsWith("# ") ||
    trimmedContent.startsWith("## ") ||
    trimmedContent.includes("\n# ") ||
    trimmedContent.includes("\n- ") ||
    trimmedContent.includes("```")
  ) {
    return { type: "text/markdown", extension: "md" };
  }

  if (
    /^\[\d{4}-\d{2}-\d{2}/.test(trimmedContent) ||
    /^(INFO|ERROR|WARN|DEBUG)\[/.test(trimmedContent)
  ) {
    return { type: "text/x-log", extension: "log" };
  }

  const lines = trimmedContent.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length > 1 && lines[0].includes(",") && lines[1].includes(",")) {
    const commasLine1 = lines[0].split(",").length;
    const commasLine2 = lines[1].split(",").length;
    if (commasLine1 > 1 && commasLine1 === commasLine2) {
      return { type: "text/csv", extension: "csv" };
    }
  }

  return { type: "text/plain", extension: "txt" };
}

export function suggestArtifactName(content: string, customName?: string): string {
  if (customName && customName.trim().length > 0) {
    return customName.trim().replace(/[^a-zA-Z0-9_.\- ]/g, "_");
  }
  const { extension } = detectArtifactType(undefined, content);
  const now = new Date();
  const dateStr = now.toISOString().slice(2, 10).replace(/-/g, "");
  const timeStr = now.toTimeString().slice(0, 5).replace(":", "");
  return `documento_${dateStr}_${timeStr}.${extension}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
