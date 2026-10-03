import { describe, it, expect } from "vitest";

describe("Disconnect Confirmation Modal & Plan Limit Warning Logic", () => {
  interface UserPlan {
    id: string;
    label: string;
    connectorsMax: number;
  }

  function getDisconnectModalData(opts: {
    providerDisplayName: string;
    userPlan: UserPlan | null;
    activeConnectorsCount: number;
  }) {
    const connectorsMax = opts.userPlan?.connectorsMax ?? 1;
    const isAtOrAboveLimit = opts.activeConnectorsCount >= connectorsMax;

    return {
      title: `Desconectar ${opts.providerDisplayName}?`,
      limitText: `Seu plano permite até ${connectorsMax} conectores ativos.`,
      showExtraWarning: isAtOrAboveLimit,
      extraWarningText: isAtOrAboveLimit
        ? "Reconectar depois pode ser bloqueado pelo limite do plano."
        : null,
    };
  }

  it("formats title and plan limit text for orbita_livre plan (N=1)", () => {
    const data = getDisconnectModalData({
      providerDisplayName: "GitHub",
      userPlan: { id: "orbita_livre", label: "Órbita Livre", connectorsMax: 1 },
      activeConnectorsCount: 1,
    });

    expect(data.title).toBe("Desconectar GitHub?");
    expect(data.limitText).toBe("Seu plano permite até 1 conectores ativos.");
    expect(data.showExtraWarning).toBe(true);
    expect(data.extraWarningText).toBe("Reconectar depois pode ser bloqueado pelo limite do plano.");
  });

  it("formats title and plan limit text for caronte plan (N=10) when below limit", () => {
    const data = getDisconnectModalData({
      providerDisplayName: "Vercel",
      userPlan: { id: "caronte", label: "Caronte", connectorsMax: 10 },
      activeConnectorsCount: 2,
    });

    expect(data.title).toBe("Desconectar Vercel?");
    expect(data.limitText).toBe("Seu plano permite até 10 conectores ativos.");
    expect(data.showExtraWarning).toBe(false);
    expect(data.extraWarningText).toBeNull();
  });

  it("includes extra warning when caronte plan is at or above limit (N=10, active=10)", () => {
    const data = getDisconnectModalData({
      providerDisplayName: "Stripe",
      userPlan: { id: "caronte", label: "Caronte", connectorsMax: 10 },
      activeConnectorsCount: 10,
    });

    expect(data.title).toBe("Desconectar Stripe?");
    expect(data.limitText).toBe("Seu plano permite até 10 conectores ativos.");
    expect(data.showExtraWarning).toBe(true);
    expect(data.extraWarningText).toBe("Reconectar depois pode ser bloqueado pelo limite do plano.");
  });

  it("defaults connectorsMax to 1 when userPlan is missing or null", () => {
    const data = getDisconnectModalData({
      providerDisplayName: "Telegram",
      userPlan: null,
      activeConnectorsCount: 1,
    });

    expect(data.limitText).toBe("Seu plano permite até 1 conectores ativos.");
    expect(data.showExtraWarning).toBe(true);
    expect(data.extraWarningText).toBe("Reconectar depois pode ser bloqueado pelo limite do plano.");
  });
});
