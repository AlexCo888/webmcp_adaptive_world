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

const ownerTools = ["get_my_passport_summary", "list_my_shares"];
const ownerSharingTools = ["create_context_grant", "list_my_shares", "revoke_access_grant"];
const doctorTools = [
  "add_clinical_guidance",
  "get_patient_overview",
  "get_patient_section",
  "open_patient_source",
  "search_my_patients",
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

test.describe("authenticated Passport WebMCP release journeys", () => {
  test.describe.configure({ mode: "serial" });
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
        }).then(
          (output) => ({ status: "fulfilled" as const, output }),
          (error: unknown) => ({ status: "navigation-interrupted" as const, error }),
        );
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
          .locator("dd")
          .textContent();
        expect(confirmedExpiresAt).toBeTruthy();

        const grantResponsePromise = owner.page.waitForResponse(
          (response) =>
            response.url() === `${passportBaseUrl}/api/context-grants` &&
            response.request().method() === "POST",
        );
        await confirmation.getByRole("button", { name: "Share with Gym" }).click();
        const grantResponse = await grantResponsePromise;
        expect(grantResponse.status()).toBe(201);
        const grantEnvelope = (await grantResponse.json()) as {
          ok: true;
          data: { exchangeUrl: string; expiresAt: string; scopes: string[] };
          meta: { asOf: string };
        };
        const exchangeUrl = new URL(grantEnvelope.data.exchangeUrl);
        expect(exchangeUrl.origin).toBe(new URL(gymBaseUrl).origin);
        expect(grantEnvelope.data.scopes).toEqual(["gym.context.read", "gym.feedback.write"]);
        expect(grantEnvelope.data.expiresAt).toBe(confirmedExpiresAt);
        const remainingMs =
          Date.parse(grantEnvelope.data.expiresAt) - Date.parse(grantEnvelope.meta.asOf);
        expect(remainingMs).toBeGreaterThanOrEqual(4 * 60_000 + 55_000);
        expect(remainingMs).toBeLessThanOrEqual(5 * 60_000);
        const code = new URLSearchParams(exchangeUrl.hash.slice(1)).get("code");
        expect(code?.length).toBeGreaterThanOrEqual(32);

        await owner.page.waitForURL(
          (url) => url.origin === new URL(gymBaseUrl).origin && url.pathname === "/passport",
        );
        await expect(owner.page.getByText("One-use grant redeemed", { exact: true })).toBeVisible();
        await expect(owner.page).toHaveURL(`${gymBaseUrl}/passport`);
        await expect(owner.page.getByText("Passport member", { exact: true })).toBeVisible();
        await invocation;

        const replay = await request.post(`${gymBaseUrl}/api/context/redeem`, {
          data: { code },
        });
        expect(replay.status()).toBe(409);
        await expect(replay.json()).resolves.toMatchObject({
          error: expect.stringMatching(/invalid|expired|revoked|already used/i),
        });

        await owner.page.getByRole("button", { name: "Disconnect" }).click();
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
