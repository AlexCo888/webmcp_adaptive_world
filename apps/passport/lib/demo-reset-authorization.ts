import type { PortalActor } from "./session";

export const DEMO_RESET_OPERATOR_ID = "00000000-0000-4000-8000-000000000002";
export const DEMO_RESET_OPERATOR_SUBJECT = "auth_elena_demo";

export function isDemoResetOperator(actor: PortalActor): boolean {
  return (
    actor.role === "doctor" &&
    actor.id === DEMO_RESET_OPERATOR_ID &&
    actor.authSubject === DEMO_RESET_OPERATOR_SUBJECT
  );
}
