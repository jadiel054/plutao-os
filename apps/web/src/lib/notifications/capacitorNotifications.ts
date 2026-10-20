import { LocalNotifications, Channel } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";

export type NotificationCategory = "missions" | "tasks" | "alerts";

export interface ChannelConfig {
  id: string;
  name: string;
  description: string;
  sound: string; // Ex: "plutao_chime" (refere-se a res/raw/plutao_chime)
}

/**
 * Mapeamento dos IDs de canais padrão para o sistema Android.
 */
export const CATEGORY_CHANNELS: Record<NotificationCategory, { name: string; description: string; defaultSound: string }> = {
  missions: {
    name: "Missões",
    description: "Notificações de progresso e conclusão de missões",
    defaultSound: "plutao_chime",
  },
  tasks: {
    name: "Tarefas",
    description: "Lembretes e mudanças de status de tarefas",
    defaultSound: "task_nudge",
  },
  alerts: {
    name: "Alertas Críticos",
    description: "Alertas críticos, falhas e aprovações de segurança",
    defaultSound: "alert_critical",
  },
};

/**
 * Android Notification Channel Manager
 *
 * NOTA TÉCNICA IMPORTANTE DO ANDROID:
 * O SO Android bloqueia a alteração de som e importância em um Notification Channel que já foi criado.
 * Para atualizar o toque de uma categoria no Android, é OBRIGATÓRIO deletar o canal existente
 * com `LocalNotifications.deleteChannel()` e recriá-lo com as novas configurações e o novo arquivo de áudio.
 */
export async function setupCategoryChannel(
  category: NotificationCategory,
  soundName?: string
): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    return `web_${category}`;
  }

  const channelInfo = CATEGORY_CHANNELS[category];
  const sound = soundName || channelInfo.defaultSound;
  const channelId = `plutao_channel_${category}`;

  try {
    // Tenta deletar o canal antigo se existir para permitir atualização do som escolhido
    await LocalNotifications.deleteChannel({ id: channelId }).catch(() => {
      /* ignora se não existir */
    });

    const channel: Channel = {
      id: channelId,
      name: channelInfo.name,
      description: channelInfo.description,
      sound: sound, // Sem extensão para res/raw/ no Android
      importance: category === "alerts" ? 5 : 4,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: "#6366F1",
    };

    await LocalNotifications.createChannel(channel);
    return channelId;
  } catch (error) {
    console.error(`[CapacitorNotifications] Erro ao configurar canal para ${category}:`, error);
    return channelId;
  }
}

/**
 * Garante que todos os canais de notificação por categoria estejam configurados no APK nativo.
 */
export async function syncNativeNotificationChannels(sounds: {
  missions?: string;
  tasks?: string;
  alerts?: string;
  soundGlobal?: string;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const missionSound = sounds.missions || sounds.soundGlobal || CATEGORY_CHANNELS.missions.defaultSound;
  const taskSound = sounds.tasks || sounds.soundGlobal || CATEGORY_CHANNELS.tasks.defaultSound;
  const alertSound = sounds.alerts || sounds.soundGlobal || CATEGORY_CHANNELS.alerts.defaultSound;

  await Promise.all([
    setupCategoryChannel("missions", missionSound),
    setupCategoryChannel("tasks", taskSound),
    setupCategoryChannel("alerts", alertSound),
  ]);
}

/**
 * Checa ou solicita permissão de notificação no Android 13+ apenas em contexto.
 * Retorna 'granted', 'denied' ou 'prompt'.
 */
export async function ensureNotificationPermissionWithStatus(): Promise<"granted" | "denied" | "prompt"> {
  if (!Capacitor.isNativePlatform()) {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") return "granted";
      if (Notification.permission === "denied") return "denied";
      return "prompt";
    }
    return "granted";
  }

  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === "granted") return "granted";
    if (status.display === "denied") return "denied";

    // Solicita apenas se estiver em estado 'prompt' ou 'prompt-with-rationale'
    const request = await LocalNotifications.requestPermissions();
    return request.display === "granted" ? "granted" : "denied";
  } catch (e) {
    console.error("[CapacitorNotifications] Erro ao checar/solicitar permissão:", e);
    return "denied";
  }
}

/**
 * Solicita permissões de notificação no Android/iOS se necessário.
 */
export async function requestNativeNotificationPermissions(): Promise<boolean> {
  const status = await ensureNotificationPermissionWithStatus();
  return status === "granted";
}

/**
 * Agenda/dispara uma notificação nativa para a categoria especificada.
 */
export async function scheduleNativeNotification(options: {
  id?: number;
  category: NotificationCategory;
  title: string;
  body: string;
  extra?: Record<string, unknown>;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const channelId = `plutao_channel_${options.category}`;
  const notificationId = options.id ?? Math.floor(Math.random() * 100000);

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notificationId,
          title: options.title,
          body: options.body,
          channelId: channelId,
          extra: options.extra ?? {},
          smallIcon: "ic_stat_icon_config_sample",
          iconColor: "#6366F1",
        },
      ],
    });
  } catch (error) {
    console.error(`[CapacitorNotifications] Erro ao agendar notificação em ${options.category}:`, error);
  }
}

/**
 * Dispara uma notificação para a categoria dada com canal e som garantidos no Android.
 */
export async function triggerCategoryNotification(options: {
  category: NotificationCategory;
  title: string;
  body: string;
  soundId?: string;
  extra?: Record<string, unknown>;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  if (options.soundId) {
    await setupCategoryChannel(options.category, options.soundId);
  }

  await scheduleNativeNotification({
    category: options.category,
    title: options.title,
    body: options.body,
    extra: options.extra,
  });
}
