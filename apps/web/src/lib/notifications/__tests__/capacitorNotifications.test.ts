import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  setupCategoryChannel,
  syncNativeNotificationChannels,
  ensureNotificationPermissionWithStatus,
  requestNativeNotificationPermissions,
  CATEGORY_CHANNELS,
} from "../capacitorNotifications";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Capacitor } from "@capacitor/core";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    deleteChannel: vi.fn().mockResolvedValue(undefined),
    createChannel: vi.fn().mockResolvedValue(undefined),
    schedule: vi.fn().mockResolvedValue(undefined),
    checkPermissions: vi.fn().mockResolvedValue({ display: "granted" }),
    requestPermissions: vi.fn().mockResolvedValue({ display: "granted" }),
  },
}));

describe("Capacitor Native Notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna canal fake na Web se não for plataforma nativa", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const channelId = await setupCategoryChannel("missions", "plutao_chime");
    expect(channelId).toBe("web_missions");
    expect(LocalNotifications.createChannel).not.toHaveBeenCalled();
  });

  it("deleta canal antigo e cria novo canal no Android nativo ao trocar o som", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    const channelId = await setupCategoryChannel("missions", "plutao_galaxy");

    expect(channelId).toBe("plutao_channel_missions");
    expect(LocalNotifications.deleteChannel).toHaveBeenCalledWith({ id: "plutao_channel_missions" });
    expect(LocalNotifications.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "plutao_channel_missions",
        name: CATEGORY_CHANNELS.missions.name,
        sound: "plutao_galaxy",
      })
    );
  });

  it("sincroniza todos os canais por categoria com o som correto", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    await syncNativeNotificationChannels({
      missions: "plutao_chime",
      tasks: "plutao_pulse",
      alerts: "plutao_radar",
    });

    expect(LocalNotifications.deleteChannel).toHaveBeenCalledTimes(3);
    expect(LocalNotifications.createChannel).toHaveBeenCalledTimes(3);
  });

  it("retorna 'granted' diretamente quando a permissão já foi concedida", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(LocalNotifications.checkPermissions).mockResolvedValueOnce({ display: "granted" } as any);

    const status = await ensureNotificationPermissionWithStatus();
    expect(status).toBe("granted");
    expect(LocalNotifications.requestPermissions).not.toHaveBeenCalled();
  });

  it("solicita permissão nativa se o status atual for prompt", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(LocalNotifications.checkPermissions).mockResolvedValueOnce({ display: "prompt" } as any);
    vi.mocked(LocalNotifications.requestPermissions).mockResolvedValueOnce({ display: "granted" } as any);

    const status = await ensureNotificationPermissionWithStatus();
    expect(status).toBe("granted");
    expect(LocalNotifications.requestPermissions).toHaveBeenCalledTimes(1);
  });

  it("retorna 'denied' quando a permissão for negada pelo usuário", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(LocalNotifications.checkPermissions).mockResolvedValueOnce({ display: "denied" } as any);

    const status = await ensureNotificationPermissionWithStatus();
    expect(status).toBe("denied");
  });
});
