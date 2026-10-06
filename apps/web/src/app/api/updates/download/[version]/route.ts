import { NextRequest, NextResponse } from "next/server";
import { getUpdateManifest } from "@/lib/updates/releases";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ version: string }> }) {
  const { version } = await context.params;
  const manifest = await getUpdateManifest();
  const release = manifest.releases.find((item) => item.versionName === version);
  if (!release) return NextResponse.json({ error: "Release não encontrado" }, { status: 404 });

  const upstream = await fetch(release.apkUrl, { cache: "no-store", redirect: "follow" });
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: "APK indisponível" }, { status: 502 });

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Length": String(release.size),
      "Content-Disposition": `attachment; filename="plutao-${release.versionName}.apk"`,
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
