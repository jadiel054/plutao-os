"use client";

import { useState, useEffect } from "react";
import { SOUND_LIBRARY, playSoundSample, stopSoundSample } from "@/lib/notifications/soundPlayer";
import { ensureNotificationPermissionWithStatus } from "@/lib/notifications/capacitorNotifications";
import { Capacitor } from "@capacitor/core";

type Props = {
  notifyMissions: boolean;
  notifyTasks: boolean;
  notifyAlerts: boolean;
  notifySounds: boolean;
  soundGlobal: string;
  soundMissions: string;
  soundTasks: string;
  soundAlerts: string;
  setNotifyMissions: (v: boolean) => void;
  setNotifyTasks: (v: boolean) => void;
  setNotifyAlerts: (v: boolean) => void;
  setNotifySounds: (v: boolean) => void;
  setSoundGlobal: (v: string) => void;
  setSoundMissions: (v: string) => void;
  setSoundTasks: (v: string) => void;
  setSoundAlerts: (v: string) => void;
};

function Row({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-[var(--border)]/60 last:border-0">
      <div className="min-w-0">
        <h3 className="text-sm font-medium">{label}</h3>
        <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{description}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 mt-1 accent-[var(--selo)] cursor-pointer shrink-0"
      />
    </div>
  );
}

export function SettingsNotificationsSection({
  notifyMissions,
  notifyTasks,
  notifyAlerts,
  notifySounds,
  soundGlobal,
  soundMissions,
  soundTasks,
  soundAlerts,
  setNotifyMissions,
  setNotifyTasks,
  setNotifyAlerts,
  setNotifySounds,
  setSoundGlobal,
  setSoundMissions,
  setSoundTasks,
  setSoundAlerts,
}: Props) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<"granted" | "denied" | "prompt">("granted");

  useEffect(() => {
    if (typeof window !== "undefined") {
      void ensureNotificationPermissionWithStatus().then((status) => {
        setPermissionStatus(status);
      });
    }
  }, []);

  const triggerPermissionCheck = async () => {
    const status = await ensureNotificationPermissionWithStatus();
    setPermissionStatus(status);
  };

  const handleTogglePlay = (soundId: string) => {
    if (playingId === soundId) {
      stopSoundSample();
      setPlayingId(null);
    } else {
      setPlayingId(soundId);
      void playSoundSample(soundId).then(() => {
        setPlayingId((prev) => (prev === soundId ? null : prev));
      });
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-6 animate-in fade-in duration-200">
      <div className="pb-3 border-b border-[var(--border)]">
        <h2 className="text-base font-semibold">Notificações por Categoria</h2>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Ajuste as categorias ativas, preferências globais e toques dedicados
        </p>
      </div>

      {permissionStatus === "denied" && (
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <span className="font-semibold block mb-0.5 text-amber-300">
              Notificações bloqueadas pelo sistema
            </span>
            {Capacitor.isNativePlatform() ? (
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                As permissões do Android para o Plutão OS estão desativadas. Para receber alertas com sons de missão e tarefas, acesse as <strong className="font-medium text-amber-200">Configurações do dispositivo &gt; Aplicativos &gt; Plutão &gt; Notificações</strong> e ative a permissão.
              </p>
            ) : (
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                As notificações do navegador estão bloqueadas. Para receber avisos em tempo real, permita as notificações nas configurações de permissões do site na barra de endereço.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Row
          label="Missões"
          description="Atualizações de progresso, verificações e conclusão de missões"
          checked={notifyMissions}
          onChange={(v) => {
            void triggerPermissionCheck();
            setNotifyMissions(v);
          }}
        />
        <Row
          label="Tarefas"
          description="Lembretes, atualizações e mudanças de status de tarefas"
          checked={notifyTasks}
          onChange={(v) => {
            void triggerPermissionCheck();
            setNotifyTasks(v);
          }}
        />
        <Row
          label="Alertas Críticos"
          description="Avisos de segurança, falhas de execução e gatilhos de aprovação"
          checked={notifyAlerts}
          onChange={(v) => {
            void triggerPermissionCheck();
            setNotifyAlerts(v);
          }}
        />
        <Row
          label="Feedback Sonoro"
          description="Tocar áudio ao receber notificações em 1º plano (Web/PWA) e via canais nativos no APK"
          checked={notifySounds}
          onChange={(v) => {
            void triggerPermissionCheck();
            setNotifySounds(v);
          }}
        />
      </div>

      {notifySounds && (
        <div className="pt-4 border-t border-[var(--border)] space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Toques por Categoria</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Escolha um som exclusivo para cada categoria ou utilize o padrão global. No APK Android, alterar o toque recria o canal nativo correspondente.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--base)]/40 space-y-2">
              <label className="text-xs font-medium text-[var(--text-primary)] block">Toque das Missões</label>
              <select
                value={soundMissions || soundGlobal}
                onChange={(e) => {
                  void triggerPermissionCheck();
                  setSoundMissions(e.target.value);
                }}
                className="w-full bg-[var(--surface)] text-xs border border-[var(--border)] rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-[var(--selo)]"
              >
                {SOUND_LIBRARY.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--base)]/40 space-y-2">
              <label className="text-xs font-medium text-[var(--text-primary)] block">Toque das Tarefas</label>
              <select
                value={soundTasks || soundGlobal}
                onChange={(e) => {
                  void triggerPermissionCheck();
                  setSoundTasks(e.target.value);
                }}
                className="w-full bg-[var(--surface)] text-xs border border-[var(--border)] rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-[var(--selo)]"
              >
                {SOUND_LIBRARY.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 rounded-xl border border-[var(--border)] bg-[var(--base)]/40 space-y-2">
              <label className="text-xs font-medium text-[var(--text-primary)] block">Toque dos Alertas</label>
              <select
                value={soundAlerts || soundGlobal}
                onChange={(e) => {
                  void triggerPermissionCheck();
                  setSoundAlerts(e.target.value);
                }}
                className="w-full bg-[var(--surface)] text-xs border border-[var(--border)] rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-[var(--selo)]"
              >
                {SOUND_LIBRARY.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Biblioteca de Sons Autorais (CC0)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SOUND_LIBRARY.map((sound) => {
                const isSelected =
                  soundMissions === sound.id ||
                  soundTasks === sound.id ||
                  soundAlerts === sound.id ||
                  soundGlobal === sound.id;
                const isPlaying = playingId === sound.id;

                return (
                  <div
                    key={sound.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      isSelected
                        ? "border-[var(--selo)] bg-[var(--selo)]/10"
                        : "border-[var(--border)] bg-[var(--base)]/30 hover:border-[var(--border)]/80"
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-[var(--text-primary)]">{sound.label}</span>
                        {isSelected && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--selo)] text-[var(--base)] font-bold">
                            Ativo
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">{sound.description}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleTogglePlay(sound.id)}
                      className="p-2 rounded-lg bg-[var(--surface)] hover:bg-[var(--border)]/40 text-[var(--text-primary)] transition-all shrink-0 cursor-pointer"
                      title={isPlaying ? "Parar amostra" : "Ouvir amostra"}
                    >
                      {isPlaying ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="6" width="12" height="12" rx="2" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
