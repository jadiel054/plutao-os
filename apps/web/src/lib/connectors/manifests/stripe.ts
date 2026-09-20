import type { ConnectorManifest } from "./types";

/**
 * STRIPE MANIFEST (category: "finanças", authMode: "token")
 *
 * Duplo propósito:
 * 1. O operador/membro da equipe usa para visualizar operação e métricas do próprio Plutão.
 * 2. Usuários do Plutão conectam a PRÓPRIA conta Stripe para os sistemas e saas que criam via Plutão.
 *
 * TODAS AS CAPABILITIES ATUAIS SÃO DE LEITURA (mode: "read").
 * Ações de escrita (criar produto, criar cobrança, assinar cliente) ficam BLOQUEADAS (Princípio 1)
 * até haver portão de confirmação humana implementado no chat/executor.
 */
export const stripeManifest: ConnectorManifest = {
  provider: "stripe",
  displayName: "Stripe",
  description:
    "Finanças e pagamentos: saldo, produtos, clientes, cobranças e assinaturas da sua conta. API Key restrita cifrada.",
  category: "finanças",
  authMode: "token",
  baseUrl: "https://api.stripe.com/v1",
  defaultServerUrl: "https://api.stripe.com/v1",
  headers: (token: string) => ({
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  }),
  tokenConfig: {
    url: "https://dashboard.stripe.com/apikeys",
    label: "API Key do Stripe (Secret ou Restricted)",
    placeholder: "API Key (ex: rk_live_... ou sk_test_...)",
    verifyUrl: "https://api.stripe.com/v1/balance",
    extractUserLogin: (data: unknown) => {
      const obj = data as Record<string, unknown>;
      if (obj.object === "balance") return "stripe-account";
      return "stripe-user";
    },
  },
  capabilities: [
    {
      name: "balance_get",
      description: "Obter saldo disponível e pendente na conta Stripe",
      mode: "read",
      request: {
        method: "GET",
        path: "/balance",
      },
      requiredArgs: [],
      intentKeywords: ["saldo", "balance", "faturamento", "quanto tenho", "saldo stripe"],
      summary: {
        customFormatter: (data: unknown) => {
          const obj = data as Record<string, unknown>;
          const avail = Array.isArray(obj.available) ? (obj.available as Array<{ amount: number; currency: string }>) : [];
          const pend = Array.isArray(obj.pending) ? (obj.pending as Array<{ amount: number; currency: string }>) : [];
          const availStr = avail.map((a) => `${(a.amount / 100).toFixed(2)} ${a.currency.toUpperCase()}`).join(", ") || "0.00";
          const pendStr = pend.map((p) => `${(p.amount / 100).toFixed(2)} ${p.currency.toUpperCase()}`).join(", ") || "0.00";
          return `Saldo Stripe:\n- Disponível: ${availStr}\n- Pendente: ${pendStr}`;
        },
      },
    },
    {
      name: "products_list",
      description: "Listar produtos cadastrados no Stripe",
      mode: "read",
      request: {
        method: "GET",
        path: "/products",
        query: { limit: "{limit}" },
      },
      requiredArgs: [],
      intentKeywords: ["produtos stripe", "produtos", "products stripe", "lista de produtos"],
      summary: {
        limit: 10,
        customFormatter: (data: unknown) => {
          const obj = data as Record<string, unknown>;
          const list = Array.isArray(obj.data) ? obj.data : [];
          if (list.length === 0) return "Nenhum produto cadastrado no Stripe.";
          const lines = list.map((p, i) => {
            const row = p as Record<string, unknown>;
            return `${i + 1}. **${row.name ?? row.id}** (${row.active ? "ativo" : "inativo"})\n   id: \`${row.id}\`${row.description ? ` · ${row.description}` : ""}`;
          });
          return `Produtos Stripe (${list.length}):\n\n${lines.join("\n\n")}`;
        },
      },
    },
    {
      name: "customers_list",
      description: "Listar clientes da conta Stripe",
      mode: "read",
      request: {
        method: "GET",
        path: "/customers",
        query: { limit: "{limit}" },
      },
      requiredArgs: [],
      intentKeywords: ["clientes stripe", "clientes", "customers", "customers stripe"],
      summary: {
        limit: 10,
        customFormatter: (data: unknown) => {
          const obj = data as Record<string, unknown>;
          const list = Array.isArray(obj.data) ? obj.data : [];
          if (list.length === 0) return "Nenhum cliente cadastrado no Stripe.";
          const lines = list.map((c, i) => {
            const row = c as Record<string, unknown>;
            return `${i + 1}. **${row.name || row.email || row.id}**\n   id: \`${row.id}\`${row.email ? ` · ${row.email}` : ""}`;
          });
          return `Clientes Stripe (${list.length}):\n\n${lines.join("\n\n")}`;
        },
      },
    },
    {
      name: "charges_list",
      description: "Listar cobranças/pagamentos recentes",
      mode: "read",
      request: {
        method: "GET",
        path: "/charges",
        query: { limit: "{limit}" },
      },
      requiredArgs: [],
      intentKeywords: ["cobranças", "cobrancas", "pagamentos", "charges", "vendas"],
      summary: {
        limit: 10,
        customFormatter: (data: unknown) => {
          const obj = data as Record<string, unknown>;
          const list = Array.isArray(obj.data) ? obj.data : [];
          if (list.length === 0) return "Nenhuma cobrança recente encontrada.";
          const lines = list.map((ch, i) => {
            const row = ch as Record<string, unknown>;
            const val = typeof row.amount === "number" ? (row.amount / 100).toFixed(2) : "—";
            const curr = String(row.currency || "").toUpperCase();
            return `${i + 1}. **${val} ${curr}** · status: ${row.status} (${row.paid ? "pago" : "não pago"})\n   id: \`${row.id}\``;
          });
          return `Cobranças Recentes Stripe (${list.length}):\n\n${lines.join("\n\n")}`;
        },
      },
    },
    {
      name: "subscriptions_list",
      description: "Listar assinaturas ativas/recentes",
      mode: "read",
      request: {
        method: "GET",
        path: "/subscriptions",
        query: { limit: "{limit}" },
      },
      requiredArgs: [],
      intentKeywords: ["assinaturas", "subscriptions", "planos ativos"],
      summary: {
        limit: 10,
        customFormatter: (data: unknown) => {
          const obj = data as Record<string, unknown>;
          const list = Array.isArray(obj.data) ? obj.data : [];
          if (list.length === 0) return "Nenhuma assinatura encontrada.";
          const lines = list.map((s, i) => {
            const row = s as Record<string, unknown>;
            return `${i + 1}. Assinatura \`${row.id}\` · status: **${row.status}**\n   cliente: \`${row.customer}\``;
          });
          return `Assinaturas Stripe (${list.length}):\n\n${lines.join("\n\n")}`;
        },
      },
    },
  ],
};
