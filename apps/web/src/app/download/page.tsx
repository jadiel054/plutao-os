import Link from "next/link";
import { getUpdateManifest, UpdateRelease } from "@/lib/updates/releases";
import { DownloadApkButton } from "@/components/DownloadApkButton";

export const revalidate = 60;

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data não informada" : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function ReleaseCard({ release, featured = false }: { release: UpdateRelease; featured?: boolean }) {
  return (
    <article className={`overflow-hidden rounded-[1.75rem] border ${featured ? "border-[var(--selo)]/40 bg-[var(--surface-elevated)] shadow-[0_18px_60px_rgba(0,0,0,.24)]" : "border-[var(--border)] bg-[var(--surface)]/55"}`}>
      {featured && <div className="h-1 bg-gradient-to-r from-[var(--selo)] via-[var(--nucleo)] to-transparent" />}
      <div className="space-y-5 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--selo)]/25 bg-[var(--selo)]/10 text-[var(--selo)]" aria-hidden>↓</div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--selo)]">{featured ? "Versão recomendada" : "Release anterior"}</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-[var(--text-primary)]">Plutão {release.versionName}</h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">build {release.versionCode} · {formatDate(release.date)}</p>
            </div>
          </div>
          <span className="rounded-full border border-[var(--border-strong)] bg-[var(--base)]/45 px-3 py-1.5 text-xs text-[var(--text-secondary)]">{formatSize(release.size)}</span>
        </div>

        <p className="whitespace-pre-line text-sm leading-6 text-[var(--text-secondary)]">{release.notes || "Melhorias de estabilidade, desempenho e experiência."}</p>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--base)]/40 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Integridade</p>
            <p className="mt-1 text-xs font-medium text-[var(--text-primary)]">SHA-256 conferível</p>
            <code className="mt-2 block break-all text-[10px] leading-4 text-[var(--text-secondary)]">{release.sha256}</code>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--base)]/40 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Distribuição</p>
            <p className="mt-1 text-xs font-medium text-[var(--text-primary)]">APK assinado pelo Plutão</p>
            <p className="mt-2 text-[10px] leading-4 text-[var(--text-muted)]">O Android mostrará a confirmação antes da instalação.</p>
          </div>
        </div>

        <DownloadApkButton url={`/api/updates/download/${encodeURIComponent(release.versionName)}`} />
      </div>
    </article>
  );
}

export default async function DownloadPage() {
  const manifest = await getUpdateManifest();
  return (
    <main className="min-h-dvh bg-[var(--base)] px-4 py-6 text-[var(--text-primary)] sm:px-8 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-5">
          <Link href="/" className="inline-flex items-center gap-2 rounded-lg py-1 text-xs text-[var(--text-secondary)] transition hover:text-[var(--selo)]">← Voltar ao Plutão</Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--selo)]">Canal próprio · Android</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Atualizações do Plutão</h1>
            </div>
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[10px] font-mono text-[var(--text-muted)]">APK verificado</span>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">Baixe a versão oficial direto do release público. O download é manual e transparente: você confere os detalhes e o Android pede sua confirmação antes de instalar.</p>
        </header>

        {manifest.latest ? <ReleaseCard release={manifest.latest} featured /> : <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--text-secondary)]">Ainda não há uma versão publicada neste canal.</div>}

        {manifest.latest && (
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Como atualizar">
            {["Baixe o APK", "Abra o arquivo", "Confirme no Android"].map((step, index) => (
              <div key={step} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/45 p-4">
                <span className="text-xs font-mono text-[var(--selo)]">0{index + 1}</span>
                <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">{step}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{index === 0 ? "Use o botão da versão recomendada." : index === 1 ? "Toque na notificação ou abra Downloads." : "A atualização mantém seus dados no aparelho."}</p>
              </div>
            ))}
          </section>
        )}

        {manifest.releases.length > 1 && <section className="space-y-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">Arquivo</p><h2 className="mt-1 text-lg font-semibold">Histórico recente</h2></div>{manifest.releases.slice(1).map((release) => <ReleaseCard key={release.versionName} release={release} />)}</section>}

        <p className="border-t border-[var(--border)] pt-5 text-xs leading-5 text-[var(--text-muted)]">Antes de instalar, confira o SHA-256 exibido. Se o valor do arquivo não corresponder, não instale e reporte a divergência.</p>
      </div>
    </main>
  );
}
