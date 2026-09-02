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
  "get_routine_pro_status",
  "search_equipment",
];
const naturalLanguageGoal =
  "Create a cautious routine after a broken leg while weight-bearing clearance remains undocumented";
const orderRef = `awrp_${"b".repeat(32)}`;
const paymentRef = `0x${"c".repeat(64)}`;

const contextProjection = {
  projectionId: "gym_session_e2e",
  subjectAlias: "Passport member",
  purpose: "adaptive_gym_session",
  goals: ["Return gradually to regular activity"],
  experienceLevel: "beginner",
  preferredSessionMinutes: 40,
  preferredActivities: ["Supported strength"],
  functionalCapabilities: ["Can transfer independently"],
  movementConsiderations: [
    "Broken leg reported three months ago",
    "Weight-bearing clearance is undocumented",
  ],
  avoid: ["Do not progress lower-limb loading without documented clearance"],
  stopSignals: ["New or increasing pain", "Swelling"],
  accessibilityNeeds: [],
  sourceCategories: ["self_reported", "clinician_guidance"],
  issuedAt: "2026-09-01T09:00:00.000Z",
  expiresAt: "2026-09-01T10:00:00.000Z",
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
  quoteValidUntil: "2026-09-01T09:15:00.000Z",
  quoteDigest: "a".repeat(64),
};

const proposedRoutine = {
  title: "Mateo cautious return-to-activity draft",
  durationMinutes: 28,
  exercises: [
    {
      equipmentId: "scifit_pro2_total_body",
      durationMinutes: 8,
      intensity: "easy",
      instructions: [
        "Ask staff to configure the removable seat before beginning.",
        "Use a smooth upper-body-dominant motion and stop before fatigue.",
      ],
      adaptationReason:
        "Keeps the opening block seated and adjustable while lower-limb loading clearance remains undocumented.",
    },
    {
      equipmentId: "lf_insignia_row",
      durationMinutes: 8,
      intensity: "easy",
      instructions: [
        "Set the chest support and seat before selecting resistance.",
        "Use a comfortable range and finish while repetitions remain easy.",
      ],
      adaptationReason:
        "Adds supported upper-body work without claiming that weight-bearing activity is cleared.",
    },
  ],
  warmup: ["Review all stop signals and equipment exits with Gym staff."],
  cooldown: ["Finish seated and reassess pain or swelling before standing."],
  safetyNotes: ["Do not interpret this draft as medical clearance."],
  requiresExpertReview: true,
  expertReviewReason:
    "The recent leg fracture and undocumented weight-bearing clearance require physician or qualified physical-therapist review.",
} as const;

const generatedRoutine = {
  id: "session_e2e_routine",
  projectionId: contextProjection.projectionId,
  title: proposedRoutine.title,
  goal: naturalLanguageGoal,
  templateId: "webmcp_agent_generated",
  templateVersion: "1.0",
  generationMode: "agent_generated",
  createdVia: "webmcp",
  catalogVersion: "verified-2026-08-29",
  durationMinutes: proposedRoutine.durationMinutes,
  status: "draft",
  exercises: [
    {
      ...proposedRoutine.exercises[0],
      name: "PRO2 Total Body Exerciser",
    },
    {
      ...proposedRoutine.exercises[1],
      name: "Insignia Series Row",
    },
  ],
  warmup: proposedRoutine.warmup,
  cooldown: proposedRoutine.cooldown,
  safetyNotes: [
    ...contextProjection.stopSignals,
    ...proposedRoutine.safetyNotes,
    "AI-generated personalized draft. A physician or qualified physical therapist should review and approve this routine before it is performed.",
  ],
  requiresExpertReview: true,
  expertReviewReason: proposedRoutine.expertReviewReason,
  decisionTrace: [
    "The user-selected external agent generated the exercise content; Adaptive Gym called no AI model.",
    "Verified both equipment IDs against the current Gym catalog.",
  ],
  createdAt: "2026-09-01T09:02:00.000Z",
} as const;

type StubMode = "fulfilled" | "pending";

async function installRoutineApiStubs(
  page: Page,
  mode: StubMode = "fulfilled",
): Promise<Array<Record<string, unknown>>> {
  const agentPayBodies: Array<Record<string, unknown>> = [];
  let status: Record<string, unknown> = {
    entitled: false,
    entitlementGranted: false,
    canResume: false,
    routineSaved: false,
  };

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
  await page.route("**/api/commerce/routine-pro/status**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: status, requestId: "request-e2e-status" }),
    }),
  );
  await page.route("**/api/commerce/routine-pro/agent-pay", async (route) => {
    const requestBody = (await route.request().postDataJSON()) as Record<string, unknown>;
    agentPayBodies.push(requestBody);
    if (mode === "pending") {
      status = {
        entitled: false,
        entitlementGranted: false,
        orderRef,
        orderStatus: "payment_submitted",
        amountMinor: 499,
        currency: "usd",
        provider: "mpp_tempo",
        payerLabel: "Adaptive World demo agent",
        sandbox: true,
        submittedAt: "2026-09-01T09:03:00.000Z",
        canResume: false,
        routineSaved: false,
        routine: generatedRoutine,
        initialGoal: naturalLanguageGoal,
      };
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: {
            code: "ORDER_PENDING",
            message: "Payment outcome is pending.",
            retryable: true,
          },
          requestId: "request-e2e-agent-pay",
        }),
      });
      return;
    }

    status = {
      entitled: true,
      entitlementGranted: true,
      orderRef,
      orderStatus: "fulfilled",
      amountMinor: 499,
      currency: "usd",
      provider: "mpp_tempo",
      payerLabel: "Adaptive World demo agent",
      sandbox: true,
      submittedAt: "2026-09-01T09:03:00.000Z",
      paidAt: "2026-09-01T09:03:03.000Z",
      fulfilledAt: "2026-09-01T09:03:04.000Z",
      providerPaymentRef: paymentRef,
      canResume: false,
      routineSaved: true,
      routine: generatedRoutine,
      savedRoutineRef: "00000000-0000-4000-8000-000000000008",
      initialGoal: naturalLanguageGoal,
    };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: status,
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
      body: JSON.stringify({ active: true, projection: contextProjection }),
    });
  });
  await page.route("**/api/session", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ session: null }) }),
  );
  await page.route("**/api/commerce/routine-pro/status**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { entitled: false },
        requestId: "request-e2e-status",
      }),
    }),
  );

  await page.goto(`${gymBaseUrl}/passport`, { waitUntil: "domcontentloaded" });
  await expect
    .poll(() => activeModelContextToolNames(page))
    .toEqual(["get_active_context", "get_gym_profile", "get_routine_pro_status"]);

  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect.poll(() => activeModelContextToolNames(page)).toEqual(["get_gym_profile"]);
  expect(disconnectRequests).toBe(1);
});

test("free equipment search updates the existing catalog and keeps output bounded", async ({
  page,
}) => {
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
});

test("equipment read opens the authoritative existing detail route", async ({ page }) => {
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

test("declining the complete exact-routine confirmation makes no payment request", async ({
  page,
}) => {
  const agentPayBodies = await installRoutineApiStubs(page);
  await page.goto(`${gymBaseUrl}/session`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => activeModelContextToolNames(page)).toEqual(sessionTools);

  const invocation = invokeModelContextTool(page, "create_personalized_routine", {
    goal: naturalLanguageGoal,
    routine: proposedRoutine,
  });
  const declined = expect(invocation).rejects.toThrow("The action was declined.");

  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("heading")).toHaveText(
    "Approve this exact routine and sandbox payment?",
  );
  await expect(dialog).toContainText(proposedRoutine.title);
  await expect(dialog).toContainText("Weight-bearing clearance is undocumented");
  await expect(dialog).toContainText("PRO2 Total Body Exerciser");
  await expect(dialog).toContainText("Insignia Series Row");
  await expect(dialog).toContainText("$4.99 test USD");
  await expect(dialog).toContainText("Adaptive World demo agent wallet");
  await expect(dialog).toContainText("MPP / Tempo testnet");
  await expect(dialog).toContainText(
    "A physician or qualified physical therapist should review and approve this routine",
  );
  await expect(dialog).toContainText("Save this exact routine to Passport");
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await declined;
  expect(agentPayBodies).toHaveLength(0);
});

test("approving executes the exact routine once and displays the fulfilled receipt", async ({
  page,
}) => {
  const agentPayBodies = await installRoutineApiStubs(page);
  await page.goto(`${gymBaseUrl}/session`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => activeModelContextToolNames(page)).toEqual(sessionTools);

  const offerOutput = await invokeModelContextTool(page, "get_routine_pro_offer", {});
  expect(JSON.parse(String(offerOutput))).toMatchObject({
    ok: true,
    data: {
      amountMinor: 499,
      currency: "usd",
      sandbox: true,
      recommendedFlow: {
        understand: "get_active_context",
        generate: "Generate a new structured routine in the external agent context",
        recover: "get_routine_pro_status — read-only; never repeat a payment after timeout",
      },
    },
  });

  const invocation = invokeModelContextTool(page, "create_personalized_routine", {
    goal: naturalLanguageGoal,
    routine: proposedRoutine,
  });
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: "Approve exact routine and agent payment" }).click();
  const output = await invocation;

  expect(agentPayBodies).toHaveLength(1);
  expect(agentPayBodies[0]).toEqual({
    goal: naturalLanguageGoal,
    routine: proposedRoutine,
    paymentMode: "agent_wallet",
    initiatedVia: "webmcp",
    quoteValidUntil: routineProOffer.quoteValidUntil,
    quoteDigest: routineProOffer.quoteDigest,
  });
  expect(JSON.parse(String(output))).toMatchObject({
    ok: true,
    data: {
      created: true,
      savedToPassport: true,
      orderRef,
      orderStatus: "fulfilled",
      providerPaymentRef: paymentRef,
      entitlementGranted: true,
      routineSaved: true,
      savedRoutineRef: "00000000-0000-4000-8000-000000000008",
      routine: {
        title: proposedRoutine.title,
        generationMode: "agent_generated",
        createdVia: "webmcp",
        requiresExpertReview: true,
      },
    },
  });
  await expect(page.getByRole("heading", { name: proposedRoutine.title })).toBeVisible();
  await expect(page.getByText("Agent-generated via WebMCP", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payment confirmed" })).toBeVisible();
  await expect(page.getByText(paymentRef, { exact: true })).toBeVisible();
  await expect(page.getByText("Saved to Passport ✓", { exact: false })).toBeVisible();
  await expect(page.getByText("Yes", { exact: true })).toHaveCount(2);
  await expect(page.getByText(/AI-generated personalized draft/u).first()).toBeVisible();
});

test("an uncertain paid mutation recovers through read-only status and never pays twice", async ({
  page,
}) => {
  const agentPayBodies = await installRoutineApiStubs(page, "pending");
  await page.goto(`${gymBaseUrl}/session`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => activeModelContextToolNames(page)).toEqual(sessionTools);

  const first = invokeModelContextTool(page, "create_personalized_routine", {
    goal: naturalLanguageGoal,
    routine: proposedRoutine,
  });
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Approve exact routine and agent payment" })
    .click();
  await expect(first).rejects.toThrow(
    "Payment confirmation is being recovered. We will not submit another payment.",
  );
  expect(agentPayBodies).toHaveLength(1);

  const statusOutput = await invokeModelContextTool(page, "get_routine_pro_status", {
    orderRef,
  });
  expect(JSON.parse(String(statusOutput))).toMatchObject({
    ok: true,
    data: {
      orderRef,
      orderStatus: "payment_submitted",
      amountMinor: 499,
      currency: "usd",
      provider: "mpp_tempo",
      payerLabel: "Adaptive World demo agent",
      sandbox: true,
      entitlementGranted: false,
      routineSaved: false,
      terminal: false,
      recoveryInstruction:
        "Payment confirmation is being recovered. Do not submit another payment. Poll this read-only status tool only while the order remains non-terminal.",
    },
  });

  await expect(
    invokeModelContextTool(page, "create_personalized_routine", {
      goal: naturalLanguageGoal,
      routine: proposedRoutine,
    }),
  ).rejects.toThrow("Payment confirmation is being recovered. We will not submit another payment.");
  expect(agentPayBodies).toHaveLength(1);
  await expect(
    page.getByText("Payment confirmation is being recovered", { exact: false }).first(),
  ).toBeVisible();
});
