import type { GymContextProjection, RoutineProOffer } from "@adaptive-world/contracts";
import { equipmentCatalog } from "@adaptive-world/demo-data";
import type {
  CreatePersonalizedRoutineInput,
  MutationConfirmationRequest,
} from "@adaptive-world/webmcp";
import { describe, expect, it } from "vitest";
import { facilityTemplates } from "./session-planner";
import {
  MAX_CONFIRMATION_VALUE_CHARS,
  prepareFeedbackConfirmation,
  prepareRoutineProConfirmation,
  prepareStaffWalkthroughConfirmation,
  webMcpMutationBusyLabel,
} from "./webmcp-confirmations";

const offer: RoutineProOffer = {
  productKey: "adaptive_world.routine_pro.v1",
  displayName: "Adaptive Routine Pro",
  amountMinor: 499,
  currency: "usd",
  sandbox: true,
  entitled: false,
  supportedModes: ["human_checkout", "agent_wallet"],
  quoteValidUntil: "2026-09-01T12:05:00.000Z",
  quoteDigest: "a".repeat(64),
};

const projection: GymContextProjection = {
  projectionId: "gym_projection_0123456789abcdef01234567",
  subjectAlias: "Mateo",
  purpose: "adaptive_gym_session",
  goals: ["Return gradually to regular activity"],
  experienceLevel: "beginner",
  preferredSessionMinutes: 35,
  preferredActivities: ["Supported strength"],
  functionalCapabilities: ["Can transfer independently"],
  movementConsiderations: [
    "Broken leg reported three months ago",
    "Weight-bearing clearance is undocumented",
  ],
  avoid: ["Do not progress lower-limb loading without documented clearance"],
  stopSignals: ["New or increasing pain", "Swelling"],
  accessibilityNeeds: [],
  sourceCategories: ["self_reported"],
  issuedAt: "2026-09-01T12:00:00.000Z",
  expiresAt: "2026-09-01T12:05:00.000Z",
  synthetic: true,
};

const input: CreatePersonalizedRoutineInput = {
  goal: "Create a cautious routine for Mateo while weight-bearing clearance remains undocumented.",
  paymentMode: "agent_wallet",
  routine: {
    title: "Mateo cautious return-to-activity draft",
    durationMinutes: 24,
    exercises: [
      {
        equipmentId: "scifit_pro2_total_body",
        durationMinutes: 8,
        intensity: "easy",
        instructions: ["Ask staff to configure the removable seat before beginning."],
        adaptationReason: "Uses an adjustable seated setup while clearance remains uncertain.",
      },
      {
        equipmentId: "lf_insignia_row",
        durationMinutes: 8,
        intensity: "easy",
        instructions: ["Set the chest support and seat before selecting resistance."],
        adaptationReason: "Adds supported upper-body work without claiming medical clearance.",
      },
    ],
    warmup: ["Review stop signals with Gym staff."],
    cooldown: ["Reassess pain or swelling before standing."],
    safetyNotes: ["Do not interpret this draft as medical clearance."],
    requiresExpertReview: true,
    expertReviewReason:
      "The recent fracture and weight-bearing clearance uncertainty require professional review.",
  },
};

const selectedEquipment = equipmentCatalog.filter((item) =>
  input.routine.exercises.some((exercise) => exercise.equipmentId === item.id),
);

describe("Gym WebMCP confirmations", () => {
  it("shows the exact effective feedback values, including defaults", () => {
    const prepared = prepareFeedbackConfirmation({ sessionId: "session-1", notes: "Felt steady" }, [
      "rower-1",
      "bike-2",
    ]);
    expect(prepared.confirmation.fields).toEqual([
      { label: "Public routine reference", value: "session-1" },
      { label: "Perceived exertion", value: "5" },
      { label: "Pain", value: "0" },
      { label: "Completed station IDs", value: "rower-1, bike-2" },
      { label: "Notes", value: "Felt steady" },
    ]);
  });

  it("shows the exact agent-generated proposal before authorizing payment and save", () => {
    const prepared = prepareRoutineProConfirmation({
      offer,
      requestedInput: input,
      projection,
      equipment: selectedEquipment,
    });
    const fields = prepared.preparation.confirmation.fields;

    expect(prepared.effectiveInput).toEqual(input);
    expect(prepared.preparation.confirmation).toMatchObject({
      title: "Approve this exact routine and sandbox payment?",
      confirmLabel: "Approve exact routine and agent payment",
      riskClass: "payment",
    });
    expect(fields).toEqual(
      expect.arrayContaining([
        {
          label: "Proposed routine",
          value: "Mateo cautious return-to-activity draft · 24 minutes · 2 equipment blocks",
        },
        { label: "Confirmed goal", value: input.goal },
        { label: "Product", value: "Adaptive Routine Pro" },
        { label: "Amount", value: "$4.99 test USD" },
        { label: "Payer", value: "Adaptive World demo agent wallet" },
        { label: "Payment network", value: "Agent-payment testnet — sandbox transaction" },
        { label: "Destination", value: "Save this exact routine to Passport" },
      ]),
    );
    expect(
      fields.find((field) => field.label === "Approved Passport context used")?.value,
    ).toContain("Weight-bearing clearance is undocumented");
    expect(fields.find((field) => field.label === "Exercise 1")?.value).toContain(
      "Inclusive Total-Body Ergometer",
    );
    expect(fields.find((field) => field.label === "Professional review")?.value).toContain(
      "A physician or qualified physical therapist should review and approve this routine",
    );
  });

  it("labels visible payment phases and never describes template selection", () => {
    const prepared = prepareRoutineProConfirmation({
      offer,
      requestedInput: input,
      projection,
      equipment: selectedEquipment,
    });
    const request: MutationConfirmationRequest = {
      toolName: "create_personalized_routine",
      ...prepared.preparation.confirmation,
      input: { ...input },
    };

    expect(webMcpMutationBusyLabel(request)).toBe(
      "Validating the exact routine and confirming the agent testnet payment…",
    );
    expect(
      webMcpMutationBusyLabel({
        ...request,
        fields: request.fields.map((field) =>
          field.label === "Payer" ? { ...field, value: "Human hosted test checkout" } : field,
        ),
      }),
    ).toBe("Validating the exact routine and opening the hosted test checkout…");
    expect(JSON.stringify(prepared)).not.toContain("template selected");
  });

  it("shows no new payment for an existing entitlement", () => {
    const prepared = prepareRoutineProConfirmation({
      offer: { ...offer, entitled: true },
      requestedInput: input,
      projection,
      equipment: selectedEquipment,
    });
    expect(prepared.preparation.confirmation.title).toBe(
      "Save this exact agent-generated routine?",
    );
    expect(prepared.preparation.confirmation.fields).toEqual(
      expect.arrayContaining([
        { label: "Amount", value: "Already unlocked" },
        { label: "Payment network", value: "No new payment" },
      ]),
    );
  });

  it("describes a site walkthrough purchase honestly and never as agent-generated", () => {
    const template = facilityTemplates.find((item) => item.id === "low_impact_orientation")!;
    const prepared = prepareStaffWalkthroughConfirmation({
      offer,
      template,
      goal: "Support long-term health",
      paymentMode: "human_checkout",
      projection,
      equipment: equipmentCatalog,
    });
    expect(prepared.title).toBe("Approve this staff walkthrough and sandbox payment?");
    expect(prepared.confirmLabel).toBe("Approve walkthrough and open test checkout");
    expect(prepared.fields).toEqual(
      expect.arrayContaining([
        { label: "Confirmed goal", value: "Support long-term health" },
        { label: "Amount", value: "$4.99 test USD" },
        { label: "Payer", value: "Human hosted test checkout" },
        { label: "Payment network", value: "Hosted test checkout — sandbox transaction" },
        { label: "Destination", value: "Save this exact walkthrough to Passport" },
      ]),
    );
    expect(prepared.fields.find((field) => field.label === "Proposed routine")?.value).toContain(
      template.name,
    );
    expect(prepared.fields.find((field) => field.label === "Exercise 1")?.value).toContain(
      "Step-Through Recumbent Cycle",
    );
    const serialized = JSON.stringify(prepared).toLowerCase();
    expect(serialized).toContain("not agent-generated");
    expect(serialized).not.toContain("agent-generated via webmcp");
  });

  it("keeps every confirmation value within the adapter field bound for verbose contexts", () => {
    const verbose: GymContextProjection = {
      ...projection,
      goals: Array.from({ length: 8 }, (_, index) => `${"Goal detail ".repeat(12)}${index}`),
      movementConsiderations: Array.from(
        { length: 8 },
        (_, index) => `${"Movement consideration ".repeat(8)}${index}`,
      ),
      avoid: Array.from({ length: 8 }, (_, index) => `${"Avoid this loading ".repeat(8)}${index}`),
      stopSignals: Array.from({ length: 8 }, (_, index) => `${"Stop signal ".repeat(12)}${index}`),
    };
    const agent = prepareRoutineProConfirmation({
      offer,
      requestedInput: input,
      projection: verbose,
      equipment: selectedEquipment,
    });
    const site = prepareStaffWalkthroughConfirmation({
      offer,
      template: facilityTemplates[0]!,
      goal: "Support long-term health",
      paymentMode: "agent_wallet",
      projection: verbose,
      equipment: equipmentCatalog,
    });
    for (const field of [...agent.preparation.confirmation.fields, ...site.fields]) {
      expect(field.value.length).toBeLessThanOrEqual(1_800);
    }
    expect(
      agent.preparation.confirmation.fields.find(
        (field) => field.label === "Approved Passport context used",
      )?.value.length,
    ).toBeLessThanOrEqual(MAX_CONFIRMATION_VALUE_CHARS);
  });

  it("shows warm-up, cooldown, and safety notes in full at their schema maxima", () => {
    const longLine = (seed: string, length: number) =>
      `${seed} `.repeat(Math.ceil(length / (seed.length + 1))).slice(0, length);
    const maximal: CreatePersonalizedRoutineInput = {
      ...input,
      routine: {
        ...input.routine,
        warmup: Array.from({ length: 6 }, (_, index) => longLine(`Warm-up step ${index}`, 180)),
        cooldown: Array.from({ length: 6 }, (_, index) => longLine(`Cooldown step ${index}`, 180)),
        safetyNotes: Array.from({ length: 8 }, (_, index) => longLine(`Safety note ${index}`, 200)),
      },
    };
    const fields = prepareRoutineProConfirmation({
      offer,
      requestedInput: maximal,
      projection,
      equipment: selectedEquipment,
    }).preparation.confirmation.fields;
    for (const [label, values] of [
      ["Warm-up", maximal.routine.warmup!],
      ["Cooldown", maximal.routine.cooldown!],
      ["Safety notes", maximal.routine.safetyNotes],
    ] as const) {
      const value = fields.find((field) => field.label === label)?.value ?? "";
      expect(value).toBe(values.join("; "));
      expect(value.length).toBeLessThanOrEqual(1_800);
    }
  });
});
