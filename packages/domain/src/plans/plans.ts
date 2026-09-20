/**
 * Catálogo e Definições de Planos do Plutão
 * Única fonte de verdade para os limites, modelos e flags dos planos.
 */

export type PlanId = "orbita_livre" | "caronte" | "constelacao" | "sistema_plutao";

export interface PlanDefinition {
  id: PlanId;
  label: string;
  functional: string;
  tagline: string;
  priceMonthly: number;
  founderPriceMonthly?: number;
  cloudMessagesPerDay: number | null; // null = ilimitado
  premiumPerDay: number | null; // null = ilimitado / sem cota extra
  connectorsMax: number;
  projectsMax?: number;
  historyDays: number | null; // null = ilimitado
  seats?: number;
  models: ("economy" | "premium")[];
  flags?: string[];
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  orbita_livre: {
    id: "orbita_livre",
    label: "Órbita Livre",
    functional: "Grátis",
    tagline: "Sinta a gravidade do Plutão",
    priceMonthly: 0,
    cloudMessagesPerDay: 30,
    premiumPerDay: 0,
    connectorsMax: 1,
    projectsMax: 3,
    historyDays: 7,
    models: ["economy"],
  },
  caronte: {
    id: "caronte",
    label: "Caronte",
    functional: "Pro",
    tagline: "Sempre ao seu lado, em qualquer órbita",
    priceMonthly: 39,
    founderPriceMonthly: 19,
    cloudMessagesPerDay: 1000,
    premiumPerDay: 100,
    connectorsMax: 10,
    projectsMax: 999,
    historyDays: null,
    models: ["economy", "premium"],
  },
  constelacao: {
    id: "constelacao",
    label: "Constelação",
    functional: "Business",
    tagline: "Toda a sua tripulação a bordo",
    priceMonthly: 149,
    cloudMessagesPerDay: 5000,
    premiumPerDay: 500,
    connectorsMax: 999,
    seats: 5,
    historyDays: null,
    models: ["economy", "premium"],
  },
  sistema_plutao: {
    id: "sistema_plutao",
    label: "Sistema Plutão",
    functional: "Enterprise",
    tagline: "Comando total do sistema",
    priceMonthly: 499,
    cloudMessagesPerDay: null,
    premiumPerDay: null,
    connectorsMax: 999,
    historyDays: null,
    models: ["economy", "premium"],
    flags: ["sso", "sla", "white_label"],
  },
};

/**
 * Normaliza qualquer alias ou valor do banco para um PlanId válido.
 * Exemplo: 'free' -> 'orbita_livre', 'pro' -> 'caronte'.
 */
export function normalizePlanId(planStr: string | null | undefined): PlanId {
  if (!planStr) return "orbita_livre";
  const normalized = planStr.toLowerCase().trim();
  if (normalized === "free" || normalized === "orbita_livre" || normalized === "órbita_livre") {
    return "orbita_livre";
  }
  if (normalized === "pro" || normalized === "caronte") {
    return "caronte";
  }
  if (normalized === "business" || normalized === "constelacao" || normalized === "constelação") {
    return "constelacao";
  }
  if (normalized === "enterprise" || normalized === "sistema_plutao" || normalized === "sistema_plutão") {
    return "sistema_plutao";
  }
  return "orbita_livre";
}

export function getPlanDefinition(planStr: string | null | undefined): PlanDefinition {
  const id = normalizePlanId(planStr);
  return PLANS[id];
}

export interface FounderTier {
  positionRange: string;
  priceMonthly: number;
  label: string;
}

export function getFounderTierForPosition(position: number): FounderTier {
  if (position <= 100) {
    return {
      positionRange: "1–100",
      priceMonthly: 19,
      label: "Primeira Leva (1–100) — R$ 19/mês",
    };
  }
  if (position <= 500) {
    return {
      positionRange: "101–500",
      priceMonthly: 29,
      label: "Segunda Leva (101–500) — R$ 29/mês",
    };
  }
  return {
    positionRange: "501+",
    priceMonthly: 39,
    label: "Terceira Leva (501+) — R$ 39/mês",
  };
}
