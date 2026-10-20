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
      notifyMissions: typeof parsed.notifyMissions === "boolean" ? parsed.notifyMissions : DEFAULT_PREFS.notifyMissions,
      notifyTasks: typeof parsed.notifyTasks === "boolean" ? parsed.notifyTasks : DEFAULT_PREFS.notifyTasks,
      notifyAlerts: typeof parsed.notifyAlerts === "boolean" ? parsed.notifyAlerts : DEFAULT_PREFS.notifyAlerts,
      notifySounds: typeof parsed.notifySounds === "boolean" ? parsed.notifySounds : DEFAULT_PREFS.notifySounds,
      soundGlobal: parsed.soundGlobal || DEFAULT_PREFS.soundGlobal,
      soundMissions: parsed.soundMissions || parsed.soundGlobal || DEFAULT_PREFS.soundMissions,
      soundTasks: parsed.soundTasks || parsed.soundGlobal || DEFAULT_PREFS.soundTasks,
      soundAlerts: parsed.soundAlerts || parsed.soundGlobal || DEFAULT_PREFS.soundAlerts,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

const recentNotificationsCache = new Map<string, number>();
const DEDUPE_WINDOW_MS = 30_000;

export function clearNotificationDedupeCache(): void {
  recentNotificationsCache.clear();
}

function isDuplicateNotification(options: DispatchNotificationOptions): boolean {
  const entityId =
    (options.data?.missionId as string) ||
    (options.data?.conversationId as string) ||
    (options.data?.gateId as string) ||
    (options.data?.status as string) ||
    "";
  const key = `${options.category}:${entityId}:${options.title}:${options.body}`;
  const now = Date.now();
  const lastTime = recentNotificationsCache.get(key);

  if (lastTime && now - lastTime < DEDUPE_WINDOW_MS) {
    return true;
  }

  recentNotificationsCache.set(key, now);

  // Clean stale keys periodically
  if (recentNotificationsCache.size > 100) {
    for (const [k, t] of recentNotificationsCache.entries()) {
      if (now - t >= DEDUPE_WINDOW_MS) {
        recentNotificationsCache.delete(k);
      }
    }
  }

  return false;
}

export async function dispatchAppNotification(options: DispatchNotificationOptions): Promise<void> {
  const prefs = getLocalNotificationPrefs();

  // Verificar se a categoria está ativada nas preferências
  if (options.category === "missions" && !prefs.notifyMissions) return;
  if (options.category === "tasks" && !prefs.notifyTasks) return;
  if (options.category === "alerts" && !prefs.notifyAlerts) return;

  // Deduplicação em janela curta (~30s)
  if (isDuplicateNotification(options)) {
    return;
  }

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
