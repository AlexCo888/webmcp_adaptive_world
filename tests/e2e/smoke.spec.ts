import { expect, test } from "@playwright/test";

const passportBaseUrl = process.env.PASSPORT_BASE_URL ?? "http://127.0.0.1:3000";
const gymBaseUrl = process.env.GYM_BASE_URL ?? "http://127.0.0.1:3001";

test("Passport starts at a real sign-in boundary", async ({ page }) => {
  const response = await page.goto(passportBaseUrl, { waitUntil: "domcontentloaded" });

  expect(response).not.toBeNull();
  expect(response!.status()).toBeLessThan(500);
  await expect(
    page.getByRole("heading", { name: "A Passport belongs to a person—not to a clinic or a gym." }),
  ).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("mateo.demo@adaptiveworld.test");
  await expect(page.getByRole("button", { name: "Sign in securely" })).toBeVisible();
  await expect(page.getByText("Real authentication", { exact: true })).toBeVisible();
});

test("Gym looks and behaves like a public club site before context is connected", async ({
  page,
}) => {
  const response = await page.goto(gymBaseUrl, { waitUntil: "domcontentloaded" });

  expect(response).not.toBeNull();
  expect(response!.status()).toBeLessThan(500);
  await expect(page.getByRole("heading", { name: /Your first visit/ })).toBeVisible();
  const hero = page.getByAltText(
    "Sunlit gym interior with members using a cable row, treadmill, kettlebell, and squat rack",
  );
  await expect(hero).toBeVisible();
  await expect
    .poll(() => hero.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(600);
  await expect(page.getByText("12", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Tour the equipment/ })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Plan a visit without an account." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hours & services" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accessibility" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ground rules" })).toBeVisible();
  await expect(page.getByText("Generic sample · Free", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "First-visit equipment foundations" }),
  ).toBeVisible();
});

test("public Gym profile API and accessible UI use the same operating facts", async ({
  page,
  request,
}) => {
  const profileResponse = await request.get(`${gymBaseUrl}/api/gym-profile`);
  expect(profileResponse.ok()).toBeTruthy();
  const profile = (await profileResponse.json()) as {
    ok: true;
    data: { hours: string; services: string[]; accessFeatures: string[]; rules: string[] };
  };

  await page.goto(gymBaseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(profile.data.hours, { exact: true }).last()).toBeVisible();
  for (const fact of [
    ...profile.data.services,
    ...profile.data.accessFeatures,
    ...profile.data.rules,
  ]) {
    await expect(page.getByText(fact, { exact: true })).toBeVisible();
  }
});

test("Gym exposes only verified products and refuses context-free walkthrough creation", async ({
  request,
}) => {
  const catalogResponse = await request.get(`${gymBaseUrl}/api/equipment`);
  expect(catalogResponse.ok()).toBeTruthy();
  const catalog = (await catalogResponse.json()) as {
    ok: true;
    data: {
      count: number;
      equipment: Array<{
        id: string;
        verifiedProduct: boolean;
        sourceUrl: string;
        syntheticFacilityInventory: boolean;
      }>;
    };
    requestId: string;
  };

  expect(catalog.ok).toBe(true);
  expect(catalog.data.count).toBe(12);
  expect(new Set(catalog.data.equipment.map(({ id }) => id)).size).toBe(12);
  expect(catalog.data.equipment.every(({ verifiedProduct }) => verifiedProduct)).toBe(true);
  expect(catalog.data.equipment.every(({ sourceUrl }) => sourceUrl.startsWith("https://"))).toBe(
    true,
  );
  expect(
    catalog.data.equipment.every(({ syntheticFacilityInventory }) => syntheticFacilityInventory),
  ).toBe(true);

  const sessionResponse = await request.post(`${gymBaseUrl}/api/routines/personalized`, {
    headers: { origin: gymBaseUrl },
    data: {
      templateId: "first_visit_foundations",
      initiatedVia: "site-ui",
      quoteValidUntil: "2026-08-29T10:00:00.000Z",
      quoteDigest: "a".repeat(64),
    },
  });
  expect(sessionResponse.status()).toBe(401);
  await expect(sessionResponse.json()).resolves.toMatchObject({
    ok: false,
    error: {
      code: "CONTEXT_REQUIRED",
      message: "Connect a one-use Passport context before continuing.",
      retryable: false,
    },
  });
});

test("Gym explains WebMCP provenance instead of claiming a fake AI routine", async ({ page }) => {
  await page.goto(`${gymBaseUrl}/session`, { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Build with what’s actually here." }),
  ).toBeVisible();
  await expect(page.getByText(/does not ask an AI to invent a routine/i)).toBeVisible();
  await expect(page.getByText("Passport context required")).toBeVisible();
});
