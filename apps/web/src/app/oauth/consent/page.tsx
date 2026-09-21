import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";

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
  const scope = one(sp.scope) || "mcp:read";
  const codeChallenge = one(sp.code_challenge);
  const state = one(sp.state);

  const user = await getSessionUser();
  if (!user) {
    const q = new URLSearchParams();
    q.set("next", `/oauth/consent?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      ...(state ? { state } : {}),
    }).toString()}`);
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

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-6 p-6 text-[var(--text)]">
      <div className="space-y-2">
        <p className="text-xs font-mono uppercase tracking-wide text-[var(--text-muted)]">Plutão · Agente externo</p>
        <h1 className="text-xl font-semibold">Autorizar acesso</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Um aplicativo externo pede permissão para ler dados da sua conta no Plutão
          via MCP. Nada é escrito nesta fase.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3 text-sm">
        <div>
          <div className="text-xs text-[var(--text-muted)]">Conta</div>
          <div className="font-medium">{user?.email}</div>
        </div>
        <div>
          <div className="text-xs text-[var(--text-muted)]">Cliente</div>
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
              <span className="font-mono text-xs">mcp:read</span> — status, conectores (sem
              tokens), conversas e detalhes de missão
            </li>
          </ul>
        </div>
      </div>

      <form action="/api/oauth/consent" method="post" className="flex flex-col gap-3">
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="code_challenge" value={codeChallenge} />
        <input type="hidden" name="state" value={state} />

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
        Você pode revogar o acesso deixando de usar o cliente ou rotacionando segredos em
        Configurações. Tokens de conectores (GitHub, Vercel, …) nunca são expostos via MCP.
      </p>
    </main>
  );
}
