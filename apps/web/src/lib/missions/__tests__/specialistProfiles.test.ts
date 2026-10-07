import { describe, expect, it } from "vitest";
import {
  getMissionSpecialistProfile,
  isToolAllowedBySpecialist,
  resolveSpecialistPolicy,
  toolCapabilityId,
} from "../specialistProfiles";
import { buildSystemPrompt } from "@/lib/runtime/model/missionPrompt";

const connectorBlock = [
  "FERRAMENTAS NATIVAS DE EXPORTAÇÃO (sempre disponíveis):",
  "- files.export_pdf: gera um PDF",
  "- files.export_markdown: gera um documento",
  "CONECTORES (fonte de verdade):",
  "- GitHub [github]: status=CONNECTED; capabilities=repo_create[write]; repos_list[read]",
  "- Vercel [vercel]: status=CONNECTED; capabilities=project_create[write]",
  "- Supabase [supabase]: status=CONNECTED; capabilities=table_read[read]",
  "- Neon [neon]: status=CONNECTED; capabilities=projects_list[read]",
  "- Stripe [stripe]: status=CONNECTED; capabilities=products_list[read]",
  "Typical site/app flow: GitHub (repo_create) → Vercel (project_create)",
].join("\n");

describe("perfis especialistas de missão", () => {
  it("expõe perfis conhecidos e falha fechado para identificadores desconhecidos", () => {
    expect(getMissionSpecialistProfile("software_engineer")?.label).toBe("Engenharia de software");
    expect(getMissionSpecialistProfile("teaching_assistant")?.label).toBe("Ensino e aprendizagem");
    expect(getMissionSpecialistProfile("unknown")).toBeNull();
  });

  it("restringe capabilities às ferramentas autorizadas pelo perfil", () => {
    expect(resolveSpecialistPolicy("software_engineer", [toolCapabilityId("github")]).ok).toBe(true);
    expect(resolveSpecialistPolicy("teaching_assistant", [toolCapabilityId("github")])).toMatchObject({
      ok: false,
      reason: "CAPABILITY_NOT_ALLOWED",
    });
    expect(resolveSpecialistPolicy(null, [toolCapabilityId("github")])).toMatchObject({
      ok: false,
      reason: "CAPABILITY_WITHOUT_PROFILE",
    });
    expect(isToolAllowedBySpecialist("teaching_assistant", [], "filesystem")).toBe(true);
    expect(isToolAllowedBySpecialist("teaching_assistant", [], "github")).toBe(false);
    expect(isToolAllowedBySpecialist("unknown", [], "note")).toBe(false);
  });

  it("filtra conectores e exemplos proibidos do prompt de ensino", () => {
    const prompt = buildSystemPrompt(null, connectorBlock, "m-1", getMissionSpecialistProfile("teaching_assistant"));
    expect(prompt).toContain("Ensino e aprendizagem");
    expect(prompt).toContain('"tool":"filesystem"');
    expect(prompt).toContain("files.export_pdf");
    expect(prompt).not.toMatch(/github|vercel|supabase|neon|stripe|repo_create|project_create/i);
  });

  it("mostra apenas o escopo de engenharia autorizado e mantém Write Gate", () => {
    const prompt = buildSystemPrompt(null, connectorBlock, "m-1", getMissionSpecialistProfile("software_engineer"));
    expect(prompt).toContain("Engenharia de software");
    expect(prompt).toContain("GitHub [github]: status=CONNECTED");
    expect(prompt).toContain("Vercel [vercel]: status=CONNECTED");
    expect(prompt).toContain("Write Gate");
    expect(prompt).not.toMatch(/telegram|cloudflare|render|supabase|neon|stripe/i);
  });
});
