import type { RoutineProOffer } from "@adaptive-world/contracts";
import type { MutationConfirmationRequest } from "@adaptive-world/webmcp";
import { describe, expect, it } from "vitest";
import {
  prepareFeedbackConfirmation,
  prepareRoutineProConfirmation,
  routineTemplateConfirmationField,
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
  quoteValidUntil: "2026-08-29T12:05:00.000Z",
  quoteDigest: "a".repeat(64),
};

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

  it("shows the exact Routine Pro template identifier", () => {
    expect(routineTemplateConfirmationField("accessible_equipment_tour")).toEqual({
      label: "Template ID",
      value: "accessible_equipment_tour",
    });
  });

  it("uses the server-owned payer and template for an existing payment", () => {
    const prepared = prepareRoutineProConfirmation({
      offer,
      requestedInput: {
        templateId: "accessible_equipment_tour",
        paymentMode: "agent_wallet",
      },
      pending: {
        orderRef: `awrp_${"b".repeat(32)}`,
        orderStatus: "provider_pending",
        payerLabel: "Human test checkout",
        canResume: true,
        initialTemplateId: "first_visit_foundations",
      },
    });

    expect(prepared.effectiveInput).toEqual({
      templateId: "first_visit_foundations",
      paymentMode: "human_checkout",
    });
    expect(prepared.preparation.confirmation).toMatchObject({
      title: "Payment already in progress",
      confirmLabel: "Resume",
      riskClass: "payment",
    });
    expect(prepared.preparation.confirmation.fields).toEqual(
      expect.arrayContaining([
        { label: "Template ID", value: "first_visit_foundations" },
        { label: "Payer", value: "Human test checkout" },
      ]),
    );
  });

  it("keeps a fresh agent payment explicit and labels its visible busy phase", () => {
    const prepared = prepareRoutineProConfirmation({
      offer,
      requestedInput: {
        templateId: "low_impact_orientation",
        paymentMode: "agent_wallet",
      },
      pending: null,
    });
    const request: MutationConfirmationRequest = {
      toolName: "create_personalized_routine",
      ...prepared.preparation.confirmation,
      input: {},
    };

    expect(prepared.effectiveInput.paymentMode).toBe("agent_wallet");
    expect(prepared.preparation.confirmation.confirmLabel).toBe("Approve agent payment");
    expect(webMcpMutationBusyLabel(request)).toBe("Paying with the Adaptive World demo agent…");
    expect(
      webMcpMutationBusyLabel({
        ...request,
        fields: request.fields.map((field) =>
          field.label === "Payer" ? { ...field, value: "Human test checkout" } : field,
        ),
      }),
    ).toBe("Opening secure Stripe test checkout…");
  });
});
