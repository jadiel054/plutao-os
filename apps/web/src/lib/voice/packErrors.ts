/**
 * Formatação de progresso e erros de packs de voz (Kokoro / Piper).
 * Alinhado ao padrão SupertonicDownloadError: pack + arquivo + mensagem legível.
 */

export type PackErrorOpts = {
  packId: string;
  packName: string;
  file?: string;
  phase?: string;
  cause?: unknown;
};

/** Mensagens genéricas (ex.: "network error") viram detalhe legível com pack/arquivo. */
export function formatPackError(opts: PackErrorOpts): string {
  const raw =
    opts.cause instanceof Error
      ? opts.cause.message
      : opts.cause != null
        ? String(opts.cause)
        : "falha desconhecida";
  const cleaned = raw.replace(/^Error:\s*/i, "").trim() || "falha desconhecida";
  const filePart = opts.file ? ` · ${opts.file}` : "";
  const phasePart = opts.phase ? ` (${opts.phase})` : "";
  return `${opts.packName}${filePart}${phasePart}: ${cleaned}`;
}

export class PackDownloadError extends Error {
  readonly packId: string;
  readonly packName: string;
  readonly file?: string;
  readonly phase?: string;

  constructor(opts: PackErrorOpts) {
    super(formatPackError(opts));
    this.name = "PackDownloadError";
    this.packId = opts.packId;
    this.packName = opts.packName;
    this.file = opts.file;
    this.phase = opts.phase;
    if (opts.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = opts.cause;
    }
  }
}

/**
 * HuggingFace / transformers progress_callback frequentemente manda status="progress".
 * UI não deve mostrar esse literal — mapeia para texto útil ou omite detalhe vazio.
 */
export function formatKokoroProgressDetail(
  p: { progress?: number; status?: string; file?: string; name?: string },
  pct: number
): string {
  const file = (p.file || p.name || "").split("/").pop() || "";
  const status = (p.status || "").trim().toLowerCase();

  if (file) {
    return `Kokoro · ${file} · ${pct}%`;
  }

  // Literais inúteis do loader
  if (!status || status === "progress" || status === "download" || status === "downloading") {
    return `Kokoro · baixando modelo · ${pct}%`;
  }

  if (status === "done" || status === "ready") {
    return "Kokoro · finalizando…";
  }

  return `Kokoro · ${p.status} · ${pct}%`;
}

export function formatPiperProgressDetail(pct: number, voiceId: string): string {
  return `Piper · ${voiceId} · ${pct}%`;
}
