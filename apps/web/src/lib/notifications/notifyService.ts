import { playNotificationSound } from "./soundPlayer";
import { triggerCategoryNotification } from "./capacitorNotifications";
import { Capacitor } from "@capacitor/core";

export type NotificationCategory = "missions" | "tasks" | "alerts";

export type DispatchNotificationOptions = {
  category: NotificationCategory;
  title: string;
  body: string;
  soundId?: string;
  data?: Record<string, unknown>;
};

type LocalNotificationPrefs = {
  notifyMissions: boolean;
  notifyTasks: boolean;
  notifyAlerts: boolean;
  notifySounds: boolean;
  soundGlobal: string;
  soundMissions: string;
  soundTasks: string;
  soundAlerts: string;
};

const DEFAULT_PREFS: LocalNotificationPrefs = {
  notifyMissions: true,
  notifyTasks: true,
  notifyAlerts: true,
  notifySounds: true,
  soundGlobal: "plutao_chime",
  soundMissions: "mission_complete",
  soundTasks: "task_nudge",
  soundAlerts: "alert_critical",
};

export function getLocalNotificationPrefs(): LocalNotificationPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem("plutao_pref_notifications");
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return {
      notifyMissions: parsed.notifyMissions ?? DEFAULT_PREFS.notifyMissions,
      notifyTasks: parsed.notifyTasks ?? DEFAULT_PREFS.notifyTasks,
      notifyAlerts: parsed.notifyAlerts ?? DEFAULT_PREFS.notifyAlerts,
      notifySounds: parsed.notifySounds ?? DEFAULT_PREFS.notifySounds,
      soundGlobal: parsed.soundGlobal || DEFAULT_PREFS.soundGlobal,
      soundMissions: parsed.soundMissions || parsed.soundGlobal || DEFAULT_PREFS.soundMissions,
      soundTasks: parsed.soundTasks || parsed.soundGlobal || DEFAULT_PREFS.soundTasks,
      soundAlerts: parsed.soundAlerts || parsed.soundGlobal || DEFAULT_PREFS.soundAlerts,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function dispatchAppNotification(options: DispatchNotificationOptions): Promise<void> {
  const prefs = getLocalNotificationPrefs();

  // Verificar se a categoria está ativada nas preferências
  if (options.category === "missions" && !prefs.notifyMissions) return;
  if (options.category === "tasks" && !prefs.notifyTasks) return;
  if (options.category === "alerts" && !prefs.notifyAlerts) return;

  // Determinar toque escolhido para a categoria
  let tone = options.soundId;
  if (!tone) {
    if (options.category === "missions") tone = prefs.soundMissions;
    else if (options.category === "tasks") tone = prefs.soundTasks;
    else if (options.category === "alerts") tone = prefs.soundAlerts;
    else tone = prefs.soundGlobal;
  }

  // Se em ambiente nativo Capacitor (Android APK)
  if (Capacitor.isNativePlatform()) {
    await triggerCategoryNotification({
      category: options.category,
      title: options.title,
      body: options.body,
      soundId: tone,
      extra: options.data,
    });
    return;
  }

  // Ambiente Web / PWA em 1º plano
  if (prefs.notifySounds && tone) {
    void playNotificationSound(tone);
  }

  // Tentar notificação padrão do navegador se permissão concedida
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(options.title, {
        body: options.body,
        icon: "/icons/icon_192.png",
        data: options.data,
      });
    } catch (err) {
      console.warn("[notifyService] Falha ao disparar Web Notification:", err);
    }
  }
}
