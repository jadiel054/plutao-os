"use client";

import { useEffect, useState } from "react";

type ToastFn = (message: string, type?: "success" | "info" | "warning" | "error", title?: string) => void;
type Session = { id: string; device: string; userAgent: string | null; createdAt: string; expiresAt: string; current: boolean };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function SettingsSecuritySection({ onNotify }: { onNotify: ToastFn }) {
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; qrDataUri: string; otpauthUri: string } | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [biometricLock, setBiometricLock] = useState(false);

  async function load() {
    try {
      const [totpResponse, sessionsResponse, preferencesResponse] = await Promise.all([
        fetch("/api/security/totp", { cache: "no-store" }),
        fetch("/api/security/sessions", { cache: "no-store" }),
        fetch("/api/user/preferences", { cache: "no-store" }),
      ]);
      if (totpResponse.ok) setTotpEnabled((await totpResponse.json()).enabled === true);
      if (sessionsResponse.ok) setSessions((await sessionsResponse.json()).sessions ?? []);
      if (preferencesResponse.ok) setBiometricLock((await preferencesResponse.json()).preferences?.biometric_lock === true);
    } catch {
      onNotify("Não foi possível carregar a configuração de segurança", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function startTotp() {
    setBusy(true);
    try {
      const response = await fetch("/api/security/totp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setup" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao iniciar 2FA");
      setSetup({ secret: data.secret, qrDataUri: data.qrDataUri, otpauthUri: data.otpauthUri });
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Falha ao iniciar 2FA", "error");
    } finally { setBusy(false); }
  }

  async function enableTotp() {
    setBusy(true);
    try {
      const response = await fetch("/api/security/totp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "enable", token: setupCode }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Código inválido");
      setTotpEnabled(true);
      setSetup(null);
      setSetupCode("");
      setBackupCodes(data.backupCodes ?? []);
      onNotify("2FA ativado. Guarde os códigos de backup agora.", "success");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Falha ao ativar 2FA", "error");
    } finally { setBusy(false); }
  }

  async function disableTotp() {
    setBusy(true);
    try {
      const response = await fetch("/api/security/totp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disable", password: disablePassword, token: disableCode }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Falha ao desativar 2FA");
      setTotpEnabled(false);
      setDisablePassword("");
      setDisableCode("");
      onNotify("2FA desativado", "warning");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "Falha ao desativar 2FA", "error");
    } finally { setBusy(false); }
  }

  async function revokeSession(id: string) {
    const response = await fetch("/api/security/sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (response.ok) { setSessions((current) => current.filter((session) => session.id !== id)); onNotify("Sessão encerrada", "success"); }
    else onNotify("Não foi possível encerrar a sessão", "error");
  }

  async function revokeOthers() {
    const response = await fetch("/api/security/sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ allOther: true }) });
    if (response.ok) { await load(); onNotify("As outras sessões foram encerradas", "success"); }
    else onNotify("Não foi possível encerrar as outras sessões", "error");
  }

  async function toggleBiometric() {
    const next = !biometricLock;
    const response = await fetch("/api/user/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ biometric_lock: next }) });
    if (response.ok) { setBiometricLock(next); onNotify("Preferência salva. A trava biométrica estará disponível na próxima versão do app Android.", "info"); }
    else onNotify("Não foi possível salvar a preferência", "error");
  }

  if (loading) return <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--text-muted)]">Carregando segurança…</section>;

  return <div className="space-y-6">
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold">2FA da conta</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">Proteja o login com TOTP no Google Authenticator ou Aegis. O Plutão não usa SMS.</p>
      </div>
      {!totpEnabled && !setup && <button type="button" disabled={busy} onClick={() => void startTotp()} className="rounded-xl bg-[var(--selo)] px-4 py-2.5 text-xs font-semibold text-[var(--base)] disabled:opacity-50">Configurar 2FA</button>}
      {setup && <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--base)]/50 p-4">
        <p className="text-xs leading-5 text-[var(--text-secondary)]">Escaneie o QR code no autenticador. Se preferir, informe manualmente a chave abaixo.</p>
        <img src={setup.qrDataUri} alt="QR code para configurar o autenticador" className="h-60 w-60 rounded-lg bg-white p-2" />
        <div className="break-all rounded-lg border border-[var(--border)] p-3 font-mono text-xs text-[var(--text-secondary)]">{setup.secret}</div>
        <p className="break-all text-[11px] text-[var(--text-muted)]">URI: {setup.otpauthUri}</p>
        <label className="block space-y-1.5"><span className="text-xs text-[var(--text-secondary)]">Digite o código exibido para confirmar</span><input value={setupCode} onChange={(e) => setSetupCode(e.target.value)} inputMode="numeric" maxLength={6} placeholder="123456" className="w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2.5 text-sm" /></label>
        <div className="flex gap-2"><button type="button" disabled={busy || setupCode.length !== 6} onClick={() => void enableTotp()} className="rounded-xl bg-[var(--selo)] px-4 py-2.5 text-xs font-semibold text-[var(--base)] disabled:opacity-50">Confirmar e gerar backups</button><button type="button" onClick={() => setSetup(null)} className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-xs">Cancelar</button></div>
      </div>}
      {totpEnabled && <div className="space-y-3"><p className="text-sm text-emerald-400">2FA está ativo nesta conta.</p><div className="grid gap-2 sm:grid-cols-2"><input type="password" value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} placeholder="Senha para desativar" className="rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2.5 text-xs" /><input value={disableCode} onChange={(e) => setDisableCode(e.target.value)} placeholder="ou código TOTP" inputMode="numeric" className="rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2.5 text-xs" /></div><button type="button" disabled={busy || (!disablePassword && !disableCode)} onClick={() => void disableTotp()} className="rounded-xl border border-red-500/40 px-4 py-2.5 text-xs text-red-300 disabled:opacity-50">Desativar 2FA</button></div>}
      {backupCodes && <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4"><h3 className="text-sm font-semibold text-amber-200">Códigos de backup — exibidos uma única vez</h3><p className="mt-1 text-xs leading-5 text-amber-100/70">Copie e guarde em local seguro. Depois desta tela não será possível recuperá-los.</p><div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm text-amber-100">{backupCodes.map((code) => <span key={code}>{code}</span>)}</div><button type="button" onClick={() => { void navigator.clipboard?.writeText(backupCodes.join("\n")); onNotify("Códigos copiados", "success"); }} className="mt-4 rounded-lg border border-amber-500/40 px-3 py-2 text-xs text-amber-100">Copiar códigos</button></div>}
    </section>

    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-semibold">Trava do app por biometria</h2><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">Requer o app instalado — disponível na próxima versão do app Android. A implementação usará Android Keystore; o Plutão nunca vê sua biometria.</p></div><input type="checkbox" role="switch" checked={biometricLock} onChange={() => void toggleBiometric()} className="mt-1 h-5 w-5 accent-[var(--selo)]" /></div>
      <p className="text-[11px] text-[var(--text-muted)]">Isto é uma preferência futura e não substitui o 2FA da conta.</p>
    </section>

    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Sessões ativas</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Dispositivo aproximado pelo navegador e data de criação.</p></div><button type="button" onClick={() => void revokeOthers()} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs hover:border-[var(--selo)]/50">Encerrar outras</button></div>
      <div className="divide-y divide-[var(--border)]">{sessions.map((session) => <div key={session.id} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm">{session.device} {session.current && <span className="text-xs text-emerald-400">· atual</span>}</p><p className="text-[11px] text-[var(--text-muted)]">Criada em {formatDate(session.createdAt)}</p></div>{!session.current && <button type="button" onClick={() => void revokeSession(session.id)} className="text-xs text-red-300 hover:underline">Revogar</button>}</div>)}{sessions.length === 0 && <p className="py-3 text-xs text-[var(--text-muted)]">Nenhuma sessão ativa encontrada.</p>}</div>
    </section>
  </div>;
}
