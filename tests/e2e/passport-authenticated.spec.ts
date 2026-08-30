import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import {
  activeModelContextToolNames,
  installModelContextShim,
  invokeModelContextTool,
  modelContextSnapshot,
} from "./model-context-shim";

const passportBaseUrl = process.env.PASSPORT_BASE_URL ?? "http://127.0.0.1:3000";
const gymBaseUrl = process.env.GYM_BASE_URL ?? "http://127.0.0.1:3001";
const demoPassword = process.env.E2E_DEMO_PASSWORD ?? "AdaptiveWorld2026!";

const runAuthenticated = process.env.RUN_AUTHENTICATED_E2E === "true";
const allowStateMutation = process.env.ALLOW_SYNTHETIC_STATE_MUTATION === "true";
const allowDemoReset = process.env.ALLOW_SYNTHETIC_DEMO_RESET_E2E === "true";
const allowAgentPayment = process.env.ALLOW_SYNTHETIC_AGENT_PAYMENT_E2E === "true";

const naturalLanguageGoal = "Support lifelong health without bodybuilding-style muscle gain";

const ownerTools = ["get_my_passport_summary", "list_my_shares"];
const ownerSharingTools = ["create_context_grant", "list_my_shares", "revoke_access_grant"];
const doctorTools = [
  "add_clinical_guidance",
  "get_patient_overview",
  "get_patient_section",
  "open_patient_source",
  "search_my_patients",
];
const gymSessionTools = [
  "create_personalized_routine",
  "get_active_context",
  "get_equipment",
  "get_gym_profile",
  "get_routine_pro_offer",
  "search_equipment",
];

type DemoRole = "owner" | "doctor";

type SignedInActor = {
  context: BrowserContext;
  page: Page;
};

type ToolEnvelope<T> =
  { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

type PassportShare = {
  id: string;
  passportId: string;
  status: "active" | "expired" | "revoked";
  scopes: string[];
};

async function signIn(browser: Browser, role: DemoRole): Promise<SignedInActor> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await installModelContextShim(page);
  await page.goto(`${passportBaseUrl}/sign-in`, { waitUntil: "domcontentloaded" });
  await page
    .getByLabel("Email")
    .fill(role === "owner" ? "mateo.demo@adaptiveworld.test" : "elena.vargas@adaptiveworld.test");
  await page.getByLabel("Password").fill(demoPassword);

  await Promise.all([
    page.waitForURL((url) =>
      role === "owner"
        ? url.origin === new URL(passportBaseUrl).origin && url.pathname === "/"
        : url.origin === new URL(passportBaseUrl).origin && url.pathname === "/doctor",
    ),
    page.getByRole("button", { name: "Sign in securely" }).click(),
  ]);
  return { context, page };
}

function parseToolSuccess<T>(output: unknown): T {
  expect(typeof output).toBe("string");
  const envelope = JSON.parse(String(output)) as ToolEnvelope<T>;
  expect(envelope.ok).toBe(true);
  if (!envelope.ok) throw new Error(`Unexpected tool error: ${envelope.error.code}`);
  return envelope.data;
}

async function invokeAndReadError(page: Page, tool: string, input: Record<string, unknown>) {
  await invokeModelContextTool(page, tool, input).catch(() => undefined);
  const snapshot = await modelContextSnapshot(page);
  const invocation = snapshot.invocations.at(-1);
  expect(invocation).toEqual(expect.objectContaining({ tool, input }));
  expect(invocation?.error).toBeTruthy();
  return invocation?.error;
}

async function listActiveOwnerShares(context: BrowserContext): Promise<PassportShare[]> {
  const response = await context.request.post(`${passportBaseUrl}/api/webmcp`, {
    data: { tool: "list_my_shares", input: { status: "active" } },
  });
  expect(response.ok()).toBeTruthy();
  const envelope = (await response.json()) as { ok: true; data: PassportShare[] };
  expect(envelope.ok).toBe(true);
  return envelope.data;
}

async function createFullDoctorGrant(context: BrowserContext): Promise<void> {
  const response = await context.request.post(`${passportBaseUrl}/api/access-grants`, {
    data: {
      scopes: [
        "passport.summary.read",
        "passport.clinical.read",
        "passport.documents.read",
        "passport.guidance.write",
      ],
      days: 90,
    },
  });
  expect(response.status()).toBe(201);
}

async function resetSyntheticDemo(context: BrowserContext): Promise<void> {
  const response = await context.request.post(`${passportBaseUrl}/api/demo/reset`, { data: {} });
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({
    ok: true,
    data: { restored: true, restoredRelationships: 2 },
  });
}

async function connectOwnerPassportToGym(page: Page): Promise<void> {
  await page.goto(`${passportBaseUrl}/sharing`, { waitUntil: "domcontentloaded" });
  await expect.poll(() => activeModelContextToolNames(page)).toEqual(ownerSharingTools);
  const invocation = invokeModelContextTool(page, "create_context_grant", {
    recipient: "adaptive-gym",
    scopes: ["gym.context.read", "gym.feedback.write"],
    expiresInMinutes: 5,
  });
  const confirmation = page.getByRole("alertdialog", {
    name: "Share minimum context with Adaptive Gym",
  });
  await expect(confirmation).toContainText("gym.context.read, gym.feedback.write");
  await expect(confirmation).toContainText("Not shared");
  await confirmation.getByRole("button", { name: "Share with Gym" }).click();
  expect(
    parseToolSuccess<{ created: boolean; handoffStarted: boolean }>(await invocation),
  ).toMatchObject({ created: true, handoffStarted: true });
  await page.waitForURL(
    (url) => url.origin === new URL(gymBaseUrl).origin && url.pathname === "/passport",
  );
  await expect(page.getByText("One-use grant redeemed", { exact: true })).toBeVisible();
}

test.describe("authenticated Passport WebMCP release journeys", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });
  test.skip(
    !runAuthenticated,
    "Requires RUN_AUTHENTICATED_E2E=true and a migrated, seeded synthetic environment; no auth or database behavior is mocked.",
  );

  test("@authenticated owner registers only owner tools and route changes unregister them", async ({
    browser,
  }) => {
    const owner = await signIn(browser, "owner");
    try {
      await expect.poll(() => activeModelContextToolNames(owner.page)).toEqual(ownerTools);
      const summary = parseToolSuccess<{ goals: string[] }>(
        await invokeModelContextTool(owner.page, "get_my_passport_summary", {
          sections: ["goals"],
        }),
      );
      expect(summary.goals.length).toBeGreaterThan(0);
      const before = await modelContextSnapshot(owner.page);
      expect(before.activeTools.every(({ registrationSignal }) => registrationSignal)).toBe(true);
      expect(before.activeTools.some(({ name }) => doctorTools.includes(name))).toBe(false);

      await owner.page.getByRole("link", { name: "Sharing" }).click();
      await expect(owner.page).toHaveURL(`${passportBaseUrl}/sharing`);
      await expect.poll(() => activeModelContextToolNames(owner.page)).toEqual(ownerSharingTools);

      const after = await modelContextSnapshot(owner.page);
      const priorIds = new Set(before.activeTools.map(({ id }) => id));
      const unregisteredIds = new Set(after.unregistrations.map(({ id }) => id));
      expect([...priorIds].every((id) => unregisteredIds.has(id))).toBe(true);
    } finally {
      await owner.context.close();
    }
  });

  test("@authenticated clinician tools are role-isolated and enforce patient scopes", async ({
    browser,
  }) => {
    const doctor = await signIn(browser, "doctor");
    try {
      await expect.poll(() => activeModelContextToolNames(doctor.page)).toEqual(doctorTools);
      expect(
        (await activeModelContextToolNames(doctor.page)).some((name) =>
          [...ownerTools, ...ownerSharingTools].includes(name),
        ),
      ).toBe(false);

      const authorized = parseToolSuccess<Array<{ id: string; displayName: string }>>(
        await invokeModelContextTool(doctor.page, "search_my_patients", {
          query: "",
          limit: 10,
        }),
      );
      expect(authorized.map(({ id }) => id).sort()).toEqual(["passport_mateo", "passport_maya"]);

      const overview = parseToolSuccess<{ id: string; profile: { displayName: string } }>(
        await invokeModelContextTool(doctor.page, "get_patient_overview", {
          patientId: "passport_mateo",
        }),
      );
      expect(overview).toMatchObject({
        id: "passport_mateo",
        profile: { displayName: "Mateo Rivera Demo" },
      });
      expect(JSON.stringify(overview)).not.toContain("medications");
      expect(JSON.stringify(overview)).not.toContain("notableResults");

      const outOfRelationshipError = await invokeAndReadError(doctor.page, "get_patient_overview", {
        patientId: "passport_daniel",
      });
      const missingScopeError = await invokeAndReadError(doctor.page, "get_patient_section", {
        patientId: "passport_maya",
        section: "documents",
      });
      expect(missingScopeError).toBe(outOfRelationshipError);
      expect(missingScopeError).toBe("No currently authorized patient matched the request.");
    } finally {
      await doctor.context.close();
    }
  });

  test.describe("explicit synthetic state mutations", () => {
    test.skip(
      !allowStateMutation,
      "Set ALLOW_SYNTHETIC_STATE_MUTATION=true only for an isolated synthetic environment.",
    );

    test("@authenticated owner confirms the exact projection, redeems once, and replay fails", async ({
      browser,
      request,
    }) => {
      const owner = await signIn(browser, "owner");
      try {
        await owner.page.getByRole("link", { name: "Sharing" }).click();
        await expect.poll(() => activeModelContextToolNames(owner.page)).toEqual(ownerSharingTools);

        await owner.page.getByRole("button", { name: "Create permission" }).click();
        const projectionDialog = owner.page.getByRole("dialog", {
          name: "Choose what to share",
        });
        await projectionDialog.getByLabel("Recipient").selectOption("gym");
        await expect(
          projectionDialog.getByLabel("Adaptive Gym projection field preview"),
        ).toContainText("adaptive_gym_session");
        await expect(projectionDialog).toContainText("gym.context.read, gym.feedback.write");
        await expect(projectionDialog).toContainText(
          "Not shared: name, exact birth date, contacts, diagnoses, medications, labs, allergies, documents, Passport ID, clinician identity, or payment data.",
        );
        await projectionDialog.getByRole("button", { name: "Cancel" }).click();

        const invocation = invokeModelContextTool(owner.page, "create_context_grant", {
          recipient: "adaptive-gym",
          scopes: ["gym.context.read", "gym.feedback.write"],
          expiresInMinutes: 5,
        });
        const confirmation = owner.page.getByRole("alertdialog", {
          name: "Share minimum context with Adaptive Gym",
        });
        await expect(confirmation).toContainText("Adaptive Gym");
        await expect(confirmation).toContainText("gym.context.read, gym.feedback.write");
        for (const disclosedField of [
          "Goals",
          "Experience",
          "Preferred session",
          "Preferred activities",
          "Functional capabilities",
          "Movement considerations",
          "Avoid",
          "Stop signals",
          "Accessibility needs",
          "Provenance classes",
          "Issued at",
          "Expires at",
          "Not shared",
        ]) {
          await expect(confirmation.getByText(disclosedField, { exact: true })).toBeVisible();
        }
        const confirmedExpiresAt = await confirmation
          .getByText("Expires at", { exact: true })
          .locator("..")
          .locator("strong")
          .textContent();
        expect(confirmedExpiresAt).toBeTruthy();

        type GrantResponseCapture = {
          body: {
            ok: true;
            data: { exchangeUrl: string; expiresAt: string; scopes: string[] };
            meta: { asOf: string };
          };
          status: number;
        };
        let resolveGrantResponse!: (capture: GrantResponseCapture) => void;
        let rejectGrantResponse!: (reason: unknown) => void;
        const grantResponsePromise = new Promise<GrantResponseCapture>((resolve, reject) => {
          resolveGrantResponse = resolve;
          rejectGrantResponse = reject;
        });
        let releaseGrantResponse: () => void = () => undefined;
        const grantResponseRelease = new Promise<void>((resolve) => {
          releaseGrantResponse = resolve;
        });
        await owner.page.route(
          `${passportBaseUrl}/api/context-grants`,
          async (route) => {
            try {
              const response = await route.fetch();
              const body = (await response.json()) as GrantResponseCapture["body"];
              resolveGrantResponse({ body, status: response.status() });
              await grantResponseRelease;
              await route.fulfill({ response });
            } catch (error) {
              await route.abort().catch(() => undefined);
              rejectGrantResponse(error);
            }
          },
          { times: 1 },
        );
        const approveGrantPromise = confirmation
          .getByRole("button", { name: "Share with Gym" })
          .click();
        let grantEnvelope!: GrantResponseCapture["body"];
        let code: string | null = null;
        let readyStatePage: Page | null = null;
        try {
          const grantResponse = await grantResponsePromise;
          expect(grantResponse.status).toBe(201);
          grantEnvelope = grantResponse.body;
          const exchangeUrl = new URL(grantEnvelope.data.exchangeUrl);
          expect(exchangeUrl.origin).toBe(new URL(gymBaseUrl).origin);
          expect(grantEnvelope.data.scopes).toEqual(["gym.context.read", "gym.feedback.write"]);
          expect(grantEnvelope.data.expiresAt).toBe(confirmedExpiresAt);
          const remainingMs =
            Date.parse(grantEnvelope.data.expiresAt) - Date.parse(grantEnvelope.meta.asOf);
          expect(remainingMs).toBeGreaterThanOrEqual(4 * 60_000 + 55_000);
          expect(remainingMs).toBeLessThanOrEqual(5 * 60_000);
          code = new URLSearchParams(exchangeUrl.hash.slice(1)).get("code");
          expect(code?.length).toBeGreaterThanOrEqual(32);

          readyStatePage = await owner.context.newPage();
          await installModelContextShim(readyStatePage);
          await readyStatePage.goto(`${passportBaseUrl}/sharing`, {
            waitUntil: "domcontentloaded",
          });
          const readyHandoff = readyStatePage
            .getByRole("table", { name: "Gym handoffs" })
            .locator("tbody tr")
            .first();
          await expect(readyHandoff).toContainText("Adaptive Gym");
          await expect(readyHandoff.getByText("awaiting Gym", { exact: true })).toBeVisible();
          await expect(readyHandoff.getByRole("button", { name: "Revoke" })).toBeVisible();
          await expect(readyStatePage.getByText("1 live", { exact: true })).toBeVisible();
        } finally {
          releaseGrantResponse();
          await readyStatePage?.close().catch(() => undefined);
        }
        await approveGrantPromise;
        expect(code?.length).toBeGreaterThanOrEqual(32);

        expect(
          parseToolSuccess<{
            created: boolean;
            recipient: string;
            scopes: string[];
            expiresAt: string;
            containsClinicalRecords: boolean;
            handoffStarted: boolean;
          }>(await invocation),
        ).toEqual({
          created: true,
          recipient: "adaptive-gym",
          scopes: ["gym.context.read", "gym.feedback.write"],
          expiresAt: grantEnvelope.data.expiresAt,
          containsClinicalRecords: false,
          handoffStarted: true,
        });

        await owner.page.waitForURL(
          (url) => url.origin === new URL(gymBaseUrl).origin && url.pathname === "/passport",
        );
        await expect(owner.page.getByText("One-use grant redeemed", { exact: true })).toBeVisible();
        await expect(owner.page).toHaveURL(`${gymBaseUrl}/passport`);
        await expect(owner.page.getByText("Passport member", { exact: true })).toBeVisible();

        const replay = await request.post(`${gymBaseUrl}/api/context/redeem`, {
          data: { code },
        });
        expect(replay.status()).toBe(409);
        await expect(replay.json()).resolves.toMatchObject({
          error: expect.stringMatching(/invalid|expired|revoked|already used/i),
        });

        const connectedStatePage = await owner.context.newPage();
        await installModelContextShim(connectedStatePage);
        try {
          await connectedStatePage.goto(`${passportBaseUrl}/sharing`, {
            waitUntil: "domcontentloaded",
          });
          const connectedHandoff = connectedStatePage
            .getByRole("table", { name: "Gym handoffs" })
            .locator("tbody tr")
            .first();
          await expect(connectedHandoff.getByText("connected", { exact: true })).toBeVisible();
          await expect(connectedStatePage.getByText("1 live", { exact: true })).toBeVisible();
          await connectedHandoff.getByRole("button", { name: "Revoke" }).click();
          await expect(connectedHandoff.getByText("revoked", { exact: true })).toBeVisible();
          await expect(connectedStatePage.getByText("0 live", { exact: true })).toBeVisible();
        } finally {
          await connectedStatePage.close();
        }

        const revokedContext = await owner.context.request.get(`${gymBaseUrl}/api/context/current`);
        expect(revokedContext.status()).toBe(401);
        await owner.page.reload({ waitUntil: "domcontentloaded" });
        await expect(
          owner.page.getByRole("heading", { name: "Start from your own Passport." }),
        ).toBeVisible();
      } finally {
        await owner.context.close();
      }
    });

    test("@authenticated already-open clinician loses access immediately after owner revocation", async ({
      browser,
    }) => {
      const owner = await signIn(browser, "owner");
      const doctor = await signIn(browser, "doctor");
      try {
        let shares = await listActiveOwnerShares(owner.context);
        if (!shares.some(({ passportId }) => passportId === "passport_mateo")) {
          await createFullDoctorGrant(owner.context);
          shares = await listActiveOwnerShares(owner.context);
        }

        await expect.poll(() => activeModelContextToolNames(doctor.page)).toEqual(doctorTools);
        parseToolSuccess(
          await invokeModelContextTool(doctor.page, "get_patient_overview", {
            patientId: "passport_mateo",
          }),
        );
        const doctorUrlBeforeRevocation = doctor.page.url();

        const activeMateoGrants = shares.filter(
          ({ passportId, status }) => passportId === "passport_mateo" && status === "active",
        );
        expect(activeMateoGrants.length).toBeGreaterThan(0);
        for (const grant of activeMateoGrants) {
          const response = await owner.context.request.delete(
            `${passportBaseUrl}/api/access-grants/${encodeURIComponent(grant.id)}`,
          );
          expect(response.ok()).toBeTruthy();
        }

        const denied = await invokeAndReadError(doctor.page, "get_patient_overview", {
          patientId: "passport_mateo",
        });
        expect(denied).toBe("No currently authorized patient matched the request.");
        expect(doctor.page.url()).toBe(doctorUrlBeforeRevocation);
      } finally {
        await createFullDoctorGrant(owner.context);
        await Promise.all([owner.context.close(), doctor.context.close()]);
      }
    });

    test("@authenticated goal-only WebMCP request pays once and saves the exact routine to Passport", async ({
      browser,
    }) => {
      test.skip(
        !allowDemoReset || !allowAgentPayment,
        "Requires ALLOW_SYNTHETIC_DEMO_RESET_E2E=true and ALLOW_SYNTHETIC_AGENT_PAYMENT_E2E=true for the isolated sandbox-payment canary.",
      );
      test.setTimeout(180_000);

      const doctor = await signIn(browser, "doctor");
      let owner: SignedInActor | null = null;
      try {
        await resetSyntheticDemo(doctor.context);
        owner = await signIn(browser, "owner");
        await connectOwnerPassportToGym(owner.page);
        await owner.page.goto(`${gymBaseUrl}/session`, { waitUntil: "domcontentloaded" });
        await expect.poll(() => activeModelContextToolNames(owner!.page)).toEqual(gymSessionTools);

        const offer = parseToolSuccess<{
          amountMinor: number;
          currency: string;
          sandbox: boolean;
          entitled: boolean;
          supportedModes: string[];
          tierBoundary: { free: string; paid: string };
        }>(await invokeModelContextTool(owner.page, "get_routine_pro_offer", {}));
        expect(offer).toMatchObject({
          amountMinor: 499,
          currency: "usd",
          sandbox: true,
          entitled: false,
          tierBoundary: {
            free: "Passport connection, context review, Gym profile, and equipment discovery",
            paid: "Personalized routine creation and Passport saving",
          },
        });
        expect(offer.supportedModes).toContain("agent_wallet");

        const routineInvocation = invokeModelContextTool(
          owner.page,
          "create_personalized_routine",
          { goal: naturalLanguageGoal },
        );
        const paymentConfirmation = owner.page.getByRole("alertdialog", {
          name: "Approve Routine Pro sandbox payment?",
        });
        await expect(paymentConfirmation).toContainText("Free tier");
        await expect(paymentConfirmation).toContainText("Paid tier");
        await expect(paymentConfirmation).toContainText("$4.99 test USD");
        await expect(paymentConfirmation).toContainText("Adaptive World demo agent");
        await expect(paymentConfirmation).toContainText(naturalLanguageGoal);
        await expect(paymentConfirmation).toContainText("low_impact_orientation");
        await paymentConfirmation.getByRole("button", { name: "Approve agent payment" }).click();

        const created = parseToolSuccess<{
          created: boolean;
          savedToPassport: boolean;
          savedRoutineRef: string;
          routine: { template: string };
        }>(await routineInvocation);
        expect(created).toMatchObject({
          created: true,
          savedToPassport: true,
          routine: { template: "low_impact_orientation@1.0" },
        });
        expect(created.savedRoutineRef).toMatch(/^[0-9a-f-]{36}$/u);

        const gymSession = await owner.context.request.get(`${gymBaseUrl}/api/session`);
        expect(gymSession.ok()).toBeTruthy();
        await expect(gymSession.json()).resolves.toMatchObject({
          session: {
            goal: naturalLanguageGoal,
            templateId: "low_impact_orientation",
            createdVia: "webmcp",
          },
        });

        const savedRoutine = await owner.context.request.get(
          `${passportBaseUrl}/api/saved-routines/${encodeURIComponent(created.savedRoutineRef)}`,
        );
        expect(savedRoutine.ok()).toBeTruthy();
        await expect(savedRoutine.json()).resolves.toMatchObject({
          ok: true,
          data: {
            routine: {
              id: created.savedRoutineRef,
              goal: naturalLanguageGoal,
              templateId: "low_impact_orientation",
              createdVia: "webmcp",
            },
          },
        });

        await owner.page.goto(
          `${passportBaseUrl}/routines/${encodeURIComponent(created.savedRoutineRef)}`,
          { waitUntil: "domcontentloaded" },
        );
        const goalRow = owner.page.getByText("Your stated goal", { exact: true }).locator("..");
        await expect(goalRow).toContainText(naturalLanguageGoal);
        await expect(owner.page.getByText("WebMCP", { exact: true })).toBeVisible();
      } finally {
        try {
          await resetSyntheticDemo(doctor.context);
        } finally {
          await Promise.all([owner?.context.close(), doctor.context.close()]);
        }
      }
    });

    test("@authenticated reset is owner-denied and available only to the clinician operator", async ({
      browser,
    }) => {
      test.skip(
        !allowDemoReset,
        "Set ALLOW_SYNTHETIC_DEMO_RESET_E2E=true only when ENABLE_DEMO_RESET is active.",
      );
      const owner = await signIn(browser, "owner");
      const doctor = await signIn(browser, "doctor");
      try {
        await owner.page.goto(`${passportBaseUrl}/tools`, { waitUntil: "domcontentloaded" });
        await expect(
          owner.page.getByRole("button", { name: "Restore synthetic demo" }),
        ).toHaveCount(0);
        const ownerReset = await owner.context.request.post(`${passportBaseUrl}/api/demo/reset`, {
          data: {},
        });
        expect(ownerReset.status()).toBe(403);
        await expect(ownerReset.json()).resolves.toMatchObject({
          ok: false,
          error: { code: "FORBIDDEN" },
        });

        await doctor.page.getByRole("link", { name: "Tools" }).click();
        await expect(
          doctor.page.getByRole("button", { name: "Restore synthetic demo" }),
        ).toBeVisible();
        const doctorReset = await doctor.context.request.post(`${passportBaseUrl}/api/demo/reset`, {
          data: {},
        });
        expect(doctorReset.ok()).toBeTruthy();
        await expect(doctorReset.json()).resolves.toMatchObject({
          ok: true,
          data: { restored: true, restoredRelationships: 2 },
        });
      } finally {
        await Promise.all([owner.context.close(), doctor.context.close()]);
      }
    });
  });
});
