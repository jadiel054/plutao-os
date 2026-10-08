import { test, expect } from "@playwright/test";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("usuário autenticado cria e abre uma missão no Cockpit", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  test.skip(!email || !password, "E2E_EMAIL e E2E_PASSWORD não configurados");

  const objective = `E2E smoke ${Date.now()}`;
  const objectivePattern = new RegExp(escapeRegExp(objective));
  let missionId: string | null = null;

  try {
    // --- Login (ids estáveis do formulário de senha) ---
    await page.goto("/login");
    const emailInput = page.locator("#login-email");
    const passwordInput = page.locator("#login-password");
    await expect(emailInput).toBeVisible({ timeout: 15_000 });
    await expect(passwordInput).toBeVisible({ timeout: 15_000 });
    await emailInput.fill(email!);
    await passwordInput.fill(password!);
    await page.getByRole("button", { name: "Entrar com e-mail" }).click();
    await expect(page).toHaveURL(/\/cockpit/, { timeout: 20_000 });

    // --- Criar missão e esperar aparecer na lista ---
    const objectiveField = page.getByPlaceholder("Descreva o objetivo principal da missão...");
    await expect(objectiveField).toBeVisible({ timeout: 15_000 });
    await objectiveField.fill(objective);

    const createButton = page.getByRole("button", { name: "Criar Missão" });
    await expect(createButton).toBeEnabled();
    await createButton.click();

    // Card da lista é um <button> cujo nome acessível inclui o objetivo.
    const missionRowButton = page.getByRole("button", { name: objectivePattern });
    await expect(missionRowButton).toBeVisible({ timeout: 25_000 });

    // --- Abrir detalhe e validar painéis ---
    await missionRowButton.click();

    // openMission: vários fetches em paralelo.
    const lifecycleHeading = page.getByText("CICLO DE VIDA DA MISSÃO");
    await expect(lifecycleHeading).toBeVisible({ timeout: 25_000 });

    // Asserts separados: .or() + toBeVisible falha em strict mode quando ambos existem.
    await expect(page.getByText("TIMELINE DA MISSÃO")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("EVIDÊNCIAS DA MISSÃO")).toBeVisible({ timeout: 15_000 });

    // Status no cabeçalho do ciclo (missão recém-criada).
    await expect(
      lifecycleHeading.locator("..").getByText(/CREATED|UNDERSTANDING|PLANNING/),
    ).toBeVisible({ timeout: 10_000 });

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
