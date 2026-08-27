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
    "Bright modern Adaptive Gym training floor with cardio and strength zones",
  );
  await expect(hero).toBeVisible();
  await expect
    .poll(() => hero.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(900);
  await expect(page.getByText("12", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Tour the equipment/ })).toBeVisible();
});

test("Gym exposes only verified products and refuses context-free walkthrough creation", async ({
  request,
}) => {
  const catalogResponse = await request.get(`${gymBaseUrl}/api/equipment`);
  expect(catalogResponse.ok()).toBeTruthy();
  const catalog = (await catalogResponse.json()) as {
    count: number;
    equipment: Array<{
      id: string;
      verifiedProduct: boolean;
      sourceUrl: string;
      syntheticFacilityInventory: boolean;
    }>;
  };

  expect(catalog.count).toBe(12);
  expect(new Set(catalog.equipment.map(({ id }) => id)).size).toBe(12);
  expect(catalog.equipment.every(({ verifiedProduct }) => verifiedProduct)).toBe(true);
  expect(catalog.equipment.every(({ sourceUrl }) => sourceUrl.startsWith("https://"))).toBe(true);
  expect(
    catalog.equipment.every(({ syntheticFacilityInventory }) => syntheticFacilityInventory),
  ).toBe(true);

  const sessionResponse = await request.post(`${gymBaseUrl}/api/session`, {
    data: { templateId: "first_visit_foundations", createdVia: "site-ui" },
  });
  expect(sessionResponse.status()).toBe(401);
  await expect(sessionResponse.json()).resolves.toEqual({
    error: "Connect a one-use Passport context before choosing a walkthrough.",
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
