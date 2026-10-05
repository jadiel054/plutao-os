"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { MobileNav } from "@/components/MobileNav";
import { filterCuratedModels } from "@/lib/models/curatedCatalog";

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
  if (signals.deviceMemoryGb >= requiredRam && (!requiredStorage || signals.freeStorageGb == null || signals.freeStorageGb >= requiredStorage) && size <= 2_500_000_000) return { band: "green", reason: `${memoryText}; ainda é uma estimativa, não um teste real de inferência.` };
  if (signals.deviceMemoryGb >= Math.max(2, requiredRam / 2)) return { band: "yellow", reason: `${memoryText}${storageText}; o arquivo pode competir com outros apps.` };
  return { band: "red", reason: `${memoryText}; este modelo pede aproximadamente ${requiredRam} GB de memória livre para tentar carregar e o arquivo tem ${formatSize(size)}.` };
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

function ModelCard({ model, signals }: { model: ModelItem; signals: DeviceSignals }) {
  const [expanded, setExpanded] = useState(false);
  const [riskState, setRiskState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const estimate = estimateBand(model, signals);
  const copy = bandCopy(estimate.band);
  const openDownload = () => {
    const url = model.downloadUrl || model.sourceUrl;
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const acceptRisk = async () => {
    setRiskState("saving");
    try {
      const response = await fetch("/api/models/risk-acceptance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model_ref: model.id, reason_shown: estimate.reason }) });
      if (!response.ok) throw new Error("risk");
      setRiskState("saved");
      openDownload();
    } catch {
      setRiskState("error");
    }
  };
  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col gap-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] truncate">{model.author}{model.curated ? " · curadoria Plutão" : " · resultado HF"}</p>
          <h2 className="mt-1 text-base font-bold text-[var(--text-primary)] break-words">{model.name}</h2>
          <p className="mt-1 text-[11px] font-mono text-[var(--text-muted)] break-all">{model.id}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${copy.className}`}>{copy.label}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--base)] p-2"><span className="block text-[9px] text-[var(--text-muted)]">TAMANHO APROX.</span><span>{formatSize(model.approxSizeBytes)}</span></div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--base)] p-2"><span className="block text-[9px] text-[var(--text-muted)]">LICENÇA</span><span className="truncate block">{model.license || "não informada"}</span></div>
      </div>
      <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{estimate.reason}</p>
      {!model.curated && <p className="text-[10px] text-[var(--text-muted)]">Listagem pública do HF não é certificação. Confira licença e arquivos no card original.</p>}
      {estimate.band === "red" && expanded && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 space-y-3 text-xs text-rose-100">
          <p><strong>Por quê?</strong> {estimate.reason} A recomendação usa sinais aproximados deste navegador, não uma medição de inferência.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void acceptRisk()} disabled={riskState === "saving"} className="rounded-xl bg-rose-500 px-3 py-2 font-semibold text-white disabled:opacity-50">{riskState === "saving" ? "Registrando…" : "Vou correr o risco"}</button>
            <button type="button" onClick={() => setExpanded(false)} className="rounded-xl border border-[var(--border)] px-3 py-2">Escolher outro modelo</button>
          </div>
          {riskState === "error" && <p className="text-amber-300">Não foi possível registrar. Faça login e confirme que a migration foi aplicada.</p>}
          {riskState === "saved" && <p className="text-emerald-300">Escolha registrada. O download foi aberto; executar o modelo ainda não está disponível no Plutão.</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {estimate.band === "red" ? <button type="button" onClick={() => setExpanded((value) => !value)} className="rounded-xl border border-rose-500/40 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/10">{expanded ? "Fechar explicação" : "Ver por quê e continuar"}</button> : estimate.band === "cloud" ? <a href={model.sourceUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-sky-500/40 px-3 py-2 text-xs font-semibold text-sky-300">Ver opção via nuvem</a> : model.downloadUrl ? <button type="button" onClick={openDownload} className="rounded-xl bg-[var(--selo)] px-3 py-2 text-xs font-semibold text-[var(--base)]">Baixar GGUF</button> : <a href={model.sourceUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold">Abrir no HF</a>}
        <a href={model.sourceUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-secondary)]">Ver origem</a>
      </div>
      {model.downloadUrl && estimate.band !== "red" && <p className="text-[10px] text-[var(--text-muted)]">Download de arquivo no HF; não é inferência nem certificação. Leia a licença antes de usar.</p>}
    </article>
  );
}

export default function ModelosPage() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [models, setModels] = useState<ModelItem[]>([]);
  const [signals, setSignals] = useState<DeviceSignals>({ deviceMemoryGb: null, cores: null, freeStorageGb: null });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
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
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void readSignals().then(setSignals); void search(""); }, [search]);
  function submit(event: FormEvent) { event.preventDefault(); const value = query.trim(); setSubmittedQuery(value); void search(value); }
  const signalSummary = useMemo(() => [signals.deviceMemoryGb ? `detectamos pelo menos ${signals.deviceMemoryGb} GB de RAM` : "RAM aproximada não exposta", signals.cores ? `${signals.cores} núcleos lógicos reportados` : "núcleos não expostos", signals.freeStorageGb != null ? `${signals.freeStorageGb.toFixed(1)} GB livres estimados` : "armazenamento não exposto"].join(" · "), [signals]);
  return (
    <div className="min-h-screen bg-[var(--base)] text-[var(--text-primary)] pb-20">
      <Header />
      <main className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-8">
        <section className="space-y-3"><span className="text-[10px] font-mono uppercase tracking-[0.22em] text-[var(--selo)]">CATÁLOGO · RECOMENDAÇÃO HONESTA</span><h1 className="text-3xl font-black tracking-tight sm:text-4xl">Vitrine de modelos</h1><p className="max-w-3xl text-sm leading-relaxed text-[var(--text-muted)]">Encontre modelos gratuitos e veja uma recomendação aproximada para este navegador. A vitrine lista; não testa, não certifica e não executa inferência.</p></section>
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row"><label htmlFor="model-search" className="sr-only">Buscar modelo por nome</label><input id="model-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome exato ou repositório…" className="min-h-11 flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm outline-none focus:border-[var(--selo)]" /><button type="submit" className="min-h-11 rounded-xl bg-[var(--selo)] px-5 text-sm font-semibold text-[var(--base)]">Buscar</button></form>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 px-4 py-3 text-[11px] font-mono text-[var(--text-muted)]"><strong className="text-[var(--text-secondary)]">Sinais atuais:</strong> {signalSummary}. São limites aproximados; a exatidão fica no app nativo quando existir.</div>
        {notice && <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-3 text-xs text-amber-200">{notice}</div>}
        <div className="flex items-center justify-between gap-3"><p className="text-xs text-[var(--text-muted)]">{submittedQuery ? `Resultados para “${submittedQuery}”` : "Curadoria inicial do Plutão"}</p>{loading && <span className="text-xs text-[var(--text-muted)]">Consultando…</span>}</div>
        {!loading && models.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">Nenhum modelo encontrado. Tente o nome do repositório.</div>}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{models.map((model) => <ModelCard key={model.id} model={model} signals={signals} />)}</div>
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">Licenças e links pertencem aos autores dos modelos. “Verificado” é uma curadoria futura do Plutão — HF não testa nem certifica os modelos listados. Baixar um GGUF é apenas baixar um arquivo; o motor nativo ainda não existe neste produto.</p>
      </main>
      <MobileNav />
    </div>
  );
}
