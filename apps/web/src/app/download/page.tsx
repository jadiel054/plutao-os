import Link from "next/link";
import { getUpdateManifest, UpdateRelease } from "@/lib/updates/releases";
import { DownloadApkButton } from "@/components/DownloadApkButton";

export const revalidate = 60;

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ReleaseCard({ release, featured = false }: { release: UpdateRelease; featured?: boolean }) {
  return (
    <article className={`rounded-2xl border p-5 ${featured ? "border-[var(--selo)]/50 bg-[var(--surface)] shadow-lg" : "border-[var(--border)] bg-[var(--surface)]/60"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--selo)]">{featured ? "Versão mais recente" : "Release"}</p>
          <h2 className="mt-1 text-xl font-semibold">Plutão {release.versionName}</h2>
          <p className="text-xs text-[var(--text-muted)]">{new Date(release.date).toLocaleDateString("pt-BR")} · {formatSize(release.size)}</p>
        </div>
        <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-secondary)]">build {release.versionCode}</span>
      </div>
      <p className="mt-4 whitespace-pre-line text-sm text-[var(--text-secondary)]">{release.notes || "Atualização do Plutão."}</p>
      <dl className="mt-4 space-y-2 rounded-xl bg-[var(--base)]/60 p-3 text-xs">
        <div><dt className="text-[var(--text-muted)]">SHA-256 do APK</dt><dd className="mt-1 break-all font-mono text-[var(--text-secondary)]">{release.sha256}</dd></div>
        {release.signingSha256 && <div><dt className="text-[var(--text-muted)]">Fingerprint da assinatura</dt><dd className="mt-1 break-all font-mono text-[var(--text-secondary)]">{release.signingSha256}</dd></div>}
      </dl>
      <DownloadApkButton url={`/api/updates/download/${encodeURIComponent(release.versionName)}`} />
    </article>
  );
}

export default async function DownloadPage() {
  const manifest = await getUpdateManifest();
  return (
    <main className="min-h-dvh bg-[var(--base)] px-4 py-10 text-[var(--text-primary)] sm:px-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <Link href="/" className="text-xs text-[var(--selo)] hover:underline">← Voltar ao Plutão</Link>
          <p className="text-xs uppercase tracking-[0.25em] text-[var(--selo)]">Canal próprio</p>
          <h1 className="text-3xl font-semibold tracking-tight">Atualizações do Plutão</h1>
          <p className="max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">Baixe o APK oficial diretamente do release público. A instalação é manual pelo fluxo do Android: este canal nunca instala ou atualiza o aplicativo automaticamente.</p>
        </header>
        {manifest.latest ? <ReleaseCard release={manifest.latest} featured /> : <div className="rounded-2xl border border-[var(--border)] p-5 text-sm text-[var(--text-secondary)]">Ainda não há releases publicados neste canal.</div>}
        {manifest.releases.length > 1 && <section className="space-y-4"><h2 className="text-lg font-semibold">Histórico recente</h2>{manifest.releases.slice(1).map((release) => <ReleaseCard key={release.versionName} release={release} />)}</section>}
        <p className="text-xs leading-5 text-[var(--text-muted)]">Verifique o SHA-256 exibido com uma ferramenta local antes de instalar. Em caso de divergência, não instale e reporte o problema.</p>
      </div>
    </main>
  );
}
