"use client";

import {
  GeneratedSessionSchema,
  GymContextProjectionSchema,
  RoutineProOfferSchema,
  type Equipment,
  type GeneratedSession,
  type GymContextProjection,
  type RoutineProOffer,
} from "@adaptive-world/contracts";
import {
  AlertTriangle,
  ArrowRight,
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
  isPendingPaymentError,
  pendingOrderStatusLabel,
  pendingPaymentMode,
  pendingRoutineProOrder,
  type PendingRoutineProOrder,
} from "@/lib/routine-pro-client-state";
import {
  defaultRoutineGoal,
  facilityTemplates,
  recommendFacilityTemplate,
  type FacilityTemplate,
} from "@/lib/session-planner";

type PaymentPhase = "idle" | "creating" | "opening-checkout" | "paying-agent";
type RoutineProStatusCheck = Readonly<{
  entitled: boolean;
  pending: PendingRoutineProOrder | null;
}>;

function getEnvelopeData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || (value as Record<string, unknown>).ok !== true) {
    throw new GymApiError("INVALID_RESPONSE", 502);
  }
  const data = (value as Record<string, unknown>).data;
  if (!data || typeof data !== "object") throw new GymApiError("INVALID_RESPONSE", 502);
  return data as Record<string, unknown>;
}

export function SessionPlanner({ equipment }: { equipment: Equipment[] }) {
  const experience = useGymExperience();
  const [context, setContext] = useState<GymContextProjection | null>(null);
  const [templateId, setTemplateId] = useState<FacilityTemplate["id"]>("first_visit_foundations");
  const [templateManuallySelected, setTemplateManuallySelected] = useState(false);
  const [goal, setGoal] = useState("");
  const [session, setSession] = useState<GeneratedSession | null>(null);
  const [offer, setOffer] = useState<RoutineProOffer | null>(null);
  const [paymentMode, setPaymentMode] = useState<"human_checkout" | "agent_wallet">(
    "human_checkout",
  );
  const [savedRoutineRef, setSavedRoutineRef] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<PendingRoutineProOrder | null>(null);
  const [resumingPayment, setResumingPayment] = useState(false);
  const [paymentPhase, setPaymentPhase] = useState<PaymentPhase>("idle");
  const [status, setStatus] = useState<
    "loading-context" | "idle" | "preparing" | "matching" | "error"
  >("loading-context");
  const [message, setMessage] = useState("");

  const refreshPendingOrder = useCallback(
    async (orderRef?: string, signal?: AbortSignal): Promise<RoutineProStatusCheck> => {
      const suffix = orderRef ? `?order=${encodeURIComponent(orderRef)}` : "";
      const response = await fetchBoundedJson<unknown>(
        `/api/commerce/routine-pro/status${suffix}`,
        {},
        { signal },
      );
      const data = getEnvelopeData(response);
      const pending = pendingRoutineProOrder(data);
      setPendingOrder(pending);
      if (pending) {
        setTemplateId(pending.initialTemplateId);
        setTemplateManuallySelected(true);
        if (pending.initialGoal) setGoal(pending.initialGoal);
      }
      return { entitled: data.entitled === true, pending };
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const [contextResult, sessionResult] = await Promise.allSettled([
        fetchBoundedJson<unknown>("/api/context/current", {}, { signal: controller.signal }),
        fetchBoundedJson<unknown>("/api/session", {}, { signal: controller.signal }),
      ]);
      if (contextResult.status === "fulfilled") {
        const data = contextResult.value as { projection?: GymContextProjection };
        const parsedContext = GymContextProjectionSchema.safeParse(data.projection);
        const projection = parsedContext.success ? parsedContext.data : null;
        setContext(projection);
        if (projection) setGoal((current) => current || defaultRoutineGoal(projection));
        if (projection && !new URLSearchParams(window.location.search).has("routinePro")) {
          await refreshPendingOrder(undefined, controller.signal).catch(() => undefined);
        }
      }
      if (sessionResult.status === "fulfilled") {
        const data = sessionResult.value as { session?: GeneratedSession | null };
        if (data.session) {
          const parsed = GeneratedSessionSchema.safeParse(data.session);
          if (parsed.success) {
            setSession(parsed.data);
            setTemplateId(parsed.data.templateId as FacilityTemplate["id"]);
            setTemplateManuallySelected(true);
            setGoal(parsed.data.goal);
          }
        }
      }
      setStatus("idle");
    }
    void load();
    return () => controller.abort();
  }, [refreshPendingOrder]);

  useEffect(() => {
    if (!experience.personalizedRoutine || !experience.savedRoutineRef) return;
    setSession(experience.personalizedRoutine);
    setTemplateId(experience.personalizedRoutine.templateId as FacilityTemplate["id"]);
    setTemplateManuallySelected(true);
    setGoal(experience.personalizedRoutine.goal);
    setSavedRoutineRef(experience.savedRoutineRef);
    window.setTimeout(
      () => document.querySelector(".session-canvas")?.scrollIntoView({ behavior: "smooth" }),
      0,
    );
  }, [experience.personalizedRoutine, experience.savedRoutineRef]);

  useEffect(() => {
    if (!context || templateManuallySelected || pendingOrder || goal.trim().length < 2) return;
    setTemplateId(recommendFacilityTemplate(context, goal));
  }, [context, goal, pendingOrder, templateManuallySelected]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderRef = params.get("order");
    const returnState = params.get("routinePro");
    if (!orderRef || (returnState !== "success" && returnState !== "cancelled")) return;
    const controller = new AbortController();

    if (returnState === "cancelled") {
      setStatus("preparing");
      void fetchBoundedJson<unknown>(
        "/api/commerce/routine-pro/cancel",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderRef }),
        },
        { signal: controller.signal },
      )
        .then(() => refreshPendingOrder(orderRef, controller.signal))
        .then(({ entitled, pending }) => {
          if (controller.signal.aborted) return;
          setMessage(
            pending
              ? "Secure test checkout closed, but its final state still needs reconciliation."
              : entitled
                ? "Payment is verified. Build the routine to save it with your existing entitlement."
                : "Secure test checkout was closed and the unpaid order was released.",
          );
          setStatus("idle");
          window.history.replaceState({}, "", "/session");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setMessage(error instanceof Error ? error.message : "Payment status is unavailable.");
          setStatus("error");
        });
      return () => controller.abort();
    }

    let timer: number | undefined;
    let attempts = 0;
    setStatus("matching");
    setMessage("Verifying the sandbox payment and saving your routine…");

    const poll = async () => {
      attempts += 1;
      try {
        const statusResponse = await fetchBoundedJson<unknown>(
          `/api/commerce/routine-pro/status?order=${encodeURIComponent(orderRef)}`,
          {},
          { signal: controller.signal },
        );
        const state = getEnvelopeData(statusResponse);
        if (state.entitled === true && typeof state.initialTemplateId === "string") {
          const offerResponse = await fetchBoundedJson<unknown>(
            "/api/commerce/routine-pro/offer",
            {},
            { signal: controller.signal },
          );
          const freshOffer = RoutineProOfferSchema.parse(getEnvelopeData(offerResponse));
          const routineResponse = await fetchBoundedJson<unknown>(
            "/api/routines/personalized",
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                templateId: state.initialTemplateId,
                goal:
                  typeof state.initialGoal === "string"
                    ? state.initialGoal
                    : "Support the approved Passport goals with a sustainable routine",
                initiatedVia: "site-ui",
                quoteValidUntil: freshOffer.quoteValidUntil,
                quoteDigest: freshOffer.quoteDigest,
              }),
            },
            { signal: controller.signal },
          );
          const created = getEnvelopeData(routineResponse);
          const parsed = GeneratedSessionSchema.parse(created.session);
          if (typeof created.savedRoutineRef !== "string") {
            throw new GymApiError("INVALID_RESPONSE", 502);
          }
          setSession(parsed);
          setTemplateId(parsed.templateId as FacilityTemplate["id"]);
          setGoal(parsed.goal);
          setSavedRoutineRef(created.savedRoutineRef);
          setPendingOrder(null);
          setMessage("");
          setStatus("idle");
          window.history.replaceState({}, "", "/session");
          return;
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        if (attempts >= 40) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Payment is still being reconciled. You can safely return later.",
          );
          setStatus("error");
          return;
        }
      }
      if (attempts < 40) timer = window.setTimeout(() => void poll(), 1_500);
    };
    void poll();
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [refreshPendingOrder]);

  async function prepareRoutine() {
    if (!context) {
      setMessage("Connect a Passport context before building a personalized routine.");
      setStatus("error");
      return;
    }
    if (goal.trim().length < 2) {
      setMessage("Describe what you want this routine to support in your own words.");
      setStatus("error");
      return;
    }
    setStatus("preparing");
    setMessage("");
    try {
      const { pending } = await refreshPendingOrder();
      if (pending) {
        setTemplateId(pending.initialTemplateId);
        if (pending.initialGoal) setGoal(pending.initialGoal);
        setMessage("Payment already in progress. Resume the existing payer state below.");
        setStatus("idle");
        return;
      }
      const response = await fetchBoundedJson<unknown>("/api/commerce/routine-pro/offer");
      const prepared = RoutineProOfferSchema.parse(getEnvelopeData(response));
      if (!prepared.entitled && prepared.supportedModes.length === 0) {
        throw new GymApiError("PROVIDER_UNAVAILABLE", 503, "Sandbox payment is unavailable.");
      }
      setOffer(prepared);
      setPaymentMode(
        prepared.supportedModes.includes("human_checkout") ? "human_checkout" : "agent_wallet",
      );
      setResumingPayment(false);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Pro offer is unavailable.");
      setStatus("error");
    }
  }

  async function resumePendingPayment() {
    if (!pendingOrder?.canResume) return;
    setStatus("preparing");
    setMessage("");
    try {
      const { entitled, pending: current } = await refreshPendingOrder(pendingOrder.orderRef);
      const response = await fetchBoundedJson<unknown>("/api/commerce/routine-pro/offer");
      const prepared = RoutineProOfferSchema.parse(getEnvelopeData(response));
      if (entitled) {
        if (!prepared.entitled) throw new GymApiError("INVALID_RESPONSE", 502);
        setOffer(prepared);
        setResumingPayment(false);
        setStatus("idle");
        return;
      }
      if (!current) {
        setMessage("The previous payment is no longer pending. Review the current offer again.");
        setStatus("idle");
        return;
      }
      if (!current.canResume) {
        setMessage("This payment needs reconciliation before it can continue.");
        setStatus("error");
        return;
      }
      const mode = pendingPaymentMode(current);
      if (!prepared.supportedModes.includes(mode)) {
        throw new GymApiError("PROVIDER_UNAVAILABLE", 503);
      }
      setTemplateId(current.initialTemplateId);
      if (current.initialGoal) setGoal(current.initialGoal);
      setPaymentMode(mode);
      setOffer(prepared);
      setResumingPayment(true);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The payment could not be resumed.");
      setStatus("error");
    }
  }

  async function confirmRoutine() {
    if (!offer || status === "matching") return;
    setStatus("matching");
    setPaymentPhase(
      offer.entitled
        ? "creating"
        : paymentMode === "agent_wallet"
          ? "paying-agent"
          : "opening-checkout",
    );
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
          templateId,
          goal: goal.trim(),
          ...(!offer.entitled ? { paymentMode } : {}),
          initiatedVia: "site-ui",
          quoteValidUntil: offer.quoteValidUntil,
          quoteDigest: offer.quoteDigest,
        }),
      });
      const data = getEnvelopeData(response);
      if (typeof data.checkoutUrl === "string") {
        const checkout = new URL(data.checkoutUrl);
        if (checkout.protocol !== "https:" || checkout.hostname !== "checkout.stripe.com") {
          throw new GymApiError("INVALID_RESPONSE", 502);
        }
        window.location.assign(checkout);
        return;
      }
      const created = GeneratedSessionSchema.parse(data.session);
      if (typeof data.savedRoutineRef !== "string") throw new GymApiError("INVALID_RESPONSE", 502);
      setSession(created);
      setSavedRoutineRef(data.savedRoutineRef);
      setPendingOrder(null);
      setOffer(null);
      setResumingPayment(false);
      setPaymentPhase("idle");
      setStatus("idle");
      window.setTimeout(
        () => document.querySelector(".session-canvas")?.scrollIntoView({ behavior: "smooth" }),
        0,
      );
    } catch (error) {
      setOffer(null);
      setResumingPayment(false);
      setPaymentPhase("idle");
      if (isPendingPaymentError(error)) {
        const pending = await refreshPendingOrder()
          .then((state) => state.pending)
          .catch(() => null);
        setMessage(
          pending
            ? "Payment already in progress. Resume the existing payer state below."
            : error instanceof Error
              ? error.message
              : "The payment is still being prepared.",
        );
        setStatus("idle");
      } else {
        setMessage(error instanceof Error ? error.message : "The routine could not be created.");
        setStatus("error");
      }
    }
  }

  if (status === "loading-context") {
    return (
      <section className="context-state card">
        <LoaderCircle className="spin" size={32} />
        <h2>Loading your Gym session…</h2>
        <p>The profile is resolved server-side from the signed, HttpOnly session cookie.</p>
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
            <p>Published by Gym staff</p>
            <h2>Choose a walkthrough</h2>
          </div>
        </div>
        {context ? (
          <div className="active-context">
            <Fingerprint size={16} />
            <span>
              <strong>{context.subjectAlias}</strong>
              {context.movementConsiderations.length} movement signals ·{" "}
              {context.accessibilityNeeds.length} access needs
            </span>
            <Link href="/passport">Review</Link>
          </div>
        ) : (
          <div className="context-required">
            <Fingerprint size={19} />
            <div>
              <strong>Passport context required</strong>
              <p>The Gym cannot choose a synthetic person for you.</p>
            </div>
            <Link href="/passport" className="button button--dark button--small">
              Connect
            </Link>
          </div>
        )}
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
            disabled={status === "matching" || status === "preparing" || pendingOrder !== null}
            placeholder="For example: support lifelong health without bodybuilding-style muscle gain"
            onChange={(event) => {
              setGoal(event.target.value);
              setTemplateManuallySelected(false);
            }}
          />
          <small>Use your own words. The Gym matches them to a published staff template.</small>
        </label>
        <div className="template-list" role="radiogroup" aria-label="Facility walkthrough">
          {facilityTemplates.map((template) => (
            <button
              type="button"
              role="radio"
              aria-checked={templateId === template.id}
              className={`template-option ${templateId === template.id ? "is-selected" : ""}`}
              key={template.id}
              disabled={status === "matching" || status === "preparing" || pendingOrder !== null}
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
        {message && status !== "error" ? (
          <div className="info-notice" role="status">
            {status === "matching" || status === "preparing" ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <ShieldCheck size={17} />
            )}
            {message}
          </div>
        ) : null}
        {pendingOrder ? (
          <section className="pending-payment-state" aria-labelledby="pending-payment-heading">
            <p className="eyebrow">Adaptive Routine Pro</p>
            <h3 id="pending-payment-heading">Payment already in progress</h3>
            <p>
              Continue the existing order. Its payer and selected staff template are locked so a
              second charge cannot be started.
            </p>
            <dl>
              <div>
                <dt>Payer</dt>
                <dd>{pendingOrder.payerLabel}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{pendingOrderStatusLabel(pendingOrder)}</dd>
              </div>
              <div>
                <dt>Goal</dt>
                <dd>{pendingOrder.initialGoal ?? goal}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="button button--lime button--block"
              disabled={!pendingOrder.canResume || status === "matching" || status === "preparing"}
              aria-busy={status === "preparing"}
              onClick={() => void resumePendingPayment()}
            >
              {status === "preparing" ? (
                <>
                  <LoaderCircle className="spin" size={18} /> Checking existing payment…
                </>
              ) : pendingOrder.canResume ? (
                <>
                  <ShieldCheck size={18} /> Resume {pendingOrder.payerLabel.toLowerCase()}
                </>
              ) : (
                "Resume disabled while payment is reconciled"
              )}
            </button>
          </section>
        ) : (
          <button
            type="button"
            className="button button--lime button--block"
            disabled={
              status === "matching" || status === "preparing" || !context || goal.trim().length < 2
            }
            aria-busy={status === "preparing"}
            onClick={() => void prepareRoutine()}
          >
            {status === "preparing" ? (
              <>
                <LoaderCircle className="spin" size={18} /> Checking Routine Pro status…
              </>
            ) : status === "matching" ? (
              <>
                <LoaderCircle className="spin" size={18} /> Saving routine…
              </>
            ) : (
              <>
                <ShieldCheck size={18} /> Build my personalized routine <small>Pro</small>
              </>
            )}
          </button>
        )}
        <p className="fine-print">
          Passport connection and context inspection stay free. Routine Pro pays only for creating
          and saving the personalized result. The Gym matches a versioned, staff-authored
          walkthrough to the active minimum context and verified inventory; it does not ask an AI to
          invent a routine.
        </p>
      </aside>

      <section className="session-canvas" aria-live="polite">
        {status === "error" ? (
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
            onReset={() => {
              setSession(null);
              setSavedRoutineRef(null);
            }}
          />
        ) : (
          <div className="session-empty">
            <div className="session-empty__orbit">
              <Dumbbell size={38} />
            </div>
            <p className="eyebrow">No fabricated routine</p>
            <h2>A verified facility walkthrough will appear here.</h2>
            <p>
              You will see the template version, real product models, manufacturer sources, and the
              exact decision trace—including whether Site UI or WebMCP requested it.
            </p>
          </div>
        )}
      </section>
      {offer ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (status !== "matching") {
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
              {resumingPayment
                ? "Resume your existing sandbox payment?"
                : offer.entitled
                  ? "Create and save your personalized routine"
                  : "Approve Routine Pro sandbox payment?"}
            </h2>
            <p>
              Passport connection, context review, Gym profile, and equipment discovery are free.
              This confirmation is only for Routine Pro routine creation and Passport saving; it
              does not expand Passport access.
            </p>
            <dl className="confirmation-fields">
              <div>
                <dt>Free tier</dt>
                <dd>Passport connection, context review, Gym profile, and equipment discovery</dd>
              </div>
              <div>
                <dt>Paid tier</dt>
                <dd>Routine creation and Passport saving</dd>
              </div>
              <div>
                <dt>Product</dt>
                <dd>{offer.displayName}</dd>
              </div>
              <div>
                <dt>Your goal</dt>
                <dd>{goal.trim()}</dd>
              </div>
              <div>
                <dt>Staff template</dt>
                <dd>{templateId}</dd>
              </div>
              <div>
                <dt>Includes</dt>
                <dd>Personalized routine creation and Passport saving</dd>
              </div>
              <div>
                <dt>Amount</dt>
                <dd>{offer.entitled ? "Already unlocked" : "$4.99 test USD"}</dd>
              </div>
              <div>
                <dt>Mode</dt>
                <dd>Sandbox — no real funds</dd>
              </div>
              <div>
                <dt>Payer</dt>
                <dd>
                  {offer.entitled
                    ? "Existing Passport entitlement — no new payer"
                    : paymentMode === "agent_wallet"
                      ? "Adaptive World demo agent"
                      : "Human test checkout"}
                </dd>
              </div>
              <div>
                <dt>Data access</dt>
                <dd>Unchanged; no additional health fields</dd>
              </div>
            </dl>
            {!offer.entitled && offer.supportedModes.length > 1 && !resumingPayment ? (
              <fieldset className="payment-choice" disabled={status === "matching"}>
                <legend>Choose sandbox payer</legend>
                <label>
                  <input
                    type="radio"
                    name="payment-mode"
                    checked={paymentMode === "human_checkout"}
                    onChange={() => setPaymentMode("human_checkout")}
                  />
                  Secure test checkout
                </label>
                <label>
                  <input
                    type="radio"
                    name="payment-mode"
                    checked={paymentMode === "agent_wallet"}
                    onChange={() => setPaymentMode("agent_wallet")}
                  />
                  Adaptive World demo agent
                </label>
              </fieldset>
            ) : null}
            {status === "matching" ? (
              <p className="payment-phase-note" role="status" aria-live="polite">
                <LoaderCircle className="spin" size={17} />
                {paymentPhase === "creating"
                  ? "Saving your staff-authored routine to Passport…"
                  : paymentPhase === "paying-agent"
                    ? "Paying with the Adaptive World demo agent…"
                    : "Opening secure Stripe test checkout…"}
              </p>
            ) : null}
            <div>
              <button
                className="button button--light"
                disabled={status === "matching"}
                onClick={() => {
                  setOffer(null);
                  setResumingPayment(false);
                }}
              >
                Cancel
              </button>
              <button
                className="button button--lime"
                disabled={status === "matching"}
                aria-busy={status === "matching"}
                onClick={() => void confirmRoutine()}
              >
                {status === "matching" ? (
                  <>
                    <LoaderCircle className="spin" size={17} />
                    {paymentPhase === "creating"
                      ? "Saving routine…"
                      : paymentPhase === "paying-agent"
                        ? "Paying with demo agent…"
                        : "Opening test checkout…"}
                  </>
                ) : offer.entitled ? (
                  "Create and save"
                ) : paymentMode === "agent_wallet" ? (
                  resumingPayment ? (
                    "Resume agent payment"
                  ) : (
                    "Approve agent payment"
                  )
                ) : resumingPayment ? (
                  "Resume secure test checkout"
                ) : (
                  "Continue to secure test checkout"
                )}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function SessionResult({
  session,
  equipment,
  savedRoutineRef,
  onReset,
}: {
  session: GeneratedSession;
  equipment: Equipment[];
  savedRoutineRef: string | null;
  onReset: () => void;
}) {
  const equipmentById = useMemo(
    () => new Map(equipment.map((item) => [item.id, item])),
    [equipment],
  );
  return (
    <div className="session-result">
      <div className="session-result__header">
        <div>
          <p className="eyebrow">Staff template · Review before starting</p>
          <h2>{session.title}</h2>
          <span>
            <Clock3 size={15} /> {session.durationMinutes} minutes · {session.exercises.length}{" "}
            stations
          </span>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onReset}
          aria-label="Choose another walkthrough"
        >
          <RotateCcw size={17} />
        </button>
      </div>
      <div className="session-provenance">
        <span>
          <UserCheck size={15} /> Template {session.templateId}@{session.templateVersion}
        </span>
        <span>
          <Fingerprint size={15} /> Requested via{" "}
          {session.createdVia === "webmcp" ? "WebMCP" : "site UI"}
        </span>
        <span>
          <ShieldCheck size={15} /> Catalog {session.catalogVersion}
        </span>
      </div>
      <div className="active-context">
        <Fingerprint size={16} />
        <span>
          <strong>Your stated goal</strong>
          {session.goal}
        </span>
      </div>
      {savedRoutineRef ? (
        <p className="saved-routine-state">
          <Check size={15} /> Saved to Passport ✓
          <a
            href={`${process.env.NEXT_PUBLIC_PASSPORT_URL ?? "http://127.0.0.1:3000"}/routines/${savedRoutineRef}`}
          >
            Open in Passport
          </a>
        </p>
      ) : null}
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
                <p className="exercise-prescription">
                  {exercise.durationMinutes} minutes of setup and orientation
                </p>
                <p>{exercise.instructions[0]}</p>
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
      <div className="decision-trace">
        <h3>Why this result exists</h3>
        <ol>
          {session.decisionTrace.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ol>
      </div>
      <div className="safety-callout">
        <AlertTriangle size={19} />
        <div>
          <strong>Keep these signals visible</strong>
          <ul>
            {session.safetyNotes.slice(0, 5).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </div>
      <Link href="/session/feedback" className="button button--dark button--block">
        Start walkthrough and record feedback <ArrowRight size={17} />
      </Link>
    </div>
  );
}
