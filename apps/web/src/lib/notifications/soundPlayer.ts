export type NotificationSound = {
  id: string;
  label: string;
  file: string;
  description: string;
};

export const SOUND_LIBRARY: NotificationSound[] = [
  {
    id: "plutao_chime",
    label: "Plutão Chime (Padrão)",
    file: "plutao_chime.ogg",
    description: "Acorde futurista duplo da órbita de Plutão OS (CC0)",
  },
  {
    id: "mission_complete",
    label: "Missão Concluída",
    file: "mission_complete.ogg",
    description: "Fanfara ressonante e triunfal de conclusão (CC0)",
  },
  {
    id: "task_nudge",
    label: "Lembrete de Tarefa",
    file: "task_nudge.ogg",
    description: "Toque duplo suave de alta frequência para tarefas (CC0)",
  },
  {
    id: "alert_critical",
    label: "Alerta Crítico",
    file: "alert_critical.ogg",
    description: "Pulso de urgência para falhas e portões pendentes (CC0)",
  },
  {
    id: "beacon_pulse",
    label: "Pulso de Farol",
    file: "beacon_pulse.ogg",
    description: "Eco harmônico estelar de baixa frequência (CC0)",
  },
  {
    id: "cyber_ping",
    label: "Cyber Ping",
    file: "cyber_ping.ogg",
    description: "Sinal digital rápido e límpido (CC0)",
  },
  {
    id: "orbit_tone",
    label: "Tom Orbital",
    file: "orbit_tone.ogg",
    description: "Onda senoidal envolvente e moderna (CC0)",
  },
  {
    id: "quantum_chime",
    label: "Quantum Chime",
    file: "quantum_chime.ogg",
    description: "Seqüência quântica ascendente de três notas (CC0)",
  },
  {
    id: "stellar_blip",
    label: "Blip Estelar",
    file: "stellar_blip.ogg",
    description: "Bip curto e limpo para avisos rápidos (CC0)",
  },
  {
    id: "nexus_bell",
    label: "Sino do Nexus",
    file: "nexus_bell.ogg",
    description: "Ressonância cristalina de longa sustentação (CC0)",
  },
];

let currentAudioInstance: HTMLAudioElement | null = null;

export async function playSoundSample(soundId: string): Promise<void> {
  stopSoundSample();

  if (typeof window === "undefined") return;

  const sound = SOUND_LIBRARY.find((s) => s.id === soundId) || SOUND_LIBRARY[0];
  const audioUrl = `/sounds/${sound.file}`;

  try {
    const audio = new Audio(audioUrl);
    audio.volume = 0.85;
    currentAudioInstance = audio;

    await audio.play();
    return new Promise((resolve) => {
      audio.onended = () => {
        if (currentAudioInstance === audio) {
          currentAudioInstance = null;
        }
        resolve();
      };
      audio.onerror = () => {
        if (currentAudioInstance === audio) {
          currentAudioInstance = null;
        }
        resolve();
      };
    });
  } catch (err) {
    console.warn("[soundPlayer] Falha ao reproduzir amostra de áudio:", err);
    currentAudioInstance = null;
  }
}

export function stopSoundSample(): void {
  if (currentAudioInstance) {
    try {
      currentAudioInstance.pause();
      currentAudioInstance.currentTime = 0;
    } catch {
      // Ignorar erros se o elemento já estiver desacoplado
    }
    currentAudioInstance = null;
  }
}

export async function playNotificationSound(soundId: string): Promise<void> {
  return playSoundSample(soundId);
}
