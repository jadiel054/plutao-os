import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { magicLinkTokens } from "@plutao/db";

export const runtime = "nodejs";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
    }

    const token = randomBytes(32).toString("hex");
    const now = new Date();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const db = getDb();
    await db.insert(magicLinkTokens).values({
      email,
      token,
      expiresAt,
      createdAt: now,
    });

    const baseUrl = process.env.APP_URL || req.nextUrl.origin;
    const magicLinkUrl = `${baseUrl}/api/auth/magic-link/verify?token=${token}`;

    const resendApiKey = process.env.RESEND_API_KEY;

    if (resendApiKey) {
      try {
        const mailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Plutão <no-reply@plutao.ai>",
            to: [email],
            subject: "Seu link de acesso ao Plutão",
            html: `<div style="font-family: sans-serif; padding: 20px;">
              <h2>Acessar o Plutão</h2>
              <p>Clique no botão abaixo para entrar na sua conta. Este link expira em 15 minutos.</p>
              <a href="${magicLinkUrl}" style="display: inline-block; background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Entrar no Plutão</a>
              <p style="margin-top: 20px; font-size: 12px; color: #666;">Se você não solicitou este e-mail, pode ignorá-lo com segurança.</p>
            </div>`,
          }),
        });

        if (!mailRes.ok) {
          console.error("[magic-link/request] Resend API error:", await mailRes.text());
        }
      } catch (mailErr) {
        console.error("[magic-link/request] Error sending email via Resend:", mailErr);
      }
    } else {
      console.log(`[MAGIC LINK DEV LOG] Email for ${email}: ${magicLinkUrl}`);
    }

    return NextResponse.json({
      message: "Se o e-mail estiver correto, um link de acesso foi enviado para sua caixa de entrada.",
      devMagicLink: process.env.NODE_ENV !== "production" && !resendApiKey ? magicLinkUrl : undefined,
    });
  } catch (err) {
    console.error("[magic-link/request] Unexpected error:", err);
    return NextResponse.json({ error: "Falha ao solicitar link de acesso" }, { status: 500 });
  }
}
