import { describe, expect, it } from "vitest";
import { assertRoutineOrderInput, routineInputForOrder, type RoutineProOrder } from "./orders";

const order = {
  initialTemplateId: "low_impact_orientation",
  initialGoal: "Support lifelong health without bodybuilding-style muscle gain",
} as RoutineProOrder;

function expectOrderPending(operation: () => void) {
  let caught: unknown;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({ code: "ORDER_PENDING" });
}

describe("Routine Pro order intent", () => {
  it("resumes only the immutable template and natural-language goal", () => {
    expect(() =>
      assertRoutineOrderInput(order, {
        templateId: "low_impact_orientation",
        goal: "Support lifelong health without bodybuilding-style muscle gain",
      }),
    ).not.toThrow();
    expectOrderPending(() =>
      assertRoutineOrderInput(order, {
        templateId: "first_visit_foundations",
        goal: "Support lifelong health without bodybuilding-style muscle gain",
      }),
    );
    expectOrderPending(() =>
      assertRoutineOrderInput(order, {
        templateId: "low_impact_orientation",
        goal: "Build maximum muscle mass",
      }),
    );
  });

  it("uses the order-owned values after payment", () => {
    expect(routineInputForOrder(order, "Ignore this later request")).toEqual({
      templateId: "low_impact_orientation",
      goal: "Support lifelong health without bodybuilding-style muscle gain",
    });
  });
});
