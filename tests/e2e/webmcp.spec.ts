import { expect, test, type Page } from "@playwright/test";

import {
  activeModelContextToolNames,
  installModelContextShim,
  invokeModelContextTool,
  modelContextSnapshot,
} from "./model-context-shim";

const gymBaseUrl = process.env.GYM_BASE_URL ?? "http://127.0.0.1:3001";
const publicCatalogTools = ["get_equipment", "get_gym_profile", "search_equipment"];
const sessionTools = [
  "create_personalized_routine",
  "get_active_context",
  "get_equipment",
  "get_gym_profile",
  "get_routine_pro_offer",
  "search_equipment",
];

const contextProjection = {
  projectionId: "gym_session_e2e",
  subjectAlias: "Passport member",
  purpose: "adaptive_gym_session",
  goals: ["Build a safe first-visit routine"],
  experienceLevel: "beginner",
  preferredSessionMinutes: 40,
  preferredActivities: ["Low-impact cardio"],
  functionalCapabilities: ["120 weekly activity minutes reported"],
  movementConsiderations: ["Prefer gradual progression"],
  avoid: [],
  stopSignals: ["Stop for chest pain"],
  accessibilityNeeds: ["Prefer seated setup"],
  sourceCategories: ["self_reported", "clinician_guidance"],
  issuedAt: "2026-08-29T09:00:00.000Z",
  expiresAt: "2026-08-29T10:00:00.000Z",
  synthetic: true,
};

const routineProOffer = {
  productKey: "adaptive_world.routine_pro.v1",
  displayName: "Adaptive Routine Pro",
  amountMinor: 499,
  currency: "usd",
  sandbox: true,
  entitled: false,
  supportedModes: ["human_checkout", "agent_wallet"],
  quoteValidUntil: "2026-08-29T09:15:00.000Z",
  quoteDigest: "a".repeat(64),
};

const generatedRoutine = {
  id: "session_e2e_routine",
  projectionId: contextProjection.projectionId,
  title: "Low-impact first visit",
  goal: "A gradual, equipment-grounded introduction",
  templateId: "low_impact_orientation",
  templateVersion: "1.0",
  createdVia: "webmcp",
  catalogVersion: "verified-2026-08-27",
  durationMinutes: 40,
  status: "draft",
  exercises: [
    {
      equipmentId: "lf_integrity_recumbent",
      name: "Integrity+ Recumbent Lifecycle",
      durationMinutes: 10,
      intensity: "easy",
      instructions: ["Ask staff to review the step-through entry before starting."],
      adaptationReason: "Provides a seated, low-impact introduction.",
    },
  ],
  safetyNotes: ["Stop and seek help for chest pain."],
  decisionTrace: [
    "Read the active minimum Gym projection.",
    "Selected a published template and verified every station.",
  ],
  createdAt: "2026-08-29T09:02:00.000Z",
};

async function installRoutineApiStubs(page: Page): Promise<Array<Record<string, unknown>>> {
  const agentPayBodies: Array<Record<string, unknown>> = [];
  await page.route("**/api/context/current", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ active: true, projection: contextProjection }),
    }),
  );
  await page.route("**/api/session", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ session: null }) }),
  );
  await page.route("**/api/commerce/routine-pro/offer", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: routineProOffer, requestId: "request-e2e-offer" }),
    }),
  );
  await page.route("**/api/commerce/routine-pro/agent-pay", async (route) => {
    agentPayBodies.push((await route.request().postDataJSON()) as Record<string, unknown>);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { session: generatedRoutine, savedRoutineRef: "routine-e2e-1" },
        requestId: "request-e2e-agent-pay",
      }),
    });
  });
  return agentPayBodies;
}

test.beforeEach(async ({ page }) => {
  await installModelContextShim(page);
});

test("public Gym registers only free catalog tools and cleans up route registrations", async ({
  page,
}) => {
  await page.goto(`${gymBaseUrl}/equipment`, { waitUntil: "domcontentloaded" });

  await expect.poll(() => activeModelContextToolNames(page)).toEqual(publicCatalogTools);
  const before = await modelContextSnapshot(page);
  expect(before.activeTools.every(({ registrationSignal }) => registrationSignal)).toBe(true);
  expect(
    Object.fromEntries(before.activeTools.map(({ name, annotations }) => [name, annotations])),
  ).toEqual({
    get_equipment: { readOnlyHint: true, untrustedContentHint: true },
    get_gym_profile: { readOnlyHint: true, untrustedContentHint: false },
    search_equipment: { readOnlyHint: true, untrustedContentHint: true },
  });
  const priorRegistrationIds = new Set(before.activeTools.map(({ id }) => id));

  await page.getByRole("link", { name: "Adaptive Gym" }).click();
  await expect(page).toHaveURL(`${gymBaseUrl}/`);
  await expect.poll(() => activeModelContextToolNames(page)).toEqual(publicCatalogTools);

  const after = await modelContextSnapshot(page);
  const unregisteredIds = new Set(after.unregistrations.map(({ id }) => id));
  expect([...priorRegistrationIds].every((id) => unregisteredIds.has(id))).toBe(true);
  expect(after.activeTools.every(({ id }) => !priorRegistrationIds.has(id))).toBe(true);
});

test("disconnect unregisters protected Gym tools without a reload", async ({ page }) => {
  let disconnectRequests = 0;
  await page.route("**/api/context/current", async (route) => {
    if (route.request().method() === "DELETE") {
      disconnectRequests += 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ disconnected: true, revoked: true }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        active: true,
        projection: contextProjection,
        scopes: ["gym.context.read"],
      }),
    });
  });
  await page.route("**/api/session", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ session: null }) }),
  );

  await page.goto(`${gymBaseUrl}/passport`, { waitUntil: "domcontentloaded" });
  await expect
    .poll(() => activeModelContextToolNames(page))
    .toEqual(["get_active_context", "get_gym_profile"]);

  await page.getByRole("button", { name: "Disconnect" }).click();

  await expect.poll(() => activeModelContextToolNames(page)).toEqual(["get_gym_profile"]);
  await expect(page).toHaveURL(`${gymBaseUrl}/passport`);
  expect(disconnectRequests).toBe(1);
});

test("a shim-invoked free equipment search updates the existing catalog UI", async ({ page }) => {
  await page.goto(`${gymBaseUrl}/equipment`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => activeModelContextToolNames(page)).toEqual(publicCatalogTools);

  const output = await invokeModelContextTool(page, "search_equipment", {
    query: "rower",
    limit: 10,
  });

  expect(typeof output).toBe("string");
  expect(String(output).length).toBeLessThanOrEqual(1_500);
  expect(JSON.parse(String(output))).toMatchObject({ ok: true, data: { count: 1 } });
  await expect(page.getByPlaceholder("Search by machine, goal or movement…")).toHaveValue("rower");
  await expect(page.getByText("Heat Row", { exact: true })).toBeVisible();
  await expect(page.locator(".results-summary strong")).toHaveText("1");

  const snapshot = await modelContextSnapshot(page);
  expect(snapshot.invocations).toEqual([
    expect.objectContaining({ tool: "search_equipment", input: { query: "rower", limit: 10 } }),
  ]);
});

test("a manufacturer query returns the same count shown in the existing catalog", async ({
  page,
}) => {
  await page.goto(`${gymBaseUrl}/equipment`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => activeModelContextToolNames(page)).toEqual(publicCatalogTools);

  const output = await invokeModelContextTool(page, "search_equipment", {
    query: "Life Fitness",
    limit: 1,
  });

  expect(JSON.parse(String(output))).toMatchObject({
    ok: true,
    data: { count: 9, returned: 1, truncated: true },
  });
  await expect(page.getByPlaceholder("Search by machine, goal or movement…")).toHaveValue(
    "Life Fitness",
  );
  await expect(page.locator(".results-summary strong")).toHaveText("9");
  await expect(page.locator(".equipment-card")).toHaveCount(9);
});

test("canonical natural-language searches stay grounded in the visible catalog", async ({
  page,
}) => {
  await page.goto(`${gymBaseUrl}/equipment`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => activeModelContextToolNames(page)).toEqual(publicCatalogTools);

  const matchingOutput = await invokeModelContextTool(page, "search_equipment", {
    query: "low impact accessible equipment",
    limit: 1,
  });
  expect(JSON.parse(String(matchingOutput))).toMatchObject({
    ok: true,
    data: { count: 2, returned: 1, truncated: true },
  });
  await expect(page.locator(".results-summary strong")).toHaveText("2");
  await expect(page.locator(".equipment-card")).toHaveCount(2);

  const unavailableOutput = await invokeModelContextTool(page, "search_equipment", {
    query: "anti-gravity treadmill",
    limit: 1,
  });
  expect(JSON.parse(String(unavailableOutput))).toMatchObject({
    ok: true,
    data: { count: 0, returned: 0, truncated: false, equipment: [] },
  });
  await expect(page.locator(".results-summary strong")).toHaveText("0");
  await expect(page.getByRole("heading", { name: "No exact matches" })).toBeVisible();
});

test("a shim-invoked equipment read opens the existing detail route", async ({ page }) => {
  await page.goto(`${gymBaseUrl}/equipment`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => activeModelContextToolNames(page)).toEqual(publicCatalogTools);

  const output = await invokeModelContextTool(page, "get_equipment", {
    equipmentId: "lf_heat_row",
  });

  expect(typeof output).toBe("string");
  expect(String(output).length).toBeLessThanOrEqual(1_500);
  await expect(page).toHaveURL(`${gymBaseUrl}/equipment/life-fitness-heat-row`);
  await expect(page.getByRole("heading", { name: "Heat Row" })).toBeVisible();
});

test("tool output remains bounded and exact invocation input is recorded", async ({ page }) => {
  await page.goto(`${gymBaseUrl}/equipment`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => activeModelContextToolNames(page)).toEqual(publicCatalogTools);

  const output = await invokeModelContextTool(page, "search_equipment", { limit: 20 });
  expect(typeof output).toBe("string");
  expect(String(output).length).toBeLessThanOrEqual(1_500);
  expect(JSON.parse(String(output))).toMatchObject({
    ok: false,
    error: { code: "OUTPUT_TOO_LARGE" },
  });

  const snapshot = await modelContextSnapshot(page);
  expect(snapshot.invocations.at(-1)).toEqual(
    expect.objectContaining({ tool: "search_equipment", input: { limit: 20 }, output }),
  );
});

test("declining the exact Routine Pro confirmation makes no payment request", async ({ page }) => {
  const agentPayBodies = await installRoutineApiStubs(page);
  await page.goto(`${gymBaseUrl}/session`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => activeModelContextToolNames(page)).toEqual(sessionTools);

  const invocation = invokeModelContextTool(page, "create_personalized_routine", {
    templateId: "low_impact_orientation",
    paymentMode: "agent_wallet",
  });
  const declined = expect(invocation).rejects.toThrow("The action was declined.");

  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("$4.99 test USD");
  await expect(dialog).toContainText("Adaptive World demo agent");
  await expect(dialog).toContainText("Unchanged; no additional health fields");
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await declined;
  expect(agentPayBodies).toHaveLength(0);
});

test("approving Routine Pro executes once and fills the existing planner", async ({ page }) => {
  const agentPayBodies = await installRoutineApiStubs(page);
  await page.goto(`${gymBaseUrl}/session`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => activeModelContextToolNames(page)).toEqual(sessionTools);

  const invocation = invokeModelContextTool(page, "create_personalized_routine", {
    templateId: "low_impact_orientation",
    paymentMode: "agent_wallet",
  });
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("heading")).toHaveText("Create and save your personalized routine");
  await dialog.getByRole("button", { name: "Approve agent payment" }).click();
  const output = await invocation;

  expect(agentPayBodies).toHaveLength(1);
  expect(agentPayBodies[0]).toEqual({
    templateId: "low_impact_orientation",
    paymentMode: "agent_wallet",
    initiatedVia: "webmcp",
    quoteValidUntil: routineProOffer.quoteValidUntil,
    quoteDigest: routineProOffer.quoteDigest,
  });
  expect(JSON.parse(String(output))).toMatchObject({
    ok: true,
    data: { created: true, savedToPassport: true, savedRoutineRef: "routine-e2e-1" },
  });
  await expect(page.getByRole("heading", { name: generatedRoutine.title })).toBeVisible();
  await expect(page.getByText("Saved to Passport ✓", { exact: false })).toBeVisible();
});

test("a cancelled human return exposes one locked resume path with its payer", async ({ page }) => {
  await installRoutineApiStubs(page);
  const orderRef = `awrp_${"b".repeat(32)}`;
  await page.route("**/api/commerce/routine-pro/status**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          entitled: false,
          orderRef,
          orderStatus: "provider_pending",
          payerLabel: "Human test checkout",
          canResume: true,
          initialTemplateId: "first_visit_foundations",
        },
        requestId: "request-e2e-status",
      }),
    }),
  );

  await page.goto(`${gymBaseUrl}/session?routinePro=cancelled&order=${orderRef}`, {
    waitUntil: "domcontentloaded",
  });

  await expect(page.getByRole("heading", { name: "Payment already in progress" })).toBeVisible();
  await expect(page.getByText("Human test checkout", { exact: true })).toBeVisible();
  await expect(page.getByText("Ready to resume", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume human test checkout" }).click();

  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("heading")).toHaveText("Resume your existing payment");
  await expect(dialog.getByText("Human test checkout", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Resume secure test checkout" })).toBeVisible();
  await expect(dialog.getByRole("radio")).toHaveCount(0);
});
