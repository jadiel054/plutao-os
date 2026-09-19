import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { put } from "@vercel/blob";
import { artifacts } from "@plutao/db";
import { getDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth/session";
import { detectArtifactType, suggestArtifactName } from "@/lib/artifacts";
import { extractTextFromPdf, extractTextFromExcel } from "@/lib/documentParser";

export const runtime = "nodejs";

const MAX_JSON_ARTIFACT_SIZE = 5 * 1024 * 1024;
const MAX_FILE_UPLOAD_SIZE = 20 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") || "";

  try {
    const db = getDb();

    // Multipart/form-data upload (Arquivos locais: Texto, PDF, Excel, Imagem)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const missionId = typeof formData.get("missionId") === "string" ? (formData.get("missionId") as string) : null;

      if (!file) {
        return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
      }

      if (file.size > MAX_FILE_UPLOAD_SIZE) {
        return NextResponse.json(
          { error: `Tamanho do arquivo excede o limite (máximo ${MAX_FILE_UPLOAD_SIZE / (1024 * 1024)}MB)` },
          { status: 400 }
        );
      }

      const fileName = file.name || "arquivo_anexado";
      const ext = fileName.split(".").pop()?.toLowerCase() || "";
      const detected = detectArtifactType(fileName);
      const mimeType = file.type || detected.type;

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let blobUrl: string | undefined;
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        try {
          const sanitized = fileName.replace(/[^a-zA-Z0-9_.\-]/g, "_");
          const blob = await put(`artifacts/${user.id}/${Date.now()}_${sanitized}`, arrayBuffer, {
            access: "public",
          });
          blobUrl = blob.url;
        } catch (err) {
          console.warn("[artifacts POST] Vercel Blob error:", err);
        }
      }

      let content = "";
      let isImage = false;
      let isBinary = false;
      let dataUrl: string | undefined;

      if (ext === "pdf" || mimeType === "application/pdf") {
        isBinary = true;
        const pdfText = await extractTextFromPdf(buffer);
        content = pdfText.trim() || `[Documento PDF: ${fileName}]`;
      } else if (
        ext === "xlsx" ||
        ext === "xls" ||
        mimeType.includes("spreadsheet") ||
        mimeType.includes("excel")
      ) {
        isBinary = true;
        const excelText = extractTextFromExcel(buffer);
        content = excelText.trim() || `[Planilha Excel: ${fileName}]`;
      } else if (
        mimeType.startsWith("image/") ||
        ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)
      ) {
        isImage = true;
        isBinary = true;
        dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
        content = `[Imagem anexada: ${fileName}]`;
      } else {
        // Plain text formats (.md, .txt, .csv, .html, .css, .json, .js, .ts, etc.)
        content = buffer.toString("utf-8");
      }

      const metadata: Record<string, unknown> = {
        originalName: fileName,
        mimeType,
        isBinary,
        isImage,
      };
      if (blobUrl) metadata.blobUrl = blobUrl;
      if (dataUrl) metadata.dataUrl = dataUrl;

      const [inserted] = await db
        .insert(artifacts)
        .values({
          userId: user.id,
          missionId,
          name: fileName,
          type: mimeType,
          size: file.size,
          content,
          metadata,
        })
        .returning();

      return NextResponse.json({
        artifact: {
          id: inserted.id,
          userId: inserted.userId,
          missionId: inserted.missionId,
          name: inserted.name,
          type: inserted.type,
          size: inserted.size,
          metadata: inserted.metadata,
          createdAt: inserted.createdAt,
          updatedAt: inserted.updatedAt,
        },
      });
    }

    // Standard JSON payload (Smart Long-Input / Colar texto)
    const body = await req.json().catch(() => ({}));
    const content = typeof body.content === "string" ? body.content : "";

    if (!content.trim()) {
      return NextResponse.json({ error: "Conteúdo do artifact não pode ser vazio" }, { status: 400 });
    }

    const size = Buffer.byteLength(content, "utf-8");
    if (size > MAX_JSON_ARTIFACT_SIZE) {
      return NextResponse.json(
        { error: `Tamanho do artifact excede o limite permitido (máximo ${MAX_JSON_ARTIFACT_SIZE / (1024 * 1024)}MB)` },
        { status: 400 }
      );
    }

    const rawName = typeof body.name === "string" ? body.name : undefined;
    const name = suggestArtifactName(content, rawName);
    const typeInfo = detectArtifactType(name, content);
    const type = typeof body.type === "string" && body.type.trim() ? body.type.trim() : typeInfo.type;
    const missionId = typeof body.missionId === "string" ? body.missionId : null;
    const metadata = typeof body.metadata === "object" && body.metadata !== null ? body.metadata : {};

    const [inserted] = await db
      .insert(artifacts)
      .values({
        userId: user.id,
        missionId,
        name,
        type,
        size,
        content,
        metadata,
      })
      .returning();

    return NextResponse.json({
      artifact: {
        id: inserted.id,
        userId: inserted.userId,
        missionId: inserted.missionId,
        name: inserted.name,
        type: inserted.type,
        size: inserted.size,
        metadata: inserted.metadata,
        createdAt: inserted.createdAt,
        updatedAt: inserted.updatedAt,
      },
    });
  } catch (e) {
    console.error("[artifacts POST]", e);
    return NextResponse.json({ error: "Erro interno ao criar artifact" }, { status: 500 });
  }
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: artifacts.id,
        userId: artifacts.userId,
        missionId: artifacts.missionId,
        name: artifacts.name,
        type: artifacts.type,
        size: artifacts.size,
        metadata: artifacts.metadata,
        createdAt: artifacts.createdAt,
        updatedAt: artifacts.updatedAt,
      })
      .from(artifacts)
      .where(eq(artifacts.userId, user.id))
      .orderBy(desc(artifacts.createdAt))
      .limit(50);

    return NextResponse.json({ artifacts: rows });
  } catch (e) {
    console.error("[artifacts GET]", e);
    return NextResponse.json({ error: "Erro interno ao listar artifacts" }, { status: 500 });
  }
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const db = getDb();
    await db.delete(artifacts).where(eq(artifacts.userId, user.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[artifacts DELETE]", e);
    return NextResponse.json({ error: "Erro interno ao excluir artifacts" }, { status: 500 });
  }
}
