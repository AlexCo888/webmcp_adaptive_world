"use client";

import {
  GeneratedSessionSchema,
  GymContextProjectionSchema,
  RoutineProOfferSchema,
  RoutineStatusSchema,
  type Equipment,
  type GeneratedSession,
  type GymContextProjection,
  type RoutineProOffer,
  type RoutineStatus,
} from "@adaptive-world/contracts";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  Clock3,
  ClipboardCheck,
  Dumbbell,
  Fingerprint,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useGymExperience } from "@/components/gym-experience-context";
import { fetchBoundedJson, GymApiError } from "@/lib/api-client";
import {
  EXPERT_REVIEW_WARNING,
  defaultRoutineGoal,
  facilityTemplates,
  recommendFacilityTemplate,
  type FacilityTemplate,
} from "@/lib/session-planner";
import { prepareStaffWalkthroughConfirmation } from "@/lib/webmcp-confirmations";

type PlannerState =
  "loading-context" | "idle" | "preparing" | "submitting" | "recovering" | "error";
type PaymentMode = "human_checkout" | "agent_wallet";

/** Payment left the site and its outcome is unknown until the provider confirms. */
const RECOVERING_ORDER_STATES = new Set(["payment_submitted", "reconciliation_required"]);
/**
 * No payment was submitted, or it was verified but not yet fulfilled. Resuming
 * re-posts the exact same intent; the server reuses the order or completes
 * fulfillment and never creates a second charge.
 */
const RESUMABLE_ORDER_STATES = new Set(["created", "provider_pending", "paid_unfulfilled"]);
const NON_TERMINAL_ORDER_STATES = new Set([...RECOVERING_ORDER_STATES, ...RESUMABLE_ORDER_STATES]);
const RECOVERY_MESSAGE =
  "Payment confirmation is being recovered. We will not submit another payment.";
const PENDING_PAYMENT_CODES = new Set([
  "ORDER_PENDING",
  "RECONCILIATION_REQUIRED",
  "FULFILLMENT_PENDING",
  "PROVIDER_SETUP_PENDING",
  "PROVIDER_SETUP_RECONCILIATION_REQUIRED",
]);

function getEnvelopeData(value: unknown): unknown {
  if (!value || typeof value !== "object" || (value as Record<string, unknown>).ok !== true) {
    throw new GymApiError("INVALID_RESPONSE", 502);
  }
  return (value as Record<string, unknown>).data;
}

function isNonTerminal(status: RoutineStatus | null): boolean {
  return Boolean(status?.orderStatus && NON_TERMINAL_ORDER_STATES.has(status.orderStatus));
}

function isRecovering(status: RoutineStatus | null): boolean {
  return Boolean(status?.orderStatus && RECOVERING_ORDER_STATES.has(status.orderStatus));
}

function isResumable(status: RoutineStatus | null): boolean {
  return Boolean(
    status?.orderStatus && RESUMABLE_ORDER_STATES.has(status.orderStatus) && status.canResume,
  );
}

function providerLabel(status: RoutineStatus): string {
  if (status.provider === "mpp_tempo") return "MPP / Tempo testnet";
  if (status.provider === "stripe_checkout") return "Stripe test mode";
  return "Payment provider pending";
}

function formattedTimestamp(value?: string): string {
  if (!value) return "Pending";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function tempoExplorerUrl(status: RoutineStatus): string | null {
  if (
    status.provider !== "mpp_tempo" ||
    !status.providerPaymentRef ||
    !/^0x[0-9a-f]{64}$/iu.test(status.providerPaymentRef)
  ) {
    return null;
  }
  return `https://explore.tempo.xyz/tx/${status.providerPaymentRef}`;
}

function passportRoutineUrl(savedRoutineRef: string): string {
  return `${process.env.NEXT_PUBLIC_PASSPORT_URL ?? "http://127.0.0.1:3000"}/routines/${savedRoutineRef}`;
}

function isTemplateId(value: string): value is FacilityTemplate["id"] {
  return facilityTemplates.some((template) => template.id === value);
}

export function SessionPlanner({ equipment }: { equipment: Equipment[] }) {
  const experience = useGymExperience();
  const [context, setContext] = useState<GymContextProjection | null>(null);
  const [session, setSession] = useState<GeneratedSession | null>(null);
  const [savedRoutineRef, setSavedRoutineRef] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<RoutineStatus | null>(null);
  const [state, setState] = useState<PlannerState>("loading-context");
  const [message, setMessage] = useState("");

  // Site-UI purchase path: a person without an agent chooses a published
  // staff walkthrough. Nothing here generates a routine.
  const [goal, setGoal] = useState("");
  const [templateId, setTemplateId] = useState<FacilityTemplate["id"]>("first_visit_foundations");
  const [templateManuallySelected, setTemplateManuallySelected] = useState(false);
  const [offer, setOffer] = useState<RoutineProOffer | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("human_checkout");
  const [resumingPayment, setResumingPayment] = useState(false);

  const adoptStatus = useCallback((status: RoutineStatus) => {
    setReceipt(status);
    if (status.routine) setSession(status.routine);
    if (status.savedRoutineRef) setSavedRoutineRef(status.savedRoutineRef);
    if (status.routine?.createdVia === "site-ui" && isTemplateId(status.routine.templateId)) {
      setTemplateId(status.routine.templateId);
      setTemplateManuallySelected(true);
      setGoal(status.routine.goal);
    }
  }, []);

  const readStatus = useCallback(async (orderRef?: string, signal?: AbortSignal) => {
    const suffix = orderRef ? `?order=${encodeURIComponent(orderRef)}` : "";
    const response = await fetchBoundedJson<unknown>(
      `/api/commerce/routine-pro/status${suffix}`,
      {},
      { signal },
    );
    return RoutineStatusSchema.parse(getEnvelopeData(response));
  }, []);

  // Polls the durable order status while it is non-terminal. Started by a
  // return from checkout, a pending order found on load, or a WebMCP tool that
  // observed a pending payment. It only reads; it never resubmits a payment.
  const [pollTarget, setPollTarget] = useState<{ orderRef?: string; nonce: number } | null>(null);
  useEffect(() => {
    if (!pollTarget) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let attempts = 0;
    const clearReturnUrl = () => window.history.replaceState({}, "", "/session");
    const poll = async () => {
      attempts += 1;
      try {
        const current = await readStatus(pollTarget.orderRef, controller.signal);
        if (controller.signal.aborted) return;
        adoptStatus(current);
        if (current.orderStatus === "fulfilled" && current.routineSaved) {
          setState("idle");
          setMessage("");
          clearReturnUrl();
          return;
        }
        if (!isNonTerminal(current)) {
          setState(current.orderStatus === "fulfilled" ? "idle" : "error");
          setMessage(
            current.orderStatus === "fulfilled"
              ? "Payment is confirmed; the saved routine record is still being reconciled."
              : `Order reached terminal state: ${current.orderStatus ?? "unknown"}.`,
          );
          clearReturnUrl();
          return;
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (attempts >= 40) {
          setState("error");
          setMessage(
            error instanceof Error
              ? error.message
              : "Payment status is still being reconciled. No second payment was submitted.",
          );
          return;
        }
      }
      if (attempts < 40) {
        timer = window.setTimeout(() => void poll(), 1_500);
        return;
      }
      setMessage(
        "Payment confirmation is still being recovered. Reload later or ask your agent to call get_routine_pro_status. We will not submit another payment.",
      );
    };
    void poll();
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [adoptStatus, pollTarget, readStatus]);

  useEffect(() => {
    const controller = new AbortController();
    const clearReturnUrl = () => window.history.replaceState({}, "", "/session");

    async function load() {
      const params = new URLSearchParams(window.location.search);
      const orderRef = params.get("order") ?? undefined;
      const returnState = params.get("routinePro");
      const [contextResult, sessionResult, statusResult] = await Promise.allSettled([
        fetchBoundedJson<unknown>("/api/context/current", {}, { signal: controller.signal }),
        fetchBoundedJson<unknown>("/api/session", {}, { signal: controller.signal }),
        readStatus(orderRef, controller.signal),
      ]);
      if (controller.signal.aborted) return;

      if (contextResult.status === "fulfilled") {
        const value = contextResult.value;
        const parsed = GymContextProjectionSchema.safeParse(
          value && typeof value === "object"
            ? (value as Record<string, unknown>).projection
            : undefined,
        );
        setContext(parsed.success ? parsed.data : null);
        if (parsed.success) setGoal((current) => current || defaultRoutineGoal(parsed.data));
      }
      if (sessionResult.status === "fulfilled") {
        const value = sessionResult.value;
        const parsed = GeneratedSessionSchema.safeParse(
          value && typeof value === "object"
            ? (value as Record<string, unknown>).session
            : undefined,
        );
        if (parsed.success) setSession(parsed.data);
      }
      const initialStatus = statusResult.status === "fulfilled" ? statusResult.value : null;
      if (initialStatus) adoptStatus(initialStatus);

      if (returnState === "cancelled" && orderRef) {
        try {
          await fetchBoundedJson<unknown>(
            "/api/commerce/routine-pro/cancel",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ orderRef }),
            },
            { signal: controller.signal },
          );
          adoptStatus(await readStatus(orderRef, controller.signal));
          setMessage("Stripe test checkout was closed. No second payment was submitted.");
          setState("idle");
          clearReturnUrl();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Payment status is unavailable.");
          setState("error");
        }
        return;
      }

      if (returnState === "success" || isRecovering(initialStatus)) {
        setState("recovering");
        setMessage(RECOVERY_MESSAGE);
        setPollTarget({ orderRef: orderRef ?? initialStatus?.orderRef, nonce: Date.now() });
        return;
      }
      setState("idle");
    }

    void load();
    return () => controller.abort();
  }, [adoptStatus, readStatus]);

  // A WebMCP tool observed a Routine Pro status (a receipt, or a payment whose
  // outcome is still being recovered). Mirror it here so the human sees it.
  useEffect(() => {
    const observed = experience.routineProStatus;
    if (!observed) return;
    adoptStatus(observed.status);
    if (isRecovering(observed.status)) {
      setState("recovering");
      setMessage(RECOVERY_MESSAGE);
      setPollTarget({ orderRef: observed.status.orderRef, nonce: observed.revision });
    } else if (observed.status.orderStatus === "fulfilled") {
      setState("idle");
      setMessage("");
    }
  }, [adoptStatus, experience.routineProStatus]);

  useEffect(() => {
    if (!experience.personalizedRoutine || !experience.savedRoutineRef) return;
    setSession(experience.personalizedRoutine);
    setSavedRoutineRef(experience.savedRoutineRef);
    void readStatus()
      .then(adoptStatus)
      .catch(() => undefined);
    window.setTimeout(
      () => document.querySelector(".session-canvas")?.scrollIntoView({ behavior: "smooth" }),
      0,
    );
  }, [adoptStatus, experience.personalizedRoutine, experience.savedRoutineRef, readStatus]);

  useEffect(() => {
    if (!context || templateManuallySelected || goal.trim().length < 2) return;
    setTemplateId(recommendFacilityTemplate(context, goal));
  }, [context, goal, templateManuallySelected]);

  const busy = state === "preparing" || state === "submitting" || state === "recovering";
  const activeSessionOrder = isResumable(receipt) && receipt?.orderScope !== "earlier_session";
  const pendingSitePayment = activeSessionOrder && receipt?.initiatedVia === "site-ui";
  const pendingAgentPayment = activeSessionOrder && receipt?.initiatedVia !== "site-ui";
  const earlierSessionOrder = isResumable(receipt) && receipt?.orderScope === "earlier_session";
  const selectedTemplate = useMemo(
    () => facilityTemplates.find((template) => template.id === templateId) ?? facilityTemplates[0]!,
    [templateId],
  );
  const confirmation = useMemo(
    () =>
      offer && context
        ? prepareStaffWalkthroughConfirmation({
            offer,
            template: selectedTemplate,
            goal,
            paymentMode: offer.entitled ? undefined : paymentMode,
            projection: context,
            equipment,
          })
        : null,
    [context, equipment, goal, offer, paymentMode, selectedTemplate],
  );

  async function loadOffer(): Promise<RoutineProOffer> {
    const response = await fetchBoundedJson<unknown>("/api/commerce/routine-pro/offer");
    const prepared = RoutineProOfferSchema.parse(getEnvelopeData(response));
    if (!prepared.entitled && prepared.supportedModes.length === 0) {
      throw new GymApiError("PROVIDER_UNAVAILABLE", 503, "Sandbox payment is unavailable.");
    }
    return prepared;
  }

  async function prepareWalkthroughPurchase() {
    if (!context) {
      setMessage("Connect a Passport context before saving a walkthrough.");
      setState("error");
      return;
    }
    if (goal.trim().length < 2) {
      setMessage("Describe what you want this routine to support in your own words.");
      setState("error");
      return;
    }
    setState("preparing");
    setMessage("");
    try {
      const current = await readStatus();
      adoptStatus(current);
      if (isRecovering(current)) {
        setState("recovering");
        setMessage(RECOVERY_MESSAGE);
        return;
      }
      if (isResumable(current) && current.orderScope !== "earlier_session") {
        setState("idle");
        setMessage("A sandbox payment is already open for this Gym session. Resume or cancel it.");
        return;
      }
      const prepared = await loadOffer();
      setOffer(prepared);
      setPaymentMode(
        prepared.supportedModes.includes("human_checkout") ? "human_checkout" : "agent_wallet",
      );
      setResumingPayment(false);
      setState("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Pro offer is unavailable.");
      setState("error");
    }
  }

  async function resumePendingPayment() {
    if (!receipt?.orderRef) return;
    setState("preparing");
    setMessage("");
    try {
      const current = await readStatus(receipt.orderRef);
      adoptStatus(current);
      if (!isResumable(current) || current.initiatedVia !== "site-ui") {
        setState(isRecovering(current) ? "recovering" : "idle");
        setMessage(
          isRecovering(current)
            ? RECOVERY_MESSAGE
            : "The previous payment is no longer pending. Review the current offer again.",
        );
        return;
      }
      const prepared = await loadOffer();
      const mode: PaymentMode =
        current.payerLabel === "Adaptive World demo agent" ? "agent_wallet" : "human_checkout";
      if (!prepared.entitled && !prepared.supportedModes.includes(mode)) {
        throw new GymApiError("PROVIDER_UNAVAILABLE", 503);
      }
      setPaymentMode(mode);
      setOffer(prepared);
      setResumingPayment(true);
      setState("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The payment could not be resumed.");
      setState("error");
    }
  }

  async function cancelPendingPayment() {
    if (!receipt?.orderRef) return;
    setState("preparing");
    setMessage("");
    try {
      await fetchBoundedJson<unknown>("/api/commerce/routine-pro/cancel", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderRef: receipt.orderRef }),
      });
      adoptStatus(await readStatus(receipt.orderRef));
      setMessage("The unpaid order was released. No payment was submitted.");
      setState("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The order could not be cancelled.");
      setState("error");
    }
  }

  async function confirmWalkthroughPurchase() {
    if (!offer || state === "submitting") return;
    setState("submitting");
    setMessage("");
    try {
      const endpoint = offer.entitled
        ? "/api/routines/personalized"
        : paymentMode === "agent_wallet"
          ? "/api/commerce/routine-pro/agent-pay"
          : "/api/commerce/routine-pro/checkout";
      const response = await fetchBoundedJson<unknown>(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          initiatedVia: "site-ui",
          templateId,
          goal: goal.trim(),
          ...(!offer.entitled ? { paymentMode } : {}),
          quoteValidUntil: offer.quoteValidUntil,
          quoteDigest: offer.quoteDigest,
        }),
      });
      const data = getEnvelopeData(response);
      const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
      if (typeof record.checkoutUrl === "string") {
        const checkout = new URL(record.checkoutUrl);
        if (checkout.protocol !== "https:" || checkout.hostname !== "checkout.stripe.com") {
          throw new GymApiError("INVALID_RESPONSE", 502);
        }
        window.location.assign(checkout);
        return;
      }
      const status = RoutineStatusSchema.parse(data);
      adoptStatus(status);
      setOffer(null);
      setResumingPayment(false);
      setState("idle");
      window.setTimeout(
        () => document.querySelector(".session-canvas")?.scrollIntoView({ behavior: "smooth" }),
        0,
      );
    } catch (error) {
      setOffer(null);
      setResumingPayment(false);
      const pending =
        !(error instanceof GymApiError) ||
        PENDING_PAYMENT_CODES.has(error.apiCode) ||
        error.apiCode.startsWith("HTTP_");
      if (pending && !offer.entitled) {
        const current = await readStatus().catch(() => null);
        if (current) adoptStatus(current);
        setState(isRecovering(current) ? "recovering" : "idle");
        setMessage(
          isRecovering(current) || !(error instanceof GymApiError)
            ? RECOVERY_MESSAGE
            : error.message,
        );
        return;
      }
      setMessage(error instanceof Error ? error.message : "The routine could not be saved.");
      setState("error");
    }
  }

  if (state === "loading-context") {
    return (
      <section className="context-state card">
        <LoaderCircle className="spin" size={32} />
        <h2>Loading your Gym session…</h2>
        <p>The active projection and payment receipt are resolved server-side.</p>
      </section>
    );
  }

  return (
    <div className="planner-grid planner-grid--templates">
      <aside className="planner-controls card">
        <div className="panel-heading">
          <span className="panel-heading__icon">
            <ClipboardCheck size={19} />
          </span>
          <div>
            <p>Adaptive Routine Pro · $4.99 test USD</p>
            <h2>Two ways to unlock</h2>
          </div>
        </div>
        {context ? (
          <div className="active-context">
            <Fingerprint size={16} />
            <span>
              <strong>{context.subjectAlias}</strong>
              {context.movementConsiderations.length} movement signals ·{" "}
              {context.stopSignals.length} stop signals
            </span>
            <Link href="/passport">Review</Link>
          </div>
        ) : (
          <div className="context-required">
            <Fingerprint size={19} />
            <div>
              <strong>Passport context required</strong>
              <p>Only an explicitly consented Gym projection can be used.</p>
            </div>
            <Link href="/passport" className="button button--dark button--small">
              Connect
            </Link>
          </div>
        )}

        <section aria-labelledby="agent-path-heading">
          <p className="eyebrow">With your agent · WebMCP</p>
          <h3 id="agent-path-heading">Agent-generated personalized routine</h3>
          <div className="decision-trace">
            <ol>
              <li>Your agent reads the active minimum Passport projection.</li>
              <li>It inspects verified, currently available Gym equipment.</li>
              <li>It creates a new structured routine in its own reasoning context.</li>
              <li>
                Adaptive Gym shows the exact proposal, validates it, processes the sandbox payment,
                and saves it to Passport.
              </li>
            </ol>
          </div>
          <div className="info-notice" role="status">
            <Bot size={17} />
            <span>
              Tools: <code>get_active_context</code>, <code>search_equipment</code>,{" "}
              <code>get_equipment</code>, <code>create_personalized_routine</code>,{" "}
              <code>get_routine_pro_status</code>.
            </span>
          </div>
        </section>

        <section aria-labelledby="site-path-heading">
          <p className="eyebrow">On this site · no agent</p>
          <h3 id="site-path-heading">Choose a published staff walkthrough</h3>
          <p className="fine-print">
            Without an agent, the Gym does not generate a personalized routine. Pick a versioned
            staff walkthrough; it is grounded in your approved context and saved to Passport.
          </p>
          <label className="routine-goal-field" htmlFor="routine-goal">
            <span>
              <strong>Your goal</strong>
              <small>{goal.length}/160</small>
            </span>
            <textarea
              id="routine-goal"
              rows={3}
              maxLength={160}
              value={goal}
              disabled={busy || pendingSitePayment || pendingAgentPayment}
              placeholder="For example: support lifelong health without bodybuilding-style muscle gain"
              onChange={(event) => {
                setGoal(event.target.value);
                setTemplateManuallySelected(false);
              }}
            />
            <small>Saved with the walkthrough exactly as written.</small>
          </label>
          <div className="template-list" role="radiogroup" aria-label="Staff walkthrough">
            {facilityTemplates.map((template) => (
              <button
                type="button"
                role="radio"
                aria-checked={templateId === template.id}
                className={`template-option ${templateId === template.id ? "is-selected" : ""}`}
                key={template.id}
                disabled={busy || pendingSitePayment || pendingAgentPayment}
                onClick={() => {
                  setTemplateId(template.id);
                  setTemplateManuallySelected(true);
                }}
              >
                <span>
                  <strong>{template.name}</strong>
                  <small>
                    {template.durationMinutes} min · v{template.version}
                  </small>
                </span>
                <p>{template.summary}</p>
                <em>{template.bestFor}</em>
              </button>
            ))}
          </div>
          {message && state !== "error" && state !== "recovering" ? (
            <div className="info-notice" role="status">
              {busy ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />}
              {message}
            </div>
          ) : null}
          {earlierSessionOrder ? (
            <div className="info-notice" role="status">
              <ShieldCheck size={17} />
              <span>
                An unpaid order from an earlier Gym session is still open. Continuing releases it
                and starts a fresh order for this session; no second charge is created.{" "}
                <button
                  type="button"
                  className="button button--light button--small"
                  disabled={busy}
                  onClick={() => void cancelPendingPayment()}
                >
                  Cancel it now
                </button>
              </span>
            </div>
          ) : null}
          {pendingSitePayment || pendingAgentPayment ? (
            <section className="pending-payment-state" aria-labelledby="pending-payment-heading">
              <p className="eyebrow">Adaptive Routine Pro</p>
              <h3 id="pending-payment-heading">Payment already in progress</h3>
              <p>
                {pendingSitePayment
                  ? "Continue the existing order. Its payer and walkthrough are locked so a second charge cannot be started."
                  : "Your agent started this order. Complete or cancel it there, or release it here. No second charge can be started."}
              </p>
              <dl>
                <div>
                  <dt>Payer</dt>
                  <dd>{receipt?.payerLabel ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    {receipt?.orderStatus === "created" ? "Preparing payment" : "Ready to resume"}
                  </dd>
                </div>
                <div>
                  <dt>Goal</dt>
                  <dd>{receipt?.initialGoal ?? goal}</dd>
                </div>
              </dl>
              {pendingSitePayment ? (
                <button
                  type="button"
                  className="button button--lime button--block"
                  disabled={busy}
                  aria-busy={state === "preparing"}
                  onClick={() => void resumePendingPayment()}
                >
                  {state === "preparing" ? (
                    <>
                      <LoaderCircle className="spin" size={18} /> Checking existing payment…
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={18} /> Resume {receipt?.payerLabel?.toLowerCase()}
                    </>
                  )}
                </button>
              ) : null}
              <button
                type="button"
                className="button button--light button--block"
                disabled={busy}
                onClick={() => void cancelPendingPayment()}
              >
                Cancel unpaid order
              </button>
            </section>
          ) : (
            <button
              type="button"
              className="button button--lime button--block"
              disabled={busy || !context || goal.trim().length < 2}
              aria-busy={state === "preparing"}
              onClick={() => void prepareWalkthroughPurchase()}
            >
              {state === "preparing" ? (
                <>
                  <LoaderCircle className="spin" size={18} /> Checking Routine Pro status…
                </>
              ) : state === "submitting" ? (
                <>
                  <LoaderCircle className="spin" size={18} /> Saving walkthrough…
                </>
              ) : (
                <>
                  <ShieldCheck size={18} /> Save walkthrough with Routine Pro <small>Pro</small>
                </>
              )}
            </button>
          )}
        </section>

        <p className="fine-print">
          Personalized routines are generated by the user-selected agent from the approved Passport
          projection and verified Gym inventory, then validated and saved by Adaptive Gym. The Gym
          and Passport applications never call an AI model. Staff walkthroughs are labeled as staff
          walkthroughs, never as agent-generated.
        </p>
      </aside>

      <section className="session-canvas" aria-live="polite">
        {state === "recovering" ? (
          <div className="info-notice" role="status">
            <LoaderCircle className="spin" size={18} />
            {message}
          </div>
        ) : null}
        {state === "error" ? (
          <div className="error-notice">
            <AlertTriangle size={18} />
            {message}
          </div>
        ) : null}
        {session ? (
          <SessionResult
            session={session}
            equipment={equipment}
            savedRoutineRef={savedRoutineRef}
            receipt={receipt}
            onReset={() => setSession(null)}
          />
        ) : (
          <div className="session-empty">
            <div className="session-empty__orbit">
              <Dumbbell size={38} />
            </div>
            <p className="eyebrow">External intelligence · first-party validation</p>
            <h2>Your routine will appear here.</h2>
            <p>
              An agent-generated proposal is shown in full and confirmed before the paid write. A
              staff walkthrough chosen on this site is shown the same way.
            </p>
            {receipt ? <RoutineReceipt status={receipt} savedRoutineRef={savedRoutineRef} /> : null}
          </div>
        )}
      </section>

      {offer && confirmation ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (state !== "submitting") {
              setOffer(null);
              setResumingPayment(false);
            }
          }}
        >
          <section
            className="webmcp-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="routine-confirm-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">Adaptive Routine Pro</p>
            <h2 id="routine-confirm-title">
              {resumingPayment ? "Resume your existing sandbox payment?" : confirmation.title}
            </h2>
            <p>{confirmation.description}</p>
            <dl className="confirmation-fields">
              {confirmation.fields.map((field) => (
                <div key={field.label}>
                  <dt>{field.label}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
            {!offer.entitled && offer.supportedModes.length > 1 && !resumingPayment ? (
              <fieldset className="payment-choice" disabled={state === "submitting"}>
                <legend>Choose sandbox payer</legend>
                <label>
                  <input
                    type="radio"
                    name="payment-mode"
                    checked={paymentMode === "human_checkout"}
                    onChange={() => setPaymentMode("human_checkout")}
                  />
                  Human Stripe test checkout
                </label>
                <label>
                  <input
                    type="radio"
                    name="payment-mode"
                    checked={paymentMode === "agent_wallet"}
                    onChange={() => setPaymentMode("agent_wallet")}
                  />
                  Adaptive World demo agent wallet (MPP / Tempo testnet)
                </label>
              </fieldset>
            ) : null}
            {state === "submitting" ? (
              <p className="payment-phase-note" role="status" aria-live="polite">
                <LoaderCircle className="spin" size={17} />
                {offer.entitled
                  ? "Saving the staff walkthrough to Passport…"
                  : paymentMode === "agent_wallet"
                    ? "Confirming the Tempo testnet payment…"
                    : "Opening Stripe test checkout…"}
              </p>
            ) : null}
            <div>
              <button
                className="button button--light"
                disabled={state === "submitting"}
                onClick={() => {
                  setOffer(null);
                  setResumingPayment(false);
                }}
              >
                Cancel
              </button>
              <button
                className="button button--lime"
                disabled={state === "submitting"}
                aria-busy={state === "submitting"}
                onClick={() => void confirmWalkthroughPurchase()}
              >
                {state === "submitting" ? (
                  <>
                    <LoaderCircle className="spin" size={17} /> Working…
                  </>
                ) : resumingPayment ? (
                  paymentMode === "agent_wallet" ? (
                    "Resume agent payment"
                  ) : (
                    "Resume test checkout"
                  )
                ) : (
                  confirmation.confirmLabel
                )}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function RoutineReceipt({
  status,
  savedRoutineRef,
}: {
  status: RoutineStatus;
  savedRoutineRef: string | null;
}) {
  if (!status.orderRef || !status.orderStatus) return null;
  const explorerUrl = tempoExplorerUrl(status);
  return (
    <section className="decision-trace" aria-labelledby="routine-receipt-heading">
      <p className="eyebrow">Adaptive Routine Pro receipt</p>
      <h3 id="routine-receipt-heading">
        {status.orderStatus === "fulfilled" ? "Payment confirmed" : "Payment status"}
      </h3>
      {isRecovering(status) ? (
        <div className="info-notice" role="status">
          <LoaderCircle className="spin" size={17} />
          {RECOVERY_MESSAGE}
        </div>
      ) : null}
      <dl className="confirmation-fields">
        <div>
          <dt>Product</dt>
          <dd>Adaptive Routine Pro</dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd>$4.99 test USD</dd>
        </div>
        <div>
          <dt>Payer</dt>
          <dd>{status.payerLabel ?? "Not recorded"}</dd>
        </div>
        <div>
          <dt>Provider</dt>
          <dd>{providerLabel(status)}</dd>
        </div>
        <div>
          <dt>Order reference</dt>
          <dd>{status.orderRef}</dd>
        </div>
        <div>
          <dt>Transaction / payment reference</dt>
          <dd>{status.providerPaymentRef ?? "Pending"}</dd>
        </div>
        <div>
          <dt>Paid</dt>
          <dd>{formattedTimestamp(status.paidAt)}</dd>
        </div>
        <div>
          <dt>Fulfilled</dt>
          <dd>{formattedTimestamp(status.fulfilledAt)}</dd>
        </div>
        <div>
          <dt>Entitlement granted</dt>
          <dd>{status.entitlementGranted ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt>Routine saved to Passport</dt>
          <dd>{status.routineSaved ? "Yes" : "No"}</dd>
        </div>
      </dl>
      {explorerUrl ? (
        <a href={explorerUrl} target="_blank" rel="noreferrer" className="button button--light">
          View on Tempo Explorer <ArrowRight size={15} />
        </a>
      ) : null}
      {status.routineSaved && savedRoutineRef ? (
        <a className="button button--dark" href={passportRoutineUrl(savedRoutineRef)}>
          Open saved routine in Passport <ArrowRight size={15} />
        </a>
      ) : null}
    </section>
  );
}

function SessionResult({
  session,
  equipment,
  savedRoutineRef,
  receipt,
  onReset,
}: {
  session: GeneratedSession;
  equipment: Equipment[];
  savedRoutineRef: string | null;
  receipt: RoutineStatus | null;
  onReset: () => void;
}) {
  const equipmentById = useMemo(
    () => new Map(equipment.map((item) => [item.id, item])),
    [equipment],
  );
  const agentGenerated = session.generationMode === "agent_generated";
  const provenanceLabel = agentGenerated
    ? "Agent-generated via WebMCP"
    : "Staff walkthrough chosen on the Gym site";
  return (
    <div className="session-result">
      <div className="session-result__header">
        <div>
          <p className="eyebrow">{provenanceLabel}</p>
          <h2>{session.title}</h2>
          <span>
            <Clock3 size={15} /> {session.durationMinutes} minutes · {session.exercises.length}{" "}
            equipment blocks
          </span>
        </div>
        <button type="button" className="icon-button" onClick={onReset} aria-label="Hide routine">
          <RotateCcw size={17} />
        </button>
      </div>
      <div className="session-provenance">
        <span>
          <UserCheck size={15} />
          {agentGenerated
            ? provenanceLabel
            : `Staff walkthrough ${session.templateId}@${session.templateVersion}`}
        </span>
        <span>
          <Fingerprint size={15} /> Validated by Adaptive Gym
        </span>
        <span>
          <ShieldCheck size={15} /> Catalog {session.catalogVersion}
        </span>
      </div>
      <div className="active-context">
        <Fingerprint size={16} />
        <span>
          <strong>Confirmed goal</strong>
          {session.goal}
        </span>
      </div>
      {session.requiresExpertReview ? (
        <div className="error-notice" role="alert">
          <AlertTriangle size={19} />
          <div>
            <strong>{EXPERT_REVIEW_WARNING}</strong>
            {session.expertReviewReason ? <p>{session.expertReviewReason}</p> : null}
          </div>
        </div>
      ) : null}
      {savedRoutineRef ? (
        <p className="saved-routine-state">
          <Check size={15} /> Saved to Passport ✓
          <a href={passportRoutineUrl(savedRoutineRef)}>Open in Passport</a>
        </p>
      ) : null}
      {receipt ? <RoutineReceipt status={receipt} savedRoutineRef={savedRoutineRef} /> : null}
      {session.warmup.length ? <RoutineList title="Warm-up" values={session.warmup} /> : null}
      <ol className="exercise-list">
        {session.exercises.map((exercise, index) => {
          const item = equipmentById.get(exercise.equipmentId);
          return (
            <li key={exercise.equipmentId}>
              <span className="exercise-number">{String(index + 1).padStart(2, "0")}</span>
              <div className="exercise-content">
                <div>
                  <h3>{exercise.name}</h3>
                  <span className="tag">{exercise.intensity}</span>
                </div>
                <p className="exercise-prescription">{exercise.durationMinutes} minutes</p>
                <ul>
                  {exercise.instructions.map((instruction) => (
                    <li key={instruction}>{instruction}</li>
                  ))}
                </ul>
                <div className="adaptation-reason">
                  <Check size={14} />
                  {exercise.adaptationReason}
                </div>
                {item ? (
                  <div className="station-source">
                    <Link href={`/equipment/${item.slug}`}>Gym record</Link>
                    <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                      Manufacturer source <ArrowRight size={12} />
                    </a>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {session.cooldown.length ? <RoutineList title="Cooldown" values={session.cooldown} /> : null}
      <RoutineList title="Routine provenance" values={session.decisionTrace} />
      <div className="safety-callout">
        <AlertTriangle size={19} />
        <div>
          <strong>Keep these signals visible</strong>
          <ul>
            {session.safetyNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </div>
      <Link href="/session/feedback" className="button button--dark button--block">
        {session.requiresExpertReview
          ? "Record feedback after professional approval"
          : "Start routine and record feedback"}{" "}
        <ArrowRight size={17} />
      </Link>
    </div>
  );
}

function RoutineList({ title, values }: { title: string; values: readonly string[] }) {
  return (
    <div className="decision-trace">
      <h3>{title}</h3>
      <ol>
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ol>
    </div>
  );
}
