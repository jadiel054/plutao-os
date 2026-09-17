"use client";

type Props = {
  notifyMissions: boolean;
  notifyTasks: boolean;
  notifyAlerts: boolean;
  notifySounds: boolean;
  setNotifyMissions: (v: boolean) => void;
  setNotifyTasks: (v: boolean) => void;
  setNotifyAlerts: (v: boolean) => void;
  setNotifySounds: (v: boolean) => void;
};

function Row({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-[var(--border)]/60 last:border-0">
      <div className="min-w-0">
        <h3 className="text-sm font-medium">{label}</h3>
        <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{description}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 mt-1 accent-[var(--selo)] cursor-pointer shrink-0"
      />
    </div>
  );
}

export function SettingsNotificationsSection({
  notifyMissions,
  notifyTasks,
  notifyAlerts,
  notifySounds,
  setNotifyMissions,
  setNotifyTasks,
  setNotifyAlerts,
  setNotifySounds,
}: Props) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-2 animate-in fade-in duration-200">
      <div className="pb-3 border-b border-[var(--border)] mb-2">
        <h2 className="text-base font-semibold">Notificações</h2>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          Quando e como você quer ser avisado sobre missões e alertas
        </p>
      </div>

      <Row
        label="Missões"
        description="Atualizações de progresso e conclusão de missões"
        checked={notifyMissions}
        onChange={setNotifyMissions}
      />
      <Row
        label="Tarefas"
        description="Lembretes e mudanças de status de tarefas"
        checked={notifyTasks}
        onChange={setNotifyTasks}
      />
      <Row
        label="Alertas"
        description="Avisos críticos e falhas de execução"
        checked={notifyAlerts}
        onChange={setNotifyAlerts}
      />
      <Row
        label="Sons"
        description="Feedback sonoro para eventos importantes"
        checked={notifySounds}
        onChange={setNotifySounds}
      />
    </section>
  );
}
