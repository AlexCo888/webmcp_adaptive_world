"use client";

import type { Equipment, GeneratedSession, GymContextProjection } from "@adaptive-world/contracts";
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
import { useEffect, useMemo, useState } from "react";
import { facilityTemplates, type FacilityTemplate } from "@/lib/session-planner";

export function SessionPlanner({ equipment }: { equipment: Equipment[] }) {
  const [context, setContext] = useState<GymContextProjection | null>(null);
  const [templateId, setTemplateId] = useState<FacilityTemplate["id"]>("first_visit_foundations");
  const [session, setSession] = useState<GeneratedSession | null>(null);
  const [status, setStatus] = useState<"loading-context" | "idle" | "matching" | "error">(
    "loading-context",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const [contextResponse, sessionResponse] = await Promise.all([
        fetch("/api/context/current", { cache: "no-store" }),
        fetch("/api/session", { cache: "no-store" }),
      ]);
      if (contextResponse.ok) {
        const data = (await contextResponse.json()) as { projection?: GymContextProjection };
        setContext(data.projection ?? null);
      }
      if (sessionResponse.ok) {
        const data = (await sessionResponse.json()) as { session?: GeneratedSession | null };
        if (data.session) {
          setSession(data.session);
          setTemplateId(data.session.templateId as FacilityTemplate["id"]);
        }
      }
      setStatus("idle");
    }
    void load();
  }, []);

  async function matchTemplate() {
    if (!context) {
      setMessage("Connect a Passport context before choosing a walkthrough.");
      setStatus("error");
      return;
    }
    setStatus("matching");
    setMessage("");
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateId, createdVia: "site-ui" }),
    });
    const data = (await response.json()) as { session?: GeneratedSession; error?: string };
    if (!response.ok || !data.session) {
      setMessage(data.error ?? "The walkthrough could not be matched.");
      setStatus("error");
      return;
    }
    setSession(data.session);
    setStatus("idle");
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
        <div className="template-list" role="radiogroup" aria-label="Facility walkthrough">
          {facilityTemplates.map((template) => (
            <button
              type="button"
              role="radio"
              aria-checked={templateId === template.id}
              className={`template-option ${templateId === template.id ? "is-selected" : ""}`}
              key={template.id}
              onClick={() => setTemplateId(template.id)}
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
        <button
          type="button"
          className="button button--lime button--block"
          disabled={status === "matching" || !context}
          onClick={() => void matchTemplate()}
        >
          {status === "matching" ? (
            <>
              <LoaderCircle className="spin" size={18} /> Verifying catalog…
            </>
          ) : (
            <>
              <ShieldCheck size={18} /> Match this staff template
            </>
          )}
        </button>
        <p className="fine-print">
          This does not ask an AI to invent a routine. It matches a versioned, staff-authored
          walkthrough to the active minimum context and verified inventory.
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
          <SessionResult session={session} equipment={equipment} onReset={() => setSession(null)} />
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
    </div>
  );
}

function SessionResult({
  session,
  equipment,
  onReset,
}: {
  session: GeneratedSession;
  equipment: Equipment[];
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
