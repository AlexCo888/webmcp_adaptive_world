"use client";

import {
  GeneratedSessionSchema,
  GymContextProjectionSchema,
  RoutineStatusSchema,
  type Equipment,
  type GeneratedSession,
  type GymContextProjection,
  type RoutineStatus,
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
import { EXPERT_REVIEW_WARNING, facilityTemplates } from "@/lib/session-planner";

type PlannerState = "loading-context" | "idle" | "recovering" | "error";

const NON_TERMINAL_ORDER_STATES = new Set([
  "created",
  "provider_pending",
  "payment_submitted",
  "reconciliation_required",
  "paid_unfulfilled",
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

export function SessionPlanner({ equipment }: { equipment: Equipment[] }) {
  const experience = useGymExperience();
  const [context, setContext] = useState<GymContextProjection | null>(null);
  const [session, setSession] = useState<GeneratedSession | null>(null);
  const [savedRoutineRef, setSavedRoutineRef] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<RoutineStatus | null>(null);
  const [state, setState] = useState<PlannerState>("loading-context");
  const [message, setMessage] = useState("");

  const adoptStatus = useCallback((status: RoutineStatus) => {
    setReceipt(status);
    if (status.routine) setSession(status.routine);
    if (status.savedRoutineRef) setSavedRoutineRef(status.savedRoutineRef);
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

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    let attempts = 0;

    const clearReturnUrl = () => window.history.replaceState({}, "", "/session");
    const poll = async (orderRef?: string) => {
      attempts += 1;
      try {
        const current = await readStatus(orderRef, controller.signal);
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
      if (attempts < 40) timer = window.setTimeout(() => void poll(orderRef), 1_500);
    };

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

      if (returnState === "success" || isNonTerminal(initialStatus)) {
        setState("recovering");
        setMessage("Payment confirmation is being recovered. We will not submit another payment.");
        void poll(orderRef ?? initialStatus?.orderRef);
        return;
      }
      setState("idle");
    }

    void load();
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [adoptStatus, readStatus]);

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
            <p>Adaptive Routine Pro</p>
            <h2>Agent-generated through WebMCP</h2>
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
        <div className="decision-trace">
          <h3>Personalized flow</h3>
          <ol>
            <li>The user-selected agent reads the active minimum Passport projection.</li>
            <li>The agent inspects verified, currently available Gym equipment.</li>
            <li>The agent creates a new structured routine in its own reasoning context.</li>
            <li>
              Adaptive Gym shows the exact proposal, validates it, processes the sandbox payment,
              and saves it.
            </li>
          </ol>
        </div>
        <p className="fine-print">
          Generated by the user-selected agent from the approved Passport projection and verified
          Gym inventory. Validated and saved by Adaptive Gym. The Gym and Passport applications do
          not call an AI model or select a predefined personalized routine.
        </p>
        <div className="info-notice" role="status">
          <ShieldCheck size={17} />
          Use <code>get_active_context</code>, <code>search_equipment</code>,{" "}
          <code>get_equipment</code>, then <code>create_personalized_routine</code>.
        </div>
        <section aria-labelledby="staff-walkthroughs-heading">
          <p className="eyebrow">Separate public option</p>
          <h3 id="staff-walkthroughs-heading">Staff walkthroughs</h3>
          <p className="fine-print">
            These public examples remain visible, but Routine Pro never uses them to create a
            personalized result.
          </p>
          <div className="template-list">
            {facilityTemplates.map((template) => (
              <article className="template-option" key={template.id}>
                <span>
                  <strong>{template.name}</strong>
                  <small>
                    {template.durationMinutes} min · v{template.version}
                  </small>
                </span>
                <p>{template.summary}</p>
                <em>{template.bestFor}</em>
              </article>
            ))}
          </div>
        </section>
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
            <h2>Your agent-generated proposal will appear here.</h2>
            <p>
              The selected agent must inspect the approved context and real equipment, show the
              complete routine, and obtain confirmation for that exact routine before the paid
              write.
            </p>
            {receipt ? <RoutineReceipt status={receipt} savedRoutineRef={savedRoutineRef} /> : null}
          </div>
        )}
      </section>
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
      {isNonTerminal(status) ? (
        <div className="info-notice" role="status">
          <LoaderCircle className="spin" size={17} />
          Payment confirmation is being recovered. We will not submit another payment.
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
        <a
          className="button button--dark"
          href={`${process.env.NEXT_PUBLIC_PASSPORT_URL ?? "http://127.0.0.1:3000"}/routines/${savedRoutineRef}`}
        >
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
  return (
    <div className="session-result">
      <div className="session-result__header">
        <div>
          <p className="eyebrow">
            {agentGenerated ? "Agent-generated via WebMCP" : "Public staff walkthrough"}
          </p>
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
            ? "Agent-generated via WebMCP"
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
          <a
            href={`${process.env.NEXT_PUBLIC_PASSPORT_URL ?? "http://127.0.0.1:3000"}/routines/${savedRoutineRef}`}
          >
            Open in Passport
          </a>
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
