import type { GymContextProjection, RoutineProOffer } from "@adaptive-world/contracts";
import { equipmentCatalog } from "@adaptive-world/demo-data";
import type {
  CreatePersonalizedRoutineInput,
  MutationConfirmationRequest,
} from "@adaptive-world/webmcp";
import { describe, expect, it } from "vitest";
import {
  prepareFeedbackConfirmation,
  prepareRoutineProConfirmation,
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
        { label: "Payment network", value: "MPP / Tempo testnet — sandbox transaction" },
        { label: "Destination", value: "Save this exact routine to Passport" },
      ]),
    );
    expect(
      fields.find((field) => field.label === "Approved Passport context used")?.value,
    ).toContain("Weight-bearing clearance is undocumented");
    expect(fields.find((field) => field.label === "Exercise 1")?.value).toContain(
      selectedEquipment.find((item) => item.id === "scifit_pro2_total_body")!.name,
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
      input,
    };

    expect(webMcpMutationBusyLabel(request)).toBe(
      "Validating the exact routine and confirming the Tempo testnet payment…",
    );
    expect(
      webMcpMutationBusyLabel({
        ...request,
        fields: request.fields.map((field) =>
          field.label === "Payer" ? { ...field, value: "Human Stripe test checkout" } : field,
        ),
      }),
    ).toBe("Validating the exact routine and opening Stripe test checkout…");
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
});
