"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { filterCuratedModels } from "@/lib/models/curatedCatalog";
import { isNativeCapacitor } from "@/lib/auth/mobileOAuth";
import {
  listInstalledModels,
  downloadModel,
  cancelDownload,
  importModelFile,
  deleteModel,
  setSelectedLocalModel,
  type InstalledModel,
  type DownloadProgress,
} from "@/lib/models/localModelManager";

type ModelItem = {
  id: string;
  name: string;
  author: string;
  downloads: number;
  tags: string[];
  pipeline_tag: string | null;
  license?: string | null;
  approxSizeBytes?: number | null;
  sourceUrl: string;
  downloadUrl?: string | null;
  curated?: boolean;
};

type DeviceSignals = { deviceMemoryGb: number | null; cores: number | null; freeStorageGb: number | null };
type Band = "green" | "yellow" | "red" | "cloud";

function formatSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "tamanho não informado";
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  return `${Math.round(bytes / 1_000_000)} MB`;
}

function pipelineIsCloud(model: ModelItem): boolean {
  const pipeline = model.pipeline_tag?.toLowerCase() || "";
  return pipeline.includes("image") || pipeline.includes("video") || Boolean(model.approxSizeBytes && model.approxSizeBytes > 5_000_000_000);
}

function estimateBand(model: ModelItem, signals: DeviceSignals): { band: Band; reason: string } {
  if (pipelineIsCloud(model)) return { band: "cloud", reason: "Este tipo de modelo é pesado ou multimídia; a vitrine não promete execução local." };
  const size = model.approxSizeBytes ?? 0;
  const requiredRam = size > 3_500_000_000 ? 8 : size > 1_800_000_000 ? 4 : 2;
  const requiredStorage = size > 0 ? size * 1.25 : null;
  const memoryText = signals.deviceMemoryGb ? `detectamos pelo menos ${signals.deviceMemoryGb} GB de RAM` : "a memória disponível não foi informada pelo navegador";
  const storageText = signals.freeStorageGb != null ? ` e aproximadamente ${signals.freeStorageGb.toFixed(1)} GB livres estimados` : " e o espaço livre não foi informado";
  if (!signals.deviceMemoryGb || !size) return { band: "yellow", reason: `${memoryText}${storageText}; confirme o tamanho no HF antes de baixar.` };
  if (signals.deviceMemoryGb >= requiredRam && (!requiredStorage || signals.freeStorageGb == null || signals.freeStorageGb >= requiredStorage) && size <= 2_500_000_000) return { band: "green", reason: `${memoryText}; ideal para inferência on-device no app.` };
  if (signals.deviceMemoryGb >= Math.max(2, requiredRam / 2)) return { band: "yellow", reason: `${memoryText}${storageText}; o modelo pode consumir boa parte da memória.` };
  return { band: "red", reason: `${memoryText}; este modelo pede aproximadamente ${requiredRam} GB de memória livre para carregar e o arquivo tem ${formatSize(size)}.` };
}

function readSignals(): Promise<DeviceSignals> {
  if (typeof navigator === "undefined") return Promise.resolve({ deviceMemoryGb: null, cores: null, freeStorageGb: null });
  const nav = navigator as Navigator & { deviceMemory?: number };
  const deviceMemoryGb = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;
  const cores = typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : null;
  if (!navigator.storage?.estimate) return Promise.resolve({ deviceMemoryGb, cores, freeStorageGb: null });
  return navigator.storage.estimate().then((estimate) => {
    const free = estimate.quota != null && estimate.usage != null ? Math.max(0, estimate.quota - estimate.usage) / 1_000_000_000 : null;
    return { deviceMemoryGb, cores, freeStorageGb: free };
  }).catch(() => ({ deviceMemoryGb, cores, freeStorageGb: null }));
}

function bandCopy(band: Band): { label: string; className: string } {
  if (band === "green") return { label: "Roda no seu aparelho", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" };
  if (band === "yellow") return { label: "Roda com ressalvas", className: "border-amber-500/40 bg-amber-500/10 text-amber-300" };
  if (band === "red") return { label: "Não recomendado", className: "border-rose-500/40 bg-rose-500/10 text-rose-300" };
  return { label: "Via nuvem", className: "border-sky-500/40 bg-sky-500/10 text-sky-300" };
}

function ModelCard({
  model,
  signals,
  installedModels,
  downloadingProgress,
  isApk,
  onDownload,
  onCancel,
  onDelete,
  onUseInChat,
}: {
  model: ModelItem;
  signals: DeviceSignals;
  installedModels: InstalledModel[];
  downloadingProgress: Record<string, DownloadProgress>;
  isApk: boolean;
  onDownload: (m: ModelItem) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
  onUseInChat: (id: string) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [riskState, setRiskState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const sanitizedId = model.id.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
  const installedInfo = installedModels.find((m) => m.id === sanitizedId || m.id === model.id);
  const currentProgress = downloadingProgress[sanitizedId] || downloadingProgress[model.id];

  const estimate = estimateBand(model, signals);
  const copy = bandCopy(estimate.band);

  const openDownload = () => {
    const url = model.downloadUrl || model.sourceUrl;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const acceptRisk = async () => {
    setRiskState("saving");
    try {
      const response = await fetch("/api/models/risk-acceptance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model_ref: model.id, reason_shown: estimate.reason }),
      });
      if (!response.ok) throw new Error("risk");
      setRiskState("saved");
      if (isApk && model.downloadUrl) {
        onDownload(model);
      } else {
        openDownload();
      }
    } catch {
      setRiskState("error");
    }
  };

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col gap-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] truncate">
            {model.author}
            {model.curated ? " · curadoria Plutão" : " · resultado HF"}
          </p>
          <h2 className="mt-1 text-base font-bold text-[var(--text-primary)] break-words">{model.name}</h2>
          <p className="mt-1 text-[11px] font-mono text-[var(--text-muted)] break-all">{model.id}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${copy.className}`}>
          {installedInfo ? "Instalado" : copy.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--base)] p-2">
          <span className="block text-[9px] text-[var(--text-muted)]">TAMANHO APROX.</span>
          <span>{formatSize(installedInfo?.sizeBytes || model.approxSizeBytes)}</span>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--base)] p-2">
          <span className="block text-[9px] text-[var(--text-muted)]">LICENÇA</span>
          <span className="truncate block">{model.license || "não informada"}</span>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{estimate.reason}</p>

      {currentProgress && currentProgress.status === "downloading" && (
        <div className="space-y-1.5 rounded-xl border border-[var(--selo)]/30 bg-[var(--selo)]/10 p-3">
          <div className="flex justify-between text-xs font-mono font-medium">
            <span>Baixando no app…</span>
            <span>{currentProgress.progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--border)]">
            <div className="h-full bg-[var(--selo)] transition-all duration-200" style={{ width: `${currentProgress.progress}%` }} />
          </div>
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => onCancel(sanitizedId)}
              className="text-[10px] font-mono text-rose-400 hover:underline cursor-pointer"
            >
              Cancelar download
            </button>
          </div>
        </div>
      )}

      {estimate.band === "red" && expanded && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 space-y-3 text-xs text-rose-100">
          <p>
            <strong>Por quê?</strong> {estimate.reason}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void acceptRisk()}
              disabled={riskState === "saving"}
              className="rounded-xl bg-rose-500 px-3 py-2 font-semibold text-white disabled:opacity-50"
            >
              {riskState === "saving" ? "Registrando…" : "Vou correr o risco"}
            </button>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="rounded-xl border border-[var(--border)] px-3 py-2"
            >
              Escolher outro modelo
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {installedInfo ? (
          <>
            <button
              type="button"
              onClick={() => onUseInChat(sanitizedId)}
              className="rounded-xl bg-[var(--selo)] px-3 py-2 text-xs font-semibold text-[var(--base)] cursor-pointer"
            >
              Usar no chat
            </button>
            <button
              type="button"
              onClick={() => onDelete(sanitizedId)}
              className="rounded-xl border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 cursor-pointer"
            >
              Apagar do app
            </button>
          </>
        ) : estimate.band === "red" ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="rounded-xl border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/10"
          >
            {expanded ? "Fechar explicação" : "Ver por quê e continuar"}
          </button>
        ) : estimate.band === "cloud" ? (
          <a href={model.sourceUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-sky-500/40 px-3 py-2 text-xs font-semibold text-sky-300">
            Ver opção via nuvem
          </a>
        ) : isApk && model.downloadUrl ? (
          <button
            type="button"
            onClick={() => onDownload(model)}
            disabled={Boolean(currentProgress && currentProgress.status === "downloading")}
            className="rounded-xl bg-[var(--selo)] px-3 py-2 text-xs font-semibold text-[var(--base)] disabled:opacity-50 cursor-pointer"
          >
            Baixar no Plutão
          </button>
        ) : model.downloadUrl ? (
          <button type="button" onClick={openDownload} className="rounded-xl bg-[var(--selo)] px-3 py-2 text-xs font-semibold text-[var(--base)]">
            Baixar GGUF
          </button>
        ) : (
          <a href={model.sourceUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold">
            Abrir no HF
          </a>
        )}
        <a href={model.sourceUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          Ver origem
        </a>
      </div>
    </article>
  );
}

export default function ModelosPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [models, setModels] = useState<ModelItem[]>([]);
  const [signals, setSignals] = useState<DeviceSignals>({ deviceMemoryGb: null, cores: null, freeStorageGb: null });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [isApk, setIsApk] = useState(false);
  const [installedModels, setInstalledModels] = useState<InstalledModel[]>([]);
  const [downloadingProgress, setDownloadingProgress] = useState<Record<string, DownloadProgress>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshInstalled = useCallback(async () => {
    const list = await listInstalledModels();
    setInstalledModels(list);
  }, []);

  useEffect(() => {
    setIsApk(isNativeCapacitor());
    void refreshInstalled();
  }, [refreshInstalled]);

  const search = useCallback(async (value: string) => {
    setLoading(true);
    setNotice("");
    try {
      const response = await fetch(`/api/models/search${value ? `?q=${encodeURIComponent(value)}` : ""}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha na busca");
      setModels(Array.isArray(data.models) ? data.models : []);
      if (data.source?.huggingFace === false && value.length >= 2) setNotice("A busca pública do HF não respondeu. Exibindo a curadoria local do Plutão.");
    } catch (error) {
      setModels(filterCuratedModels(value).map((model) => ({ ...model, downloads: 0, pipeline_tag: model.pipelineTag })));
      setNotice(error instanceof Error ? error.message : "Busca indisponível. Exibindo curadoria local.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void readSignals().then(setSignals);
    void search("");
  }, [search]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = query.trim();
    setSubmittedQuery(value);
    void search(value);
  }

  const handleStartDownload = async (model: ModelItem) => {
    if (!model.downloadUrl) return;
    const sanitizedId = model.id.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
    setDownloadingProgress((prev) => ({
      ...prev,
      [sanitizedId]: { id: sanitizedId, progress: 0, loadedBytes: 0, totalBytes: model.approxSizeBytes || 1_000_000_000, status: "downloading" },
    }));

    try {
      await downloadModel(
        { url: model.downloadUrl, id: model.id, name: model.name, sizeBytes: model.approxSizeBytes ?? undefined },
        (progress) => {
          setDownloadingProgress((prev) => ({ ...prev, [sanitizedId]: progress }));
          if (progress.status === "ready") {
            void refreshInstalled();
          }
        }
      );
      void refreshInstalled();
    } catch (err) {
      setDownloadingProgress((prev) => ({
        ...prev,
        [sanitizedId]: { id: sanitizedId, progress: 0, loadedBytes: 0, totalBytes: 0, status: "error", error: String(err) },
      }));
    }
  };

  const handleCancelDownload = async (id: string) => {
    await cancelDownload(id);
    setDownloadingProgress((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const handleDeleteModel = async (id: string) => {
    await deleteModel(id);
    await refreshInstalled();
  };

  const handleUseInChat = (id: string) => {
    setSelectedLocalModel(id);
    router.push("/chat");
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      await importModelFile(file);
    }
    await refreshInstalled();
    if (e.target) e.target.value = "";
  };

  const signalSummary = useMemo(
    () =>
      [
        signals.deviceMemoryGb ? `detectamos pelo menos ${signals.deviceMemoryGb} GB de RAM` : "RAM aproximada não exposta",
        signals.cores ? `${signals.cores} núcleos lógicos reportados` : "núcleos não expostos",
        signals.freeStorageGb != null ? `${signals.freeStorageGb.toFixed(1)} GB livres estimados` : "armazenamento não exposto",
      ].join(" · "),
    [signals]
  );

  return (
    <div className="min-h-screen bg-[var(--base)] text-[var(--text-primary)] pb-20">
      <Header />
      <main className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-8">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--selo)]">
              CATÁLOGO · RECOMENDAÇÃO HONESTA {isApk ? "(APK NATIVO)" : ""}
            </span>
            {isApk && (
              <div>
                <input ref={fileInputRef} type="file" accept=".gguf" onChange={(e) => void handleFileImport(e)} className="hidden" />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl border border-[var(--selo)]/50 bg-[var(--selo)]/10 px-3 py-1.5 text-xs font-mono font-semibold text-[var(--selo)] hover:bg-[var(--selo)]/20 cursor-pointer"
                >
                  + Importar GGUF de Transferências
                </button>
              </div>
            )}
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Vitrine de modelos</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-[var(--text-muted)]">
            {isApk
              ? "Baixe modelos curados ou importe arquivos GGUF diretamente no armazenamento interno do app para usar no Chat off-device."
              : "Encontre modelos gratuitos e veja uma recomendação aproximada para este navegador. A vitrine lista e redireciona; execução local on-device está disponível no APK Plutão OS."}
          </p>
        </section>

        {installedModels.length > 0 && (
          <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-emerald-400 font-mono">
                Modelos locais instalados ({installedModels.length})
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {installedModels.map((m) => (
                <div key={m.id} className="flex items-center justify-between p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                  <div className="min-w-0 pr-2">
                    <span className="font-semibold text-xs text-[var(--text-primary)] block truncate">{m.name}</span>
                    <span className="text-[10px] font-mono text-[var(--text-muted)] block truncate">{formatSize(m.sizeBytes)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleUseInChat(m.id)}
                      className="px-2.5 py-1 rounded-lg bg-[var(--selo)] text-[var(--base)] text-xs font-semibold cursor-pointer"
                    >
                      Usar no chat
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteModel(m.id)}
                      className="text-xs text-rose-400 p-1 hover:underline cursor-pointer"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="model-search" className="sr-only">
            Buscar modelo por nome
          </label>
          <input
            id="model-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome exato ou repositório…"
            className="min-h-11 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm outline-none focus:border-[var(--selo)]"
          />
          <button type="submit" className="min-h-11 rounded-xl bg-[var(--selo)] px-5 text-sm font-semibold text-[var(--base)]">
            Buscar
          </button>
        </form>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 px-4 py-3 text-[11px] font-mono text-[var(--text-muted)]">
          <strong className="text-[var(--text-secondary)]">Sinais atuais:</strong> {signalSummary}.
        </div>

        {notice && <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-xs text-amber-200">{notice}</div>}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--text-muted)]">
            {submittedQuery ? `Resultados para “${submittedQuery}”` : "Curadoria inicial do Plutão"}
          </p>
          {loading && <span className="text-xs text-[var(--text-muted)]">Consultando…</span>}
        </div>

        {!loading && models.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">
            Nenhum modelo encontrado. Tente o nome do repositório.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {models.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              signals={signals}
              installedModels={installedModels}
              downloadingProgress={downloadingProgress}
              isApk={isApk}
              onDownload={(m) => void handleStartDownload(m)}
              onCancel={(id) => void handleCancelDownload(id)}
              onDelete={(id) => void handleDeleteModel(id)}
              onUseInChat={handleUseInChat}
            />
          ))}
        </div>

        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
          Licenças e links pertencem aos autores dos modelos. “Verificado” é uma curadoria futura do Plutão. Baixar ou importar um GGUF grava o arquivo no armazenamento seguro do app para inferência on-device no APK.
        </p>
      </main>
      <MobileNav />
    </div>
  );
}
