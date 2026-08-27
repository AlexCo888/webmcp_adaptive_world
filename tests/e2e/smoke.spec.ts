import { expect, test } from "@playwright/test";

const surfaces = [
  {
    name: "Passport",
    url: process.env.PASSPORT_BASE_URL ?? "http://127.0.0.1:3000",
  },
  {
    name: "Gym",
    url: process.env.GYM_BASE_URL ?? "http://127.0.0.1:3001",
  },
];

for (const surface of surfaces) {
  test(`${surface.name} renders a usable HTML surface`, async ({ page }) => {
    const response = await page.goto(surface.url, { waitUntil: "domcontentloaded" });

    expect(response, `${surface.name} did not return a document response`).not.toBeNull();
    expect(response!.status(), `${surface.name} returned a server error`).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();

    const bodyText = (await page.locator("body").innerText()).trim();
    expect(bodyText.length, `${surface.name} rendered an empty body`).toBeGreaterThan(40);
    await expect(page.locator('main, [role="main"]')).toHaveCount(1);
  });
}

test("Passport exposes an honest WebMCP registry inspector", async ({ page }) => {
  const passportBaseUrl = process.env.PASSPORT_BASE_URL ?? "http://127.0.0.1:3000";
  await page.goto(`${passportBaseUrl}/tools`);
  await expect(page.getByRole("heading", { name: "WebMCP tool registry" })).toBeVisible();
  await expect(page.getByText(/WebMCP API unavailable|WebMCP is active/)).toBeVisible();
  await expect(page.getByText("get_my_passport_summary", { exact: true })).toBeVisible();
});

test("Gym redeems context once and creates a catalog-grounded session", async ({ request }) => {
  const gymBaseUrl = process.env.GYM_BASE_URL ?? "http://127.0.0.1:3001";
  const catalogResponse = await request.get(`${gymBaseUrl}/api/equipment`);
  expect(catalogResponse.ok()).toBeTruthy();
  const catalog = (await catalogResponse.json()) as {
    count: number;
    equipment: Array<{ id: string }>;
  };
  expect(catalog.count).toBe(68);

  const firstRedemption = await request.post(`${gymBaseUrl}/api/context/redeem`, {
    data: { code: "demo-michael" },
  });
  expect(firstRedemption.status()).toBe(200);
  const redeemed = (await firstRedemption.json()) as {
    projection: Record<string, unknown>;
  };
  expect(redeemed.projection).not.toHaveProperty("passportId");
  expect(redeemed.projection).not.toHaveProperty("medications");
  expect(redeemed.projection).not.toHaveProperty("notableResults");

  const replay = await request.post(`${gymBaseUrl}/api/context/redeem`, {
    data: { code: "demo-michael" },
  });
  expect(replay.status()).toBe(409);

  const sessionResponse = await request.post(`${gymBaseUrl}/api/session`, {
    data: {
      profile: redeemed.projection,
      goal: "General strength and mobility",
      durationMinutes: 45,
      equipmentIds: [],
    },
  });
  expect(sessionResponse.status()).toBe(201);
  const result = (await sessionResponse.json()) as {
    session: { exercises: Array<{ equipmentId: string }> };
  };
  const catalogIds = new Set(catalog.equipment.map(({ id }) => id));
  expect(result.session.exercises.length).toBeGreaterThan(0);
  expect(result.session.exercises.every(({ equipmentId }) => catalogIds.has(equipmentId))).toBe(
    true,
  );
});
