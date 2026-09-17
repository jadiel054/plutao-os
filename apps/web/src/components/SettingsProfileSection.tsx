"use client";

type Props = {
  userEmail: string;
  agentName: string;
  agentIdentity: string;
  agentPersonality: string;
  setAgentName: (v: string) => void;
  setAgentIdentity: (v: string) => void;
  setAgentPersonality: (v: string) => void;
};

export function SettingsProfileSection({
  userEmail,
  agentName,
  agentIdentity,
  agentPersonality,
  setAgentName,
  setAgentIdentity,
  setAgentPersonality,
}: Props) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-6 animate-in fade-in duration-200">
      <div className="pb-3 border-b border-[var(--border)]">
        <h2 className="text-base font-semibold">Conta e Agente</h2>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Dados da conta e identidade do assistente Plutão
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">E-mail</label>
        <input
          type="email"
          value={userEmail}
          disabled
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3.5 py-2.5 text-sm text-[var(--text-muted)]"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Nome do agente</label>
        <input
          type="text"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--selo)]"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Identidade</label>
        <input
          type="text"
          value={agentIdentity}
          onChange={(e) => setAgentIdentity(e.target.value)}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--selo)]"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Personalidade</label>
        <textarea
          value={agentPersonality}
          onChange={(e) => setAgentPersonality(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--selo)] resize-none"
        />
      </div>
    </section>
  );
}
