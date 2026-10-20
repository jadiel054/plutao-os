// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  dispatchAppNotification,
  clearNotificationDedupeCache,
} from "../notifyService";
import { playNotificationSound } from "../soundPlayer";
import { triggerCategoryNotification } from "../capacitorNotifications";
import { Capacitor } from "@capacitor/core";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  },
}));

vi.mock("../soundPlayer", () => ({
  playNotificationSound: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../capacitorNotifications", () => ({
  triggerCategoryNotification: vi.fn().mockResolvedValue(undefined),
}));

describe("dispatchAppNotification & Deduplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearNotificationDedupeCache();
    if (typeof window !== "undefined") {
      localStorage.clear();
    }
  });

  it("dispara notificação web e som quando e-mail/prefs padrão ativos", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    await dispatchAppNotification({
      category: "tasks",
      title: "Nix respondeu",
      body: "Olá, como posso ajudar?",
      data: { conversationId: "conv-1" },
    });

    expect(playNotificationSound).toHaveBeenCalledWith("task_nudge");
  });

  it("deduplica notificações idênticas dentro da janela de 30 segundos", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    await dispatchAppNotification({
      category: "tasks",
      title: "Nix respondeu",
      body: "Olá, como posso ajudar?",
      data: { conversationId: "conv-1" },
    });

    await dispatchAppNotification({
      category: "tasks",
      title: "Nix respondeu",
      body: "Olá, como posso ajudar?",
      data: { conversationId: "conv-1" },
    });

    expect(playNotificationSound).toHaveBeenCalledTimes(1);
  });

  it("dispara novamente notificação após limpar cache de deduplicação", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    await dispatchAppNotification({
      category: "tasks",
      title: "Nix respondeu",
      body: "Olá, como posso ajudar?",
      data: { conversationId: "conv-1" },
    });

    clearNotificationDedupeCache();

    await dispatchAppNotification({
      category: "tasks",
      title: "Nix respondeu",
      body: "Olá, como posso ajudar?",
      data: { conversationId: "conv-1" },
    });

    expect(playNotificationSound).toHaveBeenCalledTimes(2);
  });

  it("chama triggerCategoryNotification no Android nativo", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);

    await dispatchAppNotification({
      category: "alerts",
      title: "Aprovação necessária",
      body: "github: Criar repositório",
      data: { gateId: "gate-123" },
    });

    expect(triggerCategoryNotification).toHaveBeenCalledWith({
      category: "alerts",
      title: "Aprovação necessária",
      body: "github: Criar repositório",
      soundId: "alert_critical",
      extra: { gateId: "gate-123" },
    });
  });

  it("respeita preferências do usuário quando notifyTasks=false", async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    localStorage.setItem(
      "plutao_pref_notifications",
      JSON.stringify({ notifyTasks: false })
    );

    await dispatchAppNotification({
      category: "tasks",
      title: "Nix respondeu",
      body: "Olá!",
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });
});
