import { NextResponse } from "next/server";
import { getUpdateManifest } from "@/lib/updates/releases";

export const runtime = "nodejs";

export async function GET() {
  const manifest = await getUpdateManifest();
  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
