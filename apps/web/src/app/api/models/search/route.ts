import { NextRequest, NextResponse } from "next/server";
import { modelCatalog } from "@plutao/db";
import { getDb } from "@/lib/db";
import { CURATED_MODEL_CATALOG, filterCuratedModels } from "@/lib/models/curatedCatalog";
import { desc, ilike, or } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HF_API = "https://huggingface.co/api/models";
const CACHE_TTL_MS = 30_000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_RESULTS = 20;
const cache = new Map<string, { expiresAt: number; value: unknown }>();
const rate = new Map<string, { startedAt: number; count: number }>();

type PublicModel = {
  id: string;
  name: string;
  author: string;
  downloads: number;
  tags: string[];
  pipeline_tag: string | null;
  license?: string | null;
  approxSizeBytes?: number | null;
  sourceUrl: string;
  downloadUrl?: string | null;
  curated?: boolean;
};

function requestIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function allowRequest(ip: string): boolean {
  const now = Date.now();
  const current = rate.get(ip);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    rate.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) return false;
  current.count += 1;
  return true;
}

function parseTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string").slice(0, 24) : [];
}

function modelFromCatalog(row: typeof CURATED_MODEL_CATALOG[number] | Record<string, unknown>): PublicModel {
  const item = row as Record<string, unknown>;
  return {
    id: String(item.id),
    name: String(item.name),
    author: String(item.author),
    downloads: typeof item.downloads === "number" ? item.downloads : 0,
    tags: parseTags(item.tags),
    pipeline_tag: typeof item.pipeline_tag === "string" ? item.pipeline_tag : typeof item.pipelineTag === "string" ? item.pipelineTag : null,
    license: typeof item.license === "string" ? item.license : null,
    approxSizeBytes: typeof item.approx_size_bytes === "number" ? item.approx_size_bytes : typeof item.approxSizeBytes === "number" ? item.approxSizeBytes : null,
    sourceUrl: String(item.source_url ?? item.sourceUrl),
    downloadUrl: typeof item.download_url === "string" ? item.download_url : typeof item.downloadUrl === "string" ? item.downloadUrl : null,
    curated: true,
  };
}

async function curatedModels(query: string): Promise<PublicModel[]> {
  try {
    const db = getDb();
    const needle = query.trim();
    const rows = await db
      .select()
      .from(modelCatalog)
      .where(needle ? or(ilike(modelCatalog.id, `%${needle}%`), ilike(modelCatalog.name, `%${needle}%`), ilike(modelCatalog.author, `%${needle}%`)) : undefined)
      .orderBy(desc(modelCatalog.createdAt));
    if (rows.length > 0) return rows.map(modelFromCatalog);
  } catch (error) {
    console.warn("[models/search] catálogo curado indisponível; usando fallback", error);
  }
  return filterCuratedModels(query).map(modelFromCatalog);
}

function approxSizeFromHf(item: Record<string, unknown>): number | null {
  const safetensors = item.safetensors as Record<string, unknown> | undefined;
  if (typeof safetensors?.total === "number") return safetensors.total;
  const siblings = Array.isArray(item.siblings) ? item.siblings : [];
  const sizes = siblings
    .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>).size : null))
    .filter((size): size is number => typeof size === "number");
  return sizes.length ? sizes.reduce((sum, size) => sum + size, 0) : null;
}

function mapHfModel(item: Record<string, unknown>): PublicModel | null {
  if (typeof item.id !== "string") return null;
  const id = item.id;
  const siblings = Array.isArray(item.siblings) ? item.siblings : [];
  const gguf = siblings.find((s) => s && typeof s === "object" && typeof (s as Record<string, unknown>).rfilename === "string" && String((s as Record<string, unknown>).rfilename).toLowerCase().endsWith(".gguf")) as Record<string, unknown> | undefined;
  const license = typeof item.cardData === "object" && item.cardData !== null && typeof (item.cardData as Record<string, unknown>).license === "string" ? String((item.cardData as Record<string, unknown>).license) : null;
  return {
    id,
    name: id.split("/").pop() || id,
    author: typeof item.author === "string" ? item.author : id.split("/")[0] || "Desconhecido",
    downloads: typeof item.downloads === "number" ? item.downloads : 0,
    tags: parseTags(item.tags),
    pipeline_tag: typeof item.pipeline_tag === "string" ? item.pipeline_tag : null,
    license,
    approxSizeBytes: approxSizeFromHf(item),
    sourceUrl: `https://huggingface.co/${encodeURI(id)}`,
    downloadUrl: gguf ? `https://huggingface.co/${encodeURI(id)}/resolve/main/${String(gguf.rfilename).split("/").map(encodeURIComponent).join("/")}?download=true` : null,
    curated: false,
  };
}

async function searchHuggingFace(query: string): Promise<PublicModel[]> {
  const params = new URLSearchParams({ search: query, limit: String(MAX_RESULTS), sort: "downloads", direction: "-1", expand: "siblings,cardData" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(`${HF_API}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "Plutao-Model-Vitrine/1.0" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Hugging Face respondeu ${response.status}`);
    const payload: unknown = await response.json();
    return Array.isArray(payload) ? payload.map((item) => item && typeof item === "object" ? mapHfModel(item as Record<string, unknown>) : null).filter((item): item is PublicModel => item !== null) : [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams.get("q")?.trim() || "";
  if (query.length > 120) return NextResponse.json({ error: "Busca muito longa." }, { status: 400 });
  if (!allowRequest(requestIp(req))) return NextResponse.json({ error: "Muitas buscas. Tente novamente em instantes." }, { status: 429, headers: { "Retry-After": "60" } });

  const cacheKey = query.toLocaleLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return NextResponse.json(hit.value, { headers: { "Cache-Control": "private, max-age=30" } });

  const curated = await curatedModels(query);
  let external: PublicModel[] = [];
  let hfAvailable = true;
  if (query.length >= 2) {
    try {
      external = await searchHuggingFace(query);
    } catch (error) {
      hfAvailable = false;
      console.warn("[models/search] Hugging Face indisponível", error);
    }
  }
  const seen = new Set(curated.map((model) => model.id));
  const models = [...curated, ...external.filter((model) => !seen.has(model.id))].slice(0, MAX_RESULTS);
  const result = { models, source: { curated: curated.length > 0, huggingFace: hfAvailable && query.length >= 2 }, honestNotice: "HF lista modelos; não testa nem certifica compatibilidade. A faixa é uma estimativa aproximada do navegador." };
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value: result });
  return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" } });
}
