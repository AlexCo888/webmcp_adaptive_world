"use client";

import {
  EquipmentSchema,
  GeneratedSessionSchema,
  GymContextProjectionSchema,
  RoutineProOfferSchema,
  type RoutineProOffer,
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
  pendingRoutineProOrder,
  type PendingRoutineProOrder,
} from "@/lib/routine-pro-client-state";
import {
  prepareFeedbackConfirmation,
  prepareRoutineProConfirmation,
  webMcpMutationBusyLabel,
} from "@/lib/webmcp-confirmations";
import { recommendFacilityTemplate } from "@/lib/session-planner";

type ExecutionEvent = { tool: string; at: string };
type PreparedQuote = {
  offer: RoutineProOffer;
  requestedInput: CreatePersonalizedRoutineInput;
  effectiveInput: CreatePersonalizedRoutineInput & {
    templateId: NonNullable<CreatePersonalizedRoutineInput["templateId"]>;
  };
  pending: PendingRoutineProOrder | null;
};
type PreparedFeedback = {
  completedExerciseIds: string[];
  input: RecordSessionFeedbackInput;
};

function sameRoutineInput(
  left: CreatePersonalizedRoutineInput,
  right: CreatePersonalizedRoutineInput,
): boolean {
  return (
    left.goal.trim() === right.goal.trim() &&
    left.templateId === right.templateId &&
    left.paymentMode === right.paymentMode
  );
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

function parseRoutineProStatus(value: unknown): {
  entitled: boolean;
  pending: PendingRoutineProOrder | null;
} {
  const data = envelopeData(value);
  if (!data || typeof data !== "object") throw new GymApiError("INVALID_RESPONSE", 502);
  const record = data as Record<string, unknown>;
  if (typeof record.entitled !== "boolean") throw new GymApiError("INVALID_RESPONSE", 502);
  const pending = pendingRoutineProOrder(record);
  if (record.entitled === false && record.orderRef !== undefined && !pending) {
    throw new GymApiError("INVALID_RESPONSE", 502);
  }
  return { entitled: record.entitled, pending };
}

function samePendingPayment(
  prepared: PendingRoutineProOrder | null,
  current: PendingRoutineProOrder | null,
): boolean {
  if (!prepared || !current) return prepared === current;
  return (
    current.canResume &&
    prepared.orderRef === current.orderRef &&
    prepared.payerLabel === current.payerLabel &&
    prepared.initialTemplateId === current.initialTemplateId &&
    prepared.initialGoal === current.initialGoal
  );
}

export function WebMcpBridge() {
  const pathname = usePathname();
  const {
    contextActive,
    setContextActive,
    applyEquipmentSearch,
    openEquipment,
    applyPersonalizedRoutine,
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
        // Publish the tool result before mirroring it into the route UI. The
        // provider update must not invalidate the invocation that caused it.
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
        // Let the WebMCP promise publish its bounded result before this
        // route change tears down the route-scoped registration.
        window.setTimeout(() => openEquipment(item.slug), 0);
        trace("get_equipment");
        return { equipment: compactEquipmentForTool(item) };
      },
      get_active_context: async (_input, context) => {
        const response = await fetchBoundedJson<unknown>("/api/context/current", {}, context);
        if (!response || typeof response !== "object")
          throw new GymApiError("INVALID_RESPONSE", 502);
        const record = response as Record<string, unknown>;
        if (record.active !== true) throw new GymApiError("CONTEXT_REQUIRED", 401);
        const projection = GymContextProjectionSchema.parse(record.projection);
        trace("get_active_context");
        return { active: true, projection };
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
            paid: "Personalized routine creation and Passport saving",
          },
        };
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
          const projection = GymContextProjectionSchema.parse(
            (contextResponse as Record<string, unknown>).projection,
          );
          if (offer.entitled !== status.entitled) {
            throw new GymApiError(
              "QUOTE_CHANGED",
              409,
              "Routine Pro status changed. Review the current offer again.",
            );
          }
          if (status.pending && !status.pending.canResume) {
            throw new GymApiError(
              "ORDER_PENDING",
              409,
              "The existing payment is being reconciled and cannot be resumed yet.",
            );
          }
          if (!offer.entitled && offer.supportedModes.length === 0) {
            throw new GymApiError("PROVIDER_UNAVAILABLE", 503);
          }
          const requestedForConfirmation = {
            ...input,
            paymentMode:
              input.paymentMode ??
              (!offer.entitled
                ? offer.supportedModes.includes("agent_wallet")
                  ? "agent_wallet"
                  : offer.supportedModes[0]
                : undefined),
          };
          const preparedConfirmation = prepareRoutineProConfirmation({
            offer,
            requestedInput: requestedForConfirmation,
            recommendedTemplateId: recommendFacilityTemplate(projection, input.goal),
            pending: status.pending,
          });
          const effectiveMode = preparedConfirmation.effectiveInput.paymentMode;
          if (!offer.entitled && effectiveMode && !offer.supportedModes.includes(effectiveMode)) {
            throw new GymApiError("PROVIDER_UNAVAILABLE", 503);
          }
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
            pending: status.pending,
          });
          return preparedConfirmation.preparation;
        },
        execute: async (input, context) => {
          try {
            const digest = context.mutationApproval?.quoteDigest;
            const prepared = digest ? preparedQuotes.current.get(digest) : undefined;
            if (!digest || !prepared || !sameRoutineInput(prepared.requestedInput, input)) {
              throw new GymApiError("QUOTE_CHANGED", 409);
            }
            preparedQuotes.current.delete(digest);
            const currentStatus = parseRoutineProStatus(
              await fetchBoundedJson<unknown>(
                prepared.pending
                  ? `/api/commerce/routine-pro/status?order=${encodeURIComponent(prepared.pending.orderRef)}`
                  : "/api/commerce/routine-pro/status",
                {},
                context,
              ),
            );
            if (
              currentStatus.entitled !== prepared.offer.entitled ||
              !samePendingPayment(prepared.pending, currentStatus.pending)
            ) {
              throw new GymApiError(
                "QUOTE_CHANGED",
                409,
                "Routine Pro status changed. Review the current action again.",
              );
            }
            const endpoint = prepared.offer.entitled
              ? "/api/routines/personalized"
              : prepared.effectiveInput.paymentMode === "agent_wallet"
                ? "/api/commerce/routine-pro/agent-pay"
                : "/api/commerce/routine-pro/checkout";
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
            if (!data || typeof data !== "object") throw new GymApiError("INVALID_RESPONSE", 502);
            const record = data as Record<string, unknown>;
            if (record.session && typeof record.savedRoutineRef === "string") {
              const session = GeneratedSessionSchema.parse(record.session);
              applyPersonalizedRoutine(session, record.savedRoutineRef);
              trace("create_personalized_routine");
              return {
                created: true,
                savedToPassport: true,
                savedRoutineRef: record.savedRoutineRef,
                routine: {
                  title: session.title,
                  durationMinutes: session.durationMinutes,
                  stations: session.exercises.length,
                  template: `${session.templateId}@${session.templateVersion}`,
                  catalogVersion: session.catalogVersion,
                },
              };
            }
            if (typeof record.checkoutUrl === "string") {
              const checkout = new URL(record.checkoutUrl);
              if (checkout.protocol !== "https:" || checkout.hostname !== "checkout.stripe.com") {
                throw new GymApiError("INVALID_RESPONSE", 502);
              }
              trace("create_personalized_routine");
              window.setTimeout(() => window.location.assign(checkout), 0);
              return {
                paymentPending: true,
                payer: "Human test checkout",
                resumeExisting: record.resumed === true,
              };
            }
            throw new GymApiError("INVALID_RESPONSE", 502);
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
    [applyEquipmentSearch, applyPersonalizedRoutine, finishMutationExecution, openEquipment, trace],
  );

  const completeCatalog = useMemo(() => createGymToolCatalog(handlers), [handlers]);
  const routeTools = useMemo(() => {
    const allowed = pathname.startsWith("/equipment")
      ? ["get_gym_profile", "search_equipment", "get_equipment"]
      : pathname === "/passport"
        ? ["get_gym_profile", ...(contextActive ? ["get_active_context"] : [])]
        : pathname === "/session/feedback"
          ? contextActive && hasPersistedRoutine
            ? ["get_active_context", "record_session_feedback"]
            : []
          : pathname === "/session"
            ? [
                "get_gym_profile",
                "search_equipment",
                "get_equipment",
                ...(contextActive
                  ? ["get_active_context", "get_routine_pro_offer", "create_personalized_routine"]
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
    maxOutputChars: 1500,
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
