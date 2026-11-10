import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getMcpResourceUrl, issueConsentTicket, normalizeScopes } from "@/lib/mcp/tokens";
import { resolveMcpOAuthClient } from "@/lib/mcp/clientMetadata";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] || "";
  return v || "";
}

export default async function OAuthConsentPage({ searchParams }: Props) {
  const sp = await searchParams;
  const clientId = one(sp.client_id);
  const redirectUri = one(sp.redirect_uri);
  const requestedScope = normalizeScopes(one(sp.scope) || "mcp:read", { allowWrite: true });
  const resource = one(sp.resource) || getMcpResourceUrl();
  const codeChallenge = one(sp.code_challenge);
  const state = one(sp.state);

  const user = await getSessionUser();
  if (!user) {
    const q = new URLSearchParams();
    q.set(
      "next",
      `/oauth/consent?${new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: requestedScope,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        ...(state ? { state } : {}),
      }).toString()}`
    );
    redirect(`/login?${q.toString()}`);
  }

  if (!clientId || !redirectUri || !codeChallenge) {
    return (
      <main className="mx-auto max-w-md p-6 text-[var(--text)]">
        <h1 className="text-lg font-semibold">Pedido OAuth inválido</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Faltam parâmetros obrigatórios (client_id, redirect_uri, code_challenge).
        </p>
      </main>
    );
  }

  const resolvedClient = await resolveMcpOAuthClient(clientId);
  const clientName = resolvedClient.ok ? resolvedClient.client.clientName : null;
  const requestsWrite = requestedScope.split(/\s+/).includes("mcp:write");
  const consentTicket = issueConsentTicket({
    sub: user.id,
    client_id: clientId,
    redirect_uri: redirectUri,
    resource,
    scope: requestedScope,
    code_challenge: codeChallenge,
    state,
  });

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-6 p-6 text-[var(--text)]">
      <div className="space-y-2">
        <p className="text-xs font-mono uppercase tracking-wide text-[var(--text-muted)]">
          Plutão · Agente externo
        </p>
        <h1 className="text-xl font-semibold">Autorizar acesso</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Um aplicativo externo pede permissão para acessar a sua conta no Plutão via MCP.
          Revise o cliente e cada permissão antes de autorizar.
        </p>
      </div>

      <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">
        <div>
          <div className="text-xs text-[var(--text-muted)]">Conta</div>
          <div className="font-medium">{user.email}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--text-muted)]">Cliente</div>
          {clientName && <div className="font-medium">{clientName}</div>}
          {clientName && <div className="text-xs text-[var(--text-muted)]">Nome declarado pelo aplicativo; não verificado.</div>}
          <div className="break-all font-mono text-xs">{clientId}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--text-muted)]">Redirecionamento</div>
          <div className="break-all font-mono text-xs">{redirectUri}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--text-muted)]">Permissões</div>
          <ul className="mt-1 list-inside list-disc text-[var(--text)]">
            <li>
              <span className="font-mono text-xs">mcp:read</span>
              {" — status, conectores (sem tokens), conversas e detalhes de missão."}
            </li>
          </ul>
        </div>
        {requestsWrite && (
          <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] p-3">
            <input className="mt-1" type="checkbox" name="allow_write" value="mcp:write" />
            <span>
              <span className="font-mono text-xs">mcp:write</span>
              <span className="block text-sm font-medium">Permitir criação de missões e envio de mensagens</span>
              <span className="mt-1 block text-xs text-[var(--text-muted)]">
                Desmarcado por padrão. A criação deixa a missão em CREATED e não a inicia. Esta permissão
                não libera ações externas em GitHub, Vercel ou outros conectores; os gates de aprovação existentes continuam valendo.
              </span>
            </span>
          </label>
        )}
      </div>

      <form action="/api/oauth/consent" method="post" className="flex flex-col gap-3">
        <input type="hidden" name="consent_ticket" value={consentTicket} />
        <button
          type="submit"
          name="decision"
          value="approve"
          className="rounded-xl bg-[var(--accent,theme(colors.emerald.600))] px-4 py-3 text-sm font-semibold text-white"
        >
          Autorizar
        </button>
        <button
          type="submit"
          name="decision"
          value="deny"
          className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-medium"
        >
          Negar
        </button>
      </form>

      <p className="text-xs text-[var(--text-muted)]">
        Você pode revogar o acesso em Configurações → Privacidade (grants MCP). Tokens de
        conectores (GitHub, Vercel, …) nunca são expostos via MCP.
      </p>
    </main>
  );
}
