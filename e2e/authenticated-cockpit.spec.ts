import { test, expect } from "@playwright/test";

test("usuário autenticado cria e abre uma missão no Cockpit", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  test.skip(!email || !password, "E2E_EMAIL e E2E_PASSWORD não configurados");
  const objective = `E2E smoke ${Date.now()}`;
  let missionId: string | null = null;

  try {
    await page.goto("/login");

    // Seletores estáveis: ids do formulário de senha (não getByLabel — o botão
    // "Entrar sem senha" competia com o label por substring).
    const emailInput = page.locator("#login-email");
    const passwordInput = page.locator("#login-password");
    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    await emailInput.fill(email!);
    await passwordInput.fill(password!);
    await page.getByRole("button", { name: "Entrar com e-mail" }).click();

    await expect(page).toHaveURL(/\/cockpit/);

    const objectiveField = page.getByPlaceholder("Descreva o objetivo principal da missão...");
    await expect(objectiveField).toBeVisible();
    await objectiveField.fill(objective);
    await page.getByRole("button", { name: "Criar Missão" }).click();
    await expect(page.getByText(objective)).toBeVisible();
    await page.getByText(objective).click();
    await expect(page.getByText("CICLO DE VIDA DA MISSÃO")).toBeVisible();

    const missions = await page.request.get("/api/missions");
    if (missions.ok()) {
      const data = await missions.json();
      const created = (data.missions ?? []).find(
        (mission: { objective?: string; id?: string }) => mission.objective === objective,
      );
      missionId = created?.id ?? null;
    }
  } finally {
    if (missionId) {
      await page.request.delete(`/api/missions/${missionId}`);
    }
  }
});
