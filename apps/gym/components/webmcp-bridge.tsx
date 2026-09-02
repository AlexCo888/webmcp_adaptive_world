"use client";

import {
  AgentGeneratedRoutineInputSchema,
  EquipmentSchema,
  GeneratedSessionSchema,
  GymContextProjectionSchema,
  RoutineProOfferSchema,
  RoutineStatusSchema,
  type RoutineProOffer,
  type RoutineStatus,
  type SessionFeedback,
} from "@adaptive-world/contracts";
import {
  createGymToolCatalog,
  useWebMCPTools,
  type ConfirmMutation,
  type CreatePersonalizedRoutineInput,
  type GymToolHandlers,
  type MutationConfirmationRequest,
  type RecordSessionFeedbackInput,
} from "@adaptive-world/webmcp";
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Code2,
  History,
  LoaderCircle,
  Sparkles,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGymExperience } from "@/components/gym-experience-context";
import { fetchBoundedJson, GymApiError } from "@/lib/api-client";
import {
  compactEquipmentForTool,
  createEquipmentSearchToolResult,
  matchesEquipmentSearch,
} from "@/lib/equipment-search";
import {
  AGENT_ROUTINE_BOUNDS,
  RoutineValidationError,
  createAgentGeneratedSession,
  maximumAgentRoutineMinutes,
} from "@/lib/session-planner";
import {
  prepareFeedbackConfirmation,
  prepareRoutineProConfirmation,
  webMcpMutationBusyLabel,
} from "@/lib/webmcp-confirmations";

type ExecutionEvent = { tool: string; at: string };
type PreparedQuote = {
  offer: RoutineProOffer;
  requestedInput: CreatePersonalizedRoutineInput;
  effectiveInput: CreatePersonalizedRoutineInput;
  statusFingerprint: string;
};
type PreparedFeedback = {
  completedExerciseIds: string[];
  input: RecordSessionFeedbackInput;
};

// Client-side preview identifier; the server assigns the real public routine id.
const PREVIEW_ROUTINE_ID = "gym_routine_000000000000000000000000";

function validationReason(error: unknown): string | null {
  if (error instanceof RoutineValidationError) return error.message.slice(0, 240);
  if (error instanceof Error && error.name === "ZodError") {
    const first = (error as { issues?: Array<{ path?: unknown[]; message?: string }> }).issues?.[0];
    if (!first?.message) return "The routine does not match the closed input schema.";
    const path = Array.isArray(first.path) && first.path.length ? first.path.join(".") : "routine";
    return `${path}: ${first.message}`.slice(0, 240);
  }
  return null;
}

// A payment left the site and its outcome is unknown: read-only recovery only.
const RECOVERY_ORDER_STATES = new Set(["payment_submitted", "reconciliation_required"]);
// No payment was submitted (or it was verified but not yet fulfilled): calling
// the mutation again with the exact same routine resumes the order server-side
// without a second charge. Polling alone could never advance these states.
const RESUMABLE_ORDER_STATES = new Set(["created", "provider_pending", "paid_unfulfilled"]);
const NON_TERMINAL_ORDER_STATES = new Set([...RECOVERY_ORDER_STATES, ...RESUMABLE_ORDER_STATES]);

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalValue(item)]),
  );
}

function sameRoutineInput(
  left: CreatePersonalizedRoutineInput,
  right: CreatePersonalizedRoutineInput,
): boolean {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

function sameFeedbackInput(
  left: RecordSessionFeedbackInput,
  right: RecordSessionFeedbackInput,
): boolean {
  return (
    left.sessionId === right.sessionId &&
    left.perceivedExertion === right.perceivedExertion &&
    left.pain === right.pain &&
    left.notes === right.notes
  );
}

function envelopeData(value: unknown): unknown {
  if (!value || typeof value !== "object" || (value as Record<string, unknown>).ok !== true) {
    throw new GymApiError("INVALID_RESPONSE", 502);
  }
  return (value as Record<string, unknown>).data;
}

function parseRoutineProStatus(value: unknown): RoutineStatus {
  return RoutineStatusSchema.parse(envelopeData(value));
}

function statusFingerprint(status: RoutineStatus): string {
  return JSON.stringify([
    status.entitled,
    status.orderRef ?? null,
    status.orderStatus ?? null,
    status.providerPaymentRef ?? null,
    status.savedRoutineRef ?? null,
  ]);
}

function isRecovering(status: RoutineStatus): boolean {
  return Boolean(status.orderStatus && RECOVERY_ORDER_STATES.has(status.orderStatus));
}

function isResumable(status: RoutineStatus): boolean {
  return Boolean(
    status.orderStatus && RESUMABLE_ORDER_STATES.has(status.orderStatus) && status.canResume,
  );
}

function recoveryInstructionFor(status: RoutineStatus): string {
  if (isRecovering(status)) {
    return "Payment confirmation is being recovered. Do not submit another payment. Poll this read-only status tool only while the order remains non-terminal.";
  }
  if (status.orderStatus === "fulfilled") {
    return "Payment and routine save are complete. Do not submit another payment.";
  }
  if (isResumable(status)) {
    return status.orderScope === "earlier_session"
      ? "An unpaid order from an earlier Gym session is open. Submitting the exact confirmed routine again releases it and starts this session's order; no second charge is created."
      : status.orderStatus === "paid_unfulfilled"
        ? "Payment was verified but fulfillment is pending. Submitting the exact confirmed routine again completes fulfillment without a second charge."
        : "No payment has been submitted for this order. Submitting the exact confirmed routine again resumes it without a second charge.";
  }
  return "No payment recovery is currently in progress.";
}

function statusToolResult(status: RoutineStatus) {
  return {
    ...(status.orderRef ? { orderRef: status.orderRef } : {}),
    ...(status.orderStatus ? { orderStatus: status.orderStatus } : {}),
    ...(status.amountMinor !== undefined ? { amountMinor: status.amountMinor } : {}),
    ...(status.currency ? { currency: status.currency } : {}),
    ...(status.provider ? { provider: status.provider } : {}),
    ...(status.payerLabel ? { payerLabel: status.payerLabel } : {}),
    ...(status.sandbox !== undefined ? { sandbox: status.sandbox } : {}),
    ...(status.submittedAt ? { submittedAt: status.submittedAt } : {}),
    ...(status.paidAt ? { paidAt: status.paidAt } : {}),
    ...(status.fulfilledAt ? { fulfilledAt: status.fulfilledAt } : {}),
    ...(status.providerPaymentRef ? { providerPaymentRef: status.providerPaymentRef } : {}),
    entitlementGranted: status.entitlementGranted,
    routineSaved: status.routineSaved,
    ...(status.savedRoutineRef ? { savedRoutineRef: status.savedRoutineRef } : {}),
    ...(status.orderScope ? { orderScope: status.orderScope } : {}),
    terminal:
      status.orderStatus !== undefined && !NON_TERMINAL_ORDER_STATES.has(status.orderStatus),
    resumable: isResumable(status),
    recoveryInstruction: recoveryInstructionFor(status),
  };
}

export function WebMcpBridge() {
  const pathname = usePathname();
  const {
    contextActive,
    setContextActive,
    applyEquipmentSearch,
    openEquipment,
    applyPersonalizedRoutine,
    applyRoutineProStatus,
  } = useGymExperience();
  const [open, setOpen] = useState(false);
  const [hasPersistedRoutine, setHasPersistedRoutine] = useState(false);
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [confirmation, setConfirmation] = useState<MutationConfirmationRequest | null>(null);
  const [confirmationPhase, setConfirmationPhase] = useState<string | null>(null);
  const confirmationResolver = useRef<((approved: boolean) => void) | null>(null);
  const activeConfirmation = useRef<MutationConfirmationRequest | null>(null);
  const confirmationAbortCleanup = useRef<(() => void) | null>(null);
  const confirmationApprovalFrame = useRef<number | null>(null);
  const confirmationApprovalScheduled = useRef(false);
  const preparedQuotes = useRef(new Map<string, PreparedQuote>());
  const preparedFeedback = useRef(new Map<string, PreparedFeedback>());
  const trace = useCallback((tool: string) => {
    setEvents((current) => [{ tool, at: new Date().toISOString() }, ...current].slice(0, 8));
  }, []);

  const clearConfirmation = useCallback((expected?: MutationConfirmationRequest) => {
    if (expected && activeConfirmation.current !== expected) return;
    confirmationAbortCleanup.current?.();
    confirmationAbortCleanup.current = null;
    if (confirmationApprovalFrame.current !== null) {
      window.cancelAnimationFrame(confirmationApprovalFrame.current);
      confirmationApprovalFrame.current = null;
    }
    confirmationResolver.current = null;
    activeConfirmation.current = null;
    confirmationApprovalScheduled.current = false;
    setConfirmation((current) => (!expected || current === expected ? null : current));
    setConfirmationPhase(null);
  }, []);

  const finishMutationExecution = useCallback(() => {
    clearConfirmation();
  }, [clearConfirmation]);

  useEffect(
    () => () => {
      confirmationAbortCleanup.current?.();
      if (confirmationApprovalFrame.current !== null) {
        window.cancelAnimationFrame(confirmationApprovalFrame.current);
      }
      confirmationResolver.current?.(false);
      confirmationResolver.current = null;
      activeConfirmation.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!["/passport", "/session", "/session/feedback"].includes(pathname)) {
      setHasPersistedRoutine(false);
      return;
    }
    const controller = new AbortController();
    void Promise.allSettled([
      fetchBoundedJson<unknown>("/api/context/current", {}, { signal: controller.signal }),
      fetchBoundedJson<unknown>("/api/session", {}, { signal: controller.signal }),
    ]).then(([contextResult, sessionResult]) => {
      if (controller.signal.aborted) return;
      setContextActive(
        contextResult.status === "fulfilled" &&
          Boolean(
            contextResult.value &&
            typeof contextResult.value === "object" &&
            (contextResult.value as Record<string, unknown>).active === true,
          ),
      );
      setHasPersistedRoutine(
        sessionResult.status === "fulfilled" &&
          GeneratedSessionSchema.safeParse(
            sessionResult.value && typeof sessionResult.value === "object"
              ? (sessionResult.value as Record<string, unknown>).session
              : undefined,
          ).success,
      );
    });
    return () => controller.abort();
  }, [pathname, setContextActive]);

  // Mirror every status a tool observes into the page after the tool result is
  // published, so a person watching the site sees the same receipt or recovery
  // notice the agent sees. The provider update must not invalidate the
  // invocation that caused it.
  const applyRecoveredRoutine = useCallback(
    (status: RoutineStatus, signal?: AbortSignal) => {
      window.setTimeout(() => {
        if (signal?.aborted) return;
        applyRoutineProStatus(status);
        if (status.routineSaved && status.routine && status.savedRoutineRef) {
          applyPersonalizedRoutine(status.routine, status.savedRoutineRef);
        }
      }, 0);
    },
    [applyPersonalizedRoutine, applyRoutineProStatus],
  );

  const handlers = useMemo<GymToolHandlers>(
    () => ({
      get_gym_profile: async (_input, context) => {
        const response = await fetchBoundedJson<unknown>("/api/gym-profile", {}, context);
        trace("get_gym_profile");
        return envelopeData(response);
      },
      search_equipment: async (input, context) => {
        const params = new URLSearchParams();
        if (input.query) params.set("q", input.query);
        if (input.categories?.length === 1) params.set("category", input.categories[0]!);
        const response = await fetchBoundedJson<unknown>(
          `/api/equipment${params.size ? `?${params}` : ""}`,
          {},
          context,
        );
        const data = envelopeData(response);
        if (
          !data ||
          typeof data !== "object" ||
          !Array.isArray((data as { equipment?: unknown }).equipment)
        ) {
          throw new GymApiError("INVALID_RESPONSE", 502);
        }
        const matches = (data as { equipment: unknown[] }).equipment
          .map((item) => EquipmentSchema.parse(item))
          .filter((item) =>
            matchesEquipmentSearch(item, {
              query: input.query,
              categories: input.categories,
              maxWidthCm: input.maxWidthCm,
              maxDepthCm: input.maxDepthCm,
              accessibleOnly: input.accessible,
              availableOnly: true,
            }),
          );
        window.setTimeout(() => {
          if (!context.signal?.aborted) applyEquipmentSearch(input, matches.length);
        }, 0);
        trace("search_equipment");
        return createEquipmentSearchToolResult(matches, input.limit);
      },
      get_equipment: async ({ equipmentId }, context) => {
        const response = await fetchBoundedJson<unknown>(
          `/api/equipment/${encodeURIComponent(equipmentId)}`,
          {},
          context,
        );
        const data = envelopeData(response);
        if (!data || typeof data !== "object") throw new GymApiError("INVALID_RESPONSE", 502);
        const item = EquipmentSchema.parse((data as { equipment?: unknown }).equipment);
        window.setTimeout(() => openEquipment(item.slug), 0);
        trace("get_equipment");
        return { equipment: compactEquipmentForTool(item) };
      },
      get_active_context: async (_input, context) => {
        const response = await fetchBoundedJson<unknown>("/api/context/current", {}, context);
        if (!response || typeof response !== "object") {
          throw new GymApiError("INVALID_RESPONSE", 502);
        }
        const record = response as Record<string, unknown>;
        if (record.active !== true) throw new GymApiError("CONTEXT_REQUIRED", 401);
        const projection = GymContextProjectionSchema.parse(record.projection);
        trace("get_active_context");
        return {
          active: true,
          projection,
          routineBounds: {
            maxDurationMinutes: maximumAgentRoutineMinutes(projection),
            minDurationMinutes: AGENT_ROUTINE_BOUNDS.minDurationMinutes,
            maxExercises: AGENT_ROUTINE_BOUNDS.maxExercises,
            maxExerciseMinutes: AGENT_ROUTINE_BOUNDS.maxExerciseMinutes,
            maxTransitionMinutes: AGENT_ROUTINE_BOUNDS.maxTransitionMinutes,
            intensities: AGENT_ROUTINE_BOUNDS.intensities,
            maxInstructionsPerExercise: AGENT_ROUTINE_BOUNDS.maxInstructionsPerExercise,
            maxSafetyNotes: AGENT_ROUTINE_BOUNDS.maxSafetyNotes,
            eachEquipmentAtMostOnce: true,
            requiresExpertReviewFor:
              "injury, rehabilitation, post-operative, or undocumented-clearance scenarios",
          },
        };
      },
      get_routine_pro_offer: async (_input, context) => {
        const response = await fetchBoundedJson<unknown>(
          "/api/commerce/routine-pro/offer",
          {},
          context,
        );
        const offer = RoutineProOfferSchema.parse(envelopeData(response));
        trace("get_routine_pro_offer");
        return {
          ...offer,
          tierBoundary: {
            free: "Passport connection, context review, Gym profile, and equipment discovery",
            paid: "Validation, sandbox payment, and Passport saving of the exact agent-generated routine",
          },
          recommendedFlow: {
            understand: "get_active_context",
            ground: "search_equipment and get_equipment",
            generate: "Generate a new structured routine in the external agent context",
            reviewOffer: "get_routine_pro_offer",
            confirmAndSave: "create_personalized_routine — exact first-party confirmation required",
            recover: "get_routine_pro_status — read-only; never repeat a payment after timeout",
          },
        };
      },
      get_routine_pro_status: async ({ orderRef }, context) => {
        const response = await fetchBoundedJson<unknown>(
          orderRef
            ? `/api/commerce/routine-pro/status?order=${encodeURIComponent(orderRef)}`
            : "/api/commerce/routine-pro/status",
          {},
          context,
        );
        const status = parseRoutineProStatus(response);
        applyRecoveredRoutine(status, context.signal);
        trace("get_routine_pro_status");
        return statusToolResult(status);
      },
      create_personalized_routine: {
        prepare: async (input, context) => {
          const [offerResponse, statusResponse, contextResponse] = await Promise.all([
            fetchBoundedJson<unknown>("/api/commerce/routine-pro/offer", {}, context),
            fetchBoundedJson<unknown>("/api/commerce/routine-pro/status", {}, context),
            fetchBoundedJson<unknown>("/api/context/current", {}, context),
          ]);
          const offer = RoutineProOfferSchema.parse(envelopeData(offerResponse));
          const status = parseRoutineProStatus(statusResponse);
          if (!contextResponse || typeof contextResponse !== "object") {
            throw new GymApiError("INVALID_RESPONSE", 502);
          }
          const contextRecord = contextResponse as Record<string, unknown>;
          if (contextRecord.active !== true) throw new GymApiError("CONTEXT_REQUIRED", 401);
          const projection = GymContextProjectionSchema.parse(contextRecord.projection);
          if (offer.entitled !== status.entitled) {
            throw new GymApiError(
              "QUOTE_CHANGED",
              409,
              "Routine Pro status changed. Review the current offer again.",
            );
          }
          if (isRecovering(status)) {
            throw new GymApiError(
              "ORDER_PENDING",
              409,
              "Payment confirmation is being recovered. We will not submit another payment. Call get_routine_pro_status and poll only while the order remains non-terminal.",
            );
          }
          if (!offer.entitled && offer.supportedModes.length === 0) {
            throw new GymApiError("PROVIDER_UNAVAILABLE", 503);
          }
          const paymentMode =
            input.paymentMode ??
            (!offer.entitled
              ? offer.supportedModes.includes("agent_wallet")
                ? "agent_wallet"
                : offer.supportedModes[0]
              : undefined);
          if (!offer.entitled && (!paymentMode || !offer.supportedModes.includes(paymentMode))) {
            throw new GymApiError("PROVIDER_UNAVAILABLE", 503);
          }
          const effectiveInput: CreatePersonalizedRoutineInput = {
            ...input,
            goal: input.goal.trim(),
            ...(paymentMode ? { paymentMode } : {}),
          };
          const equipmentIds = [
            ...new Set(input.routine.exercises.map((item) => item.equipmentId)),
          ];
          const equipment = await Promise.all(
            equipmentIds.map(async (equipmentId) => {
              const response = await fetchBoundedJson<unknown>(
                `/api/equipment/${encodeURIComponent(equipmentId)}`,
                {},
                context,
              );
              const data = envelopeData(response);
              if (!data || typeof data !== "object") {
                throw new GymApiError("INVALID_RESPONSE", 502);
              }
              const item = EquipmentSchema.parse((data as { equipment?: unknown }).equipment);
              if (item.id !== equipmentId || !item.available) {
                throw new GymApiError(
                  "INVALID_REQUEST",
                  400,
                  `Equipment ${equipmentId} is not currently available in the verified Gym catalog.`,
                );
              }
              return item;
            }),
          );
          // Validate the exact proposal against the same rules the server
          // enforces before asking the person to confirm anything. A failing
          // routine is rejected here with its reason and never reaches payment.
          try {
            createAgentGeneratedSession({
              profile: projection,
              equipment,
              goal: effectiveInput.goal,
              routine: AgentGeneratedRoutineInputSchema.parse(input.routine),
              sessionId: PREVIEW_ROUTINE_ID,
            });
          } catch (error) {
            const reason = validationReason(error);
            if (reason) throw new GymApiError("INVALID_REQUEST", 400, reason);
            throw error;
          }
          const preparedConfirmation = prepareRoutineProConfirmation({
            offer,
            requestedInput: effectiveInput,
            projection,
            equipment,
            ...(isResumable(status) &&
            status.orderRef &&
            status.orderStatus &&
            status.orderScope !== "earlier_session"
              ? { existingOrder: { orderRef: status.orderRef, orderStatus: status.orderStatus } }
              : {}),
          });
          for (const [key, prepared] of preparedQuotes.current) {
            if (Date.parse(prepared.offer.quoteValidUntil) <= Date.now()) {
              preparedQuotes.current.delete(key);
            }
          }
          if (preparedQuotes.current.size >= 20) {
            const oldest = preparedQuotes.current.keys().next().value;
            if (oldest) preparedQuotes.current.delete(oldest);
          }
          preparedQuotes.current.set(offer.quoteDigest, {
            offer,
            requestedInput: input,
            effectiveInput: preparedConfirmation.effectiveInput,
            statusFingerprint: statusFingerprint(status),
          });
          return preparedConfirmation.preparation;
        },
        execute: async (input, context) => {
          let paymentAttempted = false;
          try {
            const digest = context.mutationApproval?.quoteDigest;
            const prepared = digest ? preparedQuotes.current.get(digest) : undefined;
            if (!digest || !prepared || !sameRoutineInput(prepared.requestedInput, input)) {
              throw new GymApiError("QUOTE_CHANGED", 409);
            }
            preparedQuotes.current.delete(digest);
            const currentStatus = parseRoutineProStatus(
              await fetchBoundedJson<unknown>("/api/commerce/routine-pro/status", {}, context),
            );
            if (
              statusFingerprint(currentStatus) !== prepared.statusFingerprint ||
              currentStatus.entitled !== prepared.offer.entitled ||
              isRecovering(currentStatus)
            ) {
              throw new GymApiError(
                "QUOTE_CHANGED",
                409,
                "Routine Pro status changed. Call get_routine_pro_status before taking another action.",
              );
            }
            const endpoint = prepared.offer.entitled
              ? "/api/routines/personalized"
              : prepared.effectiveInput.paymentMode === "agent_wallet"
                ? "/api/commerce/routine-pro/agent-pay"
                : "/api/commerce/routine-pro/checkout";
            paymentAttempted = !prepared.offer.entitled;
            const response = await fetchBoundedJson<unknown>(
              endpoint,
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  ...prepared.effectiveInput,
                  initiatedVia: "webmcp",
                  quoteValidUntil: prepared.offer.quoteValidUntil,
                  quoteDigest: digest,
                }),
              },
              context,
            );
            const data = envelopeData(response);
            if (!data || typeof data !== "object") {
              throw new GymApiError("INVALID_RESPONSE", 502);
            }
            const record = data as Record<string, unknown>;
            if (typeof record.checkoutUrl === "string") {
              const checkout = new URL(record.checkoutUrl);
              if (checkout.protocol !== "https:" || checkout.hostname !== "checkout.stripe.com") {
                throw new GymApiError("INVALID_RESPONSE", 502);
              }
              trace("create_personalized_routine");
              window.setTimeout(() => window.location.assign(checkout), 0);
              return {
                paymentPending: true,
                orderRef: typeof record.orderRef === "string" ? record.orderRef : undefined,
                payer: "Human test checkout",
                sandbox: true,
                recoveryTool: "get_routine_pro_status",
                instruction:
                  "After returning from checkout or after any timeout, read status before taking another action. Never repeat the payment.",
              };
            }
            const status = RoutineStatusSchema.parse(data);
            applyRecoveredRoutine(status, context.signal);
            trace("create_personalized_routine");
            return {
              created: Boolean(status.routine),
              savedToPassport: status.routineSaved,
              ...statusToolResult(status),
              ...(status.routine
                ? {
                    routine: {
                      title: status.routine.title,
                      durationMinutes: status.routine.durationMinutes,
                      exercises: status.routine.exercises.length,
                      generationMode: status.routine.generationMode,
                      createdVia: status.routine.createdVia,
                      requiresExpertReview: status.routine.requiresExpertReview,
                      expertReviewReason: status.routine.expertReviewReason,
                      catalogVersion: status.routine.catalogVersion,
                    },
                  }
                : {}),
            };
          } catch (error) {
            if (
              paymentAttempted &&
              (!(error instanceof GymApiError) ||
                [
                  "ORDER_PENDING",
                  "RECONCILIATION_REQUIRED",
                  "FULFILLMENT_PENDING",
                  "PROVIDER_SETUP_RECONCILIATION_REQUIRED",
                ].includes(error.apiCode))
            ) {
              // Best-effort read so the page shows the recovery notice and
              // receipt; the tool result itself already instructs recovery.
              void fetchBoundedJson<unknown>("/api/commerce/routine-pro/status")
                .then((response) => applyRecoveredRoutine(parseRoutineProStatus(response)))
                .catch(() => undefined);
              throw new GymApiError(
                "ORDER_PENDING",
                409,
                "Payment confirmation is being recovered. We will not submit another payment. Call get_routine_pro_status and poll only while the order remains non-terminal.",
              );
            }
            throw error;
          } finally {
            finishMutationExecution();
          }
        },
      },
      record_session_feedback: {
        prepare: async (input, context) => {
          const currentResponse = await fetchBoundedJson<unknown>("/api/session", {}, context);
          const current = GeneratedSessionSchema.safeParse(
            currentResponse && typeof currentResponse === "object"
              ? (currentResponse as { session?: unknown }).session
              : undefined,
          );
          if (!current.success || current.data.id !== input.sessionId) {
            throw new GymApiError("SESSION_MISMATCH", 409);
          }
          if (preparedFeedback.current.size >= 20) {
            const oldest = preparedFeedback.current.keys().next().value;
            if (oldest) preparedFeedback.current.delete(oldest);
          }
          const quoteDigest = crypto.randomUUID();
          const completedExerciseIds = current.data.exercises.map((item) => item.equipmentId);
          preparedFeedback.current.set(quoteDigest, { completedExerciseIds, input });
          return {
            ...prepareFeedbackConfirmation(input, completedExerciseIds),
            quoteDigest,
          };
        },
        execute: async ({ sessionId, perceivedExertion, pain, notes }, context) => {
          try {
            const digest = context.mutationApproval?.quoteDigest;
            const prepared = digest ? preparedFeedback.current.get(digest) : undefined;
            const effectiveInput = { sessionId, perceivedExertion, pain, notes };
            if (!digest || !prepared || !sameFeedbackInput(prepared.input, effectiveInput)) {
              throw new GymApiError("QUOTE_CHANGED", 409);
            }
            preparedFeedback.current.delete(digest);
            const currentResponse = await fetchBoundedJson<unknown>("/api/session", {}, context);
            if (!currentResponse || typeof currentResponse !== "object") {
              throw new GymApiError("INVALID_RESPONSE", 502);
            }
            const current = GeneratedSessionSchema.safeParse(
              (currentResponse as { session?: unknown }).session,
            );
            if (!current.success || current.data.id !== sessionId) {
              throw new GymApiError("SESSION_MISMATCH", 409);
            }
            const completedExerciseIds = current.data.exercises.map((item) => item.equipmentId);
            if (
              JSON.stringify(completedExerciseIds) !== JSON.stringify(prepared.completedExerciseIds)
            ) {
              throw new GymApiError("SESSION_MISMATCH", 409);
            }
            const payload: SessionFeedback = {
              sessionId,
              perceivedEffort: perceivedExertion ?? 5,
              painDuringSession: pain ?? 0,
              completedExerciseIds: prepared.completedExerciseIds,
              ...(notes !== undefined ? { notes } : {}),
              submittedAt: new Date().toISOString(),
            };
            const response = await fetchBoundedJson<unknown>(
              "/api/feedback",
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
              },
              context,
            );
            trace("record_session_feedback");
            return response;
          } finally {
            finishMutationExecution();
          }
        },
      },
    }),
    [applyEquipmentSearch, applyRecoveredRoutine, finishMutationExecution, openEquipment, trace],
  );

  const completeCatalog = useMemo(() => createGymToolCatalog(handlers), [handlers]);
  const routeTools = useMemo(() => {
    const allowed = pathname.startsWith("/equipment")
      ? ["get_gym_profile", "search_equipment", "get_equipment"]
      : pathname === "/passport"
        ? [
            "get_gym_profile",
            ...(contextActive ? ["get_active_context", "get_routine_pro_status"] : []),
          ]
        : pathname === "/session/feedback"
          ? contextActive && hasPersistedRoutine
            ? ["get_active_context", "get_routine_pro_status", "record_session_feedback"]
            : []
          : pathname === "/session"
            ? [
                "get_gym_profile",
                "search_equipment",
                "get_equipment",
                ...(contextActive
                  ? [
                      "get_active_context",
                      "get_routine_pro_offer",
                      "get_routine_pro_status",
                      "create_personalized_routine",
                    ]
                  : []),
              ]
            : ["get_gym_profile", "search_equipment", "get_equipment"];
    return completeCatalog.filter((tool) => allowed.includes(tool.name));
  }, [completeCatalog, contextActive, hasPersistedRoutine, pathname]);

  const confirmMutation = useCallback<ConfirmMutation>(
    (request) => {
      if (request.signal?.aborted || activeConfirmation.current) return false;
      return new Promise<boolean>((resolve) => {
        activeConfirmation.current = request;
        confirmationResolver.current = resolve;
        confirmationApprovalScheduled.current = false;
        setConfirmationPhase(null);
        setConfirmation(request);

        const abort = () => {
          if (activeConfirmation.current !== request) return;
          confirmationResolver.current?.(false);
          clearConfirmation(request);
        };
        request.signal?.addEventListener("abort", abort, { once: true });
        confirmationAbortCleanup.current = () =>
          request.signal?.removeEventListener("abort", abort);
        if (request.signal?.aborted) abort();
      });
    },
    [clearConfirmation],
  );
  const decide = useCallback(
    (approved: boolean) => {
      const request = activeConfirmation.current;
      const resolve = confirmationResolver.current;
      if (!request || !resolve || confirmationApprovalScheduled.current) return;
      if (!approved) {
        resolve(false);
        clearConfirmation(request);
        return;
      }

      confirmationApprovalScheduled.current = true;
      setConfirmationPhase(webMcpMutationBusyLabel(request));
      confirmationApprovalFrame.current = window.requestAnimationFrame(() => {
        confirmationApprovalFrame.current = null;
        if (activeConfirmation.current !== request || request.signal?.aborted) return;
        confirmationResolver.current = null;
        resolve(true);
      });
    },
    [clearConfirmation],
  );
  const { status, error, toolNames } = useWebMCPTools(routeTools, {
    confirmMutation,
    maxOutputChars: 5000,
  });
  const isActive = status === "active";

  return (
    <>
      <div className={open ? "webmcp-status is-open" : "webmcp-status"}>
        <button
          className="webmcp-status__trigger"
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <span
            className={
              isActive
                ? "status-dot is-active"
                : status === "unavailable" || status === "error"
                  ? "status-dot is-unavailable"
                  : "status-dot"
            }
          />
          <span>
            <small>Current route</small>
            <strong>WebMCP {isActive ? "active" : status}</strong>
          </span>
          <ChevronDown size={15} />
        </button>
        {open ? (
          <section className="webmcp-popover" aria-label="WebMCP tool status">
            <div className="webmcp-popover__heading">
              <span>
                <Code2 size={17} /> Registered for {pathname}
              </span>
              <button onClick={() => setOpen(false)} type="button" aria-label="Close tool status">
                <X size={16} />
              </button>
            </div>
            {isActive ? (
              <div className="webmcp-banner is-active">
                <CircleCheck size={17} />
                <p>
                  <strong>Connected to document.modelContext</strong>
                  <span>{toolNames.length} route-scoped tools are registered.</span>
                </p>
              </div>
            ) : (
              <div className="webmcp-banner">
                <CircleAlert size={17} />
                <p>
                  <strong>
                    {status === "unavailable"
                      ? "WebMCP browser API unavailable"
                      : `WebMCP is ${status}`}
                  </strong>
                  <span>The ordinary site still works; this is not reported as an execution.</span>
                </p>
              </div>
            )}
            <div className="webmcp-tool-list">
              {routeTools.map((tool) => (
                <details key={tool.name}>
                  <summary>
                    <Sparkles size={13} />
                    <code>{tool.name}</code>
                    <span>{tool.annotations.readOnlyHint ? "Read" : "Confirm"}</span>
                  </summary>
                  <p>{tool.description}</p>
                </details>
              ))}
            </div>
            <div className="execution-log">
              <h3>
                <History size={14} /> Actual handler executions
              </h3>
              {events.length ? (
                events.map((event) => (
                  <p key={`${event.tool}-${event.at}`}>
                    <code>{event.tool}</code>
                    <time>{new Date(event.at).toLocaleTimeString()}</time>
                  </p>
                ))
              ) : (
                <p>No WebMCP handler has run in this browser session.</p>
              )}
            </div>
            {error ? (
              <p className="webmcp-error">
                {error instanceof Error ? error.message : "WebMCP registration failed."}
              </p>
            ) : null}
            <p className="fine-print">
              Definitions and execution history come from the exact handlers mounted on this route.
            </p>
          </section>
        ) : null}
      </div>
      {confirmation ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (!confirmationPhase) decide(false);
          }}
        >
          <section
            className="webmcp-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-busy={confirmationPhase !== null}
            aria-labelledby="webmcp-confirm-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">WebMCP · Human confirmation</p>
            <h2 id="webmcp-confirm-title">{confirmation.title}</h2>
            <p>{confirmation.description}</p>
            <dl className="confirmation-fields">
              {confirmation.fields.map((field) => (
                <div key={field.label}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
            <div>
              <button
                type="button"
                className="button button--light"
                disabled={confirmationPhase !== null}
                onClick={() => decide(false)}
              >
                {confirmation.cancelLabel ?? "Decline"}
              </button>
              <button
                type="button"
                className="button button--lime"
                disabled={confirmationPhase !== null}
                aria-busy={confirmationPhase !== null}
                aria-live="polite"
                onClick={() => decide(true)}
              >
                {confirmationPhase ? (
                  <>
                    <LoaderCircle className="spin" size={18} aria-hidden="true" />
                    {confirmationPhase}
                  </>
                ) : (
                  (confirmation.confirmLabel ?? "Confirm action")
                )}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
