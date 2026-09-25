"use client";

import { useCallback, useEffect, useState } from "react";
import {
  VOICE_PACKS,
  DEFAULT_PACK_ID,
  DEFAULT_VOICE_ID,
  getPack,
  type VoicePackId,
} from "@/lib/voice/packs";
import {
  defaultVoicePrefs,
  downloadPack,
  isPackMarkedReady,
  clearPackReady,
  speakText,
  stopSpeaking,
  SAMPLE_PHRASE,
  type VoiceRuntimePrefs,
  type PackStatus,
} from "@/lib/voice/engine";

type Props = {
  onNotify?: (message: string, type: "success" | "info" | "warning" | "error") => void;
};

export function SettingsVoiceSection({ onNotify }: Props) {
  const [prefs, setPrefs] = useState<VoiceRuntimePrefs>(defaultVoicePrefs());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [packStatus, setPackStatus] = useState<PackStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [detail, setDetail] = useState<string | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/user/preferences", { cache: "no-store" });
      if (res.status === 401) {
        onNotify?.("Faça login para salvar preferências de voz", "warning");
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      const v = data.preferences?.voice ?? {};
      setPrefs({
        enabled: Boolean(v.enabled),
        packId: typeof v.packId === "string" ? v.packId : DEFAULT_PACK_ID,
        voiceId: typeof v.voiceId === "string" ? v.voiceId : DEFAULT_VOICE_ID,
        speed: typeof v.speed === "number" ? v.speed : 1,
        volume: typeof v.volume === "number" ? v.volume : 0.9,
      });
      if (isPackMarkedReady(v.packId || DEFAULT_PACK_ID)) {
        setPackStatus("ready");
      }
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void load();
  }, [load]);

  async function persist(next: VoiceRuntimePrefs) {
    setSaving(true);
    try {
      const res = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice: next }),
      });
      if (!res.ok) {
        onNotify?.("Não foi possível salvar preferências de voz", "error");
        return;
      }
      setPrefs(next);
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    const packId = (prefs.packId || DEFAULT_PACK_ID) as VoicePackId;
    setPackStatus("downloading");
    setProgress(0);
    try {
      await downloadPack(packId, (pct, status, d) => {
        setProgress(pct);
        setPackStatus(status);
        if (d) setDetail(d);
      });
      setPackStatus("ready");
      onNotify?.("Pack de voz pronto neste dispositivo", "success");
    } catch {
      setPackStatus("error");
      onNotify?.("Falha ao baixar o modelo. Verifique a rede e tente de novo.", "error");
    }
  }

  function handleRemove() {
    clearPackReady(prefs.packId || DEFAULT_PACK_ID);
    setPackStatus("idle");
    setProgress(0);
    setDetail(null);
    onNotify?.("Pack removido deste dispositivo (cache local)", "info");
  }

  async function handleSample() {
    setSampleBusy(true);
    try {
      const result = await speakText(SAMPLE_PHRASE, prefs, {
        onProgress: (pct, status, d) => {
          setProgress(pct);
          setPackStatus(status);
          if (d) setDetail(d);
        },
      });
      if (result.engine === "native" && prefs.enabled) {
        onNotify?.("Usando voz nativa do sistema enquanto o pack não está pronto", "info");
      }
    } finally {
      setSampleBusy(false);
    }
  }

  const pack = getPack(prefs.packId) ?? VOICE_PACKS[0];
  const statusLabel =
    packStatus === "ready"
      ? "Pronto"
      : packStatus === "downloading"
        ? `Baixando… ${progress}%`
        : packStatus === "error"
          ? "Erro"
          : "Não baixado";

  if (loading) {
    return (
      <div className="text-sm text-[var(--text-muted)] font-mono py-6">Carregando voz…</div>
    );
  }

  return (
    <div className="space-y-8 max-w-xl">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">Voz</h2>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Síntese on-device com Kokoro (WASM/WebGPU). O texto da conversa não é enviado a servidores de TTS.
          Português (pt-BR) usa a voz nativa do navegador — o kokoro-js oficial não inclui pack pt-BR.
        </p>
      </div>

      <label className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div>
          <div className="text-sm text-[var(--text-primary)]">Usar voz do Plutão (on-device)</div>
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
            Desligado: sempre speechSynthesis do sistema
          </div>
        </div>
        <input
          type="checkbox"
          checked={prefs.enabled}
          disabled={saving}
          onChange={(e) => void persist({ ...prefs, enabled: e.target.checked })}
          className="h-4 w-4 accent-[var(--selo)]"
        />
      </label>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-[var(--text-primary)]">{pack.name}</div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1">{pack.description}</div>
            <div className="text-[10px] font-mono text-[var(--text-muted)] mt-2">
              ~{pack.approxSizeMb} MB · {pack.languages.join(", ")} · {statusLabel}
            </div>
            {detail && packStatus === "downloading" ? (
              <div className="text-[10px] text-[var(--text-secondary)] mt-1">{detail}</div>
            ) : null}
          </div>
        </div>
        {packStatus === "downloading" ? (
          <div className="h-1.5 rounded-full bg-[var(--base)] overflow-hidden">
            <div
              className="h-full bg-[var(--selo)] transition-all duration-200"
              style={{ width: `${Math.max(4, progress)}%` }}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={packStatus === "downloading" || packStatus === "ready"}
            onClick={() => void handleDownload()}
            className="rounded-lg bg-[var(--selo)] text-[var(--base)] text-xs font-semibold px-3 py-2 disabled:opacity-40"
          >
            {packStatus === "ready" ? "Já baixado" : "Baixar pack"}
          </button>
          <button
            type="button"
            disabled={packStatus !== "ready"}
            onClick={handleRemove}
            className="rounded-lg border border-[var(--border)] text-xs px-3 py-2 text-[var(--text-secondary)] disabled:opacity-40"
          >
            Remover deste dispositivo
          </button>
        </div>
      </section>

      <label className="block space-y-1.5">
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Voz</span>
        <select
          value={prefs.voiceId}
          disabled={saving}
          onChange={(e) => void persist({ ...prefs, voiceId: e.target.value })}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2.5 text-sm text-[var(--text-primary)]"
        >
          {pack.voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({v.language} · {v.gender}
              {v.grade ? ` · ${v.grade}` : ""})
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-2">
        <div className="flex justify-between text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          <span>Velocidade</span>
          <span className="font-mono normal-case">{prefs.speed.toFixed(1)}x</span>
        </div>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.1}
          value={prefs.speed}
          onChange={(e) => setPrefs((p) => ({ ...p, speed: Number(e.target.value) }))}
          onMouseUp={() => void persist(prefs)}
          onTouchEnd={() => void persist(prefs)}
          className="w-full accent-[var(--selo)]"
        />
      </label>

      <label className="block space-y-2">
        <div className="flex justify-between text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          <span>Volume</span>
          <span className="font-mono normal-case">{Math.round(prefs.volume * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={prefs.volume}
          onChange={(e) => setPrefs((p) => ({ ...p, volume: Number(e.target.value) }))}
          onMouseUp={() => void persist(prefs)}
          onTouchEnd={() => void persist(prefs)}
          className="w-full accent-[var(--selo)]"
        />
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={sampleBusy}
          onClick={() => void handleSample()}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-medium px-4 py-2.5 hover:bg-[var(--surface-hover)] disabled:opacity-50"
        >
          {sampleBusy ? "Reproduzindo…" : "Ouvir amostra"}
        </button>
        <button
          type="button"
          onClick={() => stopSpeaking()}
          className="rounded-xl border border-[var(--border)] text-xs px-4 py-2.5 text-[var(--text-muted)]"
        >
          Parar
        </button>
      </div>
    </div>
  );
}
