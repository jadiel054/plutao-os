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
  invalidateVoicePrefsCache,
  SAMPLE_PHRASE,
  SAMPLE_PHRASE_PT,
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
  const [packStatuses, setPackStatuses] = useState<Record<string, PackStatus>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [detail, setDetail] = useState<Record<string, string>>({});
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
      const next: VoiceRuntimePrefs = {
        enabled: Boolean(v.enabled),
        packId: typeof v.packId === "string" ? v.packId : DEFAULT_PACK_ID,
        voiceId: typeof v.voiceId === "string" ? v.voiceId : DEFAULT_VOICE_ID,
        speed: typeof v.speed === "number" ? v.speed : 1,
        volume: typeof v.volume === "number" ? v.volume : 0.9,
      };
      setPrefs(next);

      const statuses: Record<string, PackStatus> = {};
      for (const p of VOICE_PACKS) {
        statuses[p.id] = isPackMarkedReady(p.id) ? "ready" : "idle";
      }
      setPackStatuses(statuses);
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
      invalidateVoicePrefsCache();
      setPrefs(next);
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload(packId: VoicePackId) {
    setPackStatuses((s) => ({ ...s, [packId]: "downloading" }));
    setProgress((p) => ({ ...p, [packId]: 0 }));
    try {
      await downloadPack(packId, (pct, status, d) => {
        setProgress((p) => ({ ...p, [packId]: pct }));
        setPackStatuses((s) => ({ ...s, [packId]: status }));
        if (d) setDetail((x) => ({ ...x, [packId]: d }));
      });
      setPackStatuses((s) => ({ ...s, [packId]: "ready" }));
      onNotify?.(`Pack ${packId} pronto neste dispositivo`, "success");
    } catch {
      setPackStatuses((s) => ({ ...s, [packId]: "error" }));
      onNotify?.("Falha ao baixar o modelo. Verifique a rede e tente de novo.", "error");
    }
  }

  function handleRemove(packId: string) {
    clearPackReady(packId);
    setPackStatuses((s) => ({ ...s, [packId]: "idle" }));
    setProgress((p) => ({ ...p, [packId]: 0 }));
    onNotify?.("Pack removido deste dispositivo (cache local)", "info");
  }

  async function handleSample() {
    setSampleBusy(true);
    try {
      const pack = getPack(prefs.packId);
      const phrase =
        pack?.engine === "piper" ||
        pack?.engine === "supertonic" ||
        pack?.id === "piper-pt-br" ||
        pack?.id === "supertonic-pt-br"
          ? SAMPLE_PHRASE_PT
          : SAMPLE_PHRASE;
      // prefs do state local (já otimista após troca no seletor) — sem cache 60s
      const result = await speakText(phrase, prefs, {
        onProgress: (pct, status, d) => {
          const id = prefs.packId;
          setProgress((p) => ({ ...p, [id]: pct }));
          setPackStatuses((s) => ({ ...s, [id]: status }));
          if (d) setDetail((x) => ({ ...x, [id]: d }));
        },
      });
      if (result.engine === "native" && prefs.enabled) {
        onNotify?.("Usando voz nativa do sistema enquanto o pack não está pronto", "info");
      }
    } finally {
      setSampleBusy(false);
    }
  }

  function selectPack(packId: VoicePackId) {
    const pack = getPack(packId);
    if (!pack) return;
    const voiceId = pack.voices[0]?.id ?? DEFAULT_VOICE_ID;
    const next = { ...prefs, packId, voiceId };
    setPrefs(next);
    void persist(next);
  }

  const activePack = getPack(prefs.packId) ?? VOICE_PACKS[0];

  /** BUG-05: só vozes de packs prontos, ou do pack ativo. */
  const selectableVoices = VOICE_PACKS.filter(
    (p) => (packStatuses[p.id] ?? "idle") === "ready" || p.id === prefs.packId
  ).flatMap((p) =>
    p.voices.map((v) => ({
      id: v.id,
      label: `${v.name} (${v.language} · ${v.gender}${v.grade ? ` · ${v.grade}` : ""}) — ${p.name}`,
    }))
  );

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
          Síntese on-device. O texto não sai do navegador. Kokoro (EN); Supertonic 3 (pt-BR, 10 vozes);
          Piper (pt-BR leve, 1 voz). Packs grandes exigem Wi-Fi.
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
          onChange={(e) => {
            const next = { ...prefs, enabled: e.target.checked };
            setPrefs(next);
            void persist(next);
          }}
          className="h-4 w-4 accent-[var(--selo)]"
        />
      </label>

      <div className="space-y-3">
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Packs</div>
        {VOICE_PACKS.map((pack) => {
          const st = packStatuses[pack.id] ?? "idle";
          const pct = progress[pack.id] ?? 0;
          const statusLabel =
            st === "ready"
              ? "Pronto"
              : st === "downloading"
                ? `Baixando… ${pct}%`
                : st === "error"
                  ? "Erro"
                  : "Não baixado";
          const selected = prefs.packId === pack.id;

          return (
            <section
              key={pack.id}
              className={`rounded-xl border p-4 space-y-3 ${
                selected
                  ? "border-[var(--selo)]/60 bg-[var(--surface)]"
                  : "border-[var(--border)] bg-[var(--surface)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  className="text-left flex-1"
                  onClick={() => selectPack(pack.id)}
                >
                  <div className="text-sm font-medium text-[var(--text-primary)]">
                    {pack.name}
                    {selected ? (
                      <span className="ml-2 text-[10px] text-[var(--selo)] font-mono">ativo</span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-1">{pack.description}</div>
                  <div className="text-[10px] font-mono text-[var(--text-muted)] mt-2">
                    ~{pack.approxSizeMb} MB · {pack.languages.join(", ")} · {statusLabel}
                  </div>
                  {detail[pack.id] && st === "downloading" ? (
                    <div className="text-[10px] text-[var(--text-secondary)] mt-1">{detail[pack.id]}</div>
                  ) : null}
                </button>
              </div>
              {st === "downloading" ? (
                <div className="h-1.5 rounded-full bg-[var(--base)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--selo)] transition-all duration-200"
                    style={{ width: `${Math.max(4, pct)}%` }}
                  />
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={st === "downloading" || st === "ready"}
                  onClick={() => void handleDownload(pack.id)}
                  className="rounded-lg bg-[var(--selo)] text-[var(--base)] text-xs font-semibold px-3 py-2 disabled:opacity-40"
                >
                  {st === "ready" ? "Já baixado" : "Baixar pack"}
                </button>
                <button
                  type="button"
                  disabled={st !== "ready"}
                  onClick={() => handleRemove(pack.id)}
                  className="rounded-lg border border-[var(--border)] text-xs px-3 py-2 text-[var(--text-secondary)] disabled:opacity-40"
                >
                  Remover
                </button>
                {!selected ? (
                  <button
                    type="button"
                    onClick={() => selectPack(pack.id)}
                    className="rounded-lg border border-[var(--border)] text-xs px-3 py-2 text-[var(--text-secondary)]"
                  >
                    Usar este pack
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <label className="block space-y-1.5">
        <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Voz</span>
        <select
          value={prefs.voiceId}
          disabled={saving}
          onChange={(e) => {
            const next = { ...prefs, voiceId: e.target.value };
            setPrefs(next); // otimista — amostra usa voiceId novo imediato (BUG-06)
            void persist(next);
          }}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2.5 text-sm text-[var(--text-primary)]"
        >
          {selectableVoices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-[var(--text-muted)]">
          Só listamos vozes de packs baixados (ou do pack ativo).
        </p>
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
        {activePack.engine === "piper" ? (
          <p className="text-[10px] text-[var(--text-muted)]">
            Velocidade plena no Kokoro/Supertonic/nativo; no Piper o controle é limitado pelo runtime
            WASM.
          </p>
        ) : null}
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
