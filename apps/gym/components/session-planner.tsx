"use client";

import type { Equipment, GeneratedSession, GymContextProjection } from "@adaptive-world/contracts";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  Dumbbell,
  Fingerprint,
  LoaderCircle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const goals = [
  "General full-body fitness",
  "Build whole-body strength",
  "Cardiovascular endurance",
  "Mobility and balance",
  "Return to confident movement",
];

export function SessionPlanner({
  profiles,
  equipment,
  initialEquipmentId,
}: {
  profiles: GymContextProjection[];
  equipment: Equipment[];
  initialEquipmentId?: string;
}) {
  const [profileId, setProfileId] = useState("");
  const [goal, setGoal] = useState(goals[0] ?? "General fitness");
  const [duration, setDuration] = useState(50);
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>(
    initialEquipmentId ? [initialEquipmentId] : [],
  );
  const [session, setSession] = useState<GeneratedSession | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setProfileId(
      window.localStorage.getItem("adaptive-gym-context") ?? profiles[0]?.projectionId ?? "",
    );
  }, [profiles]);
  const profile = profiles.find((entry) => entry.projectionId === profileId);
  const selectedNames = useMemo(
    () =>
      selectedEquipment.map((id) => equipment.find((item) => item.id === id)?.name).filter(Boolean),
    [equipment, selectedEquipment],
  );

  async function generate() {
    if (!profile) {
      setMessage("Connect a Passport context before building a session.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setMessage("");
    setSession(null);
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile,
        goal,
        durationMinutes: duration,
        equipmentIds: selectedEquipment,
      }),
    });
    const data = (await response.json()) as { session?: GeneratedSession; error?: string };
    if (!response.ok || !data.session) {
      setMessage(data.error ?? "The draft could not be generated.");
      setStatus("error");
      return;
    }
    setSession(data.session);
    setStatus("idle");
    window.sessionStorage.setItem("adaptive-gym-last-session", JSON.stringify(data.session));
  }

  return (
    <div className="planner-grid">
      <aside className="planner-controls card">
        <div className="panel-heading">
          <span className="panel-heading__icon">
            <Sparkles size={19} />
          </span>
          <div>
            <p>Grounded generator</p>
            <h2>Shape your session</h2>
          </div>
        </div>
        <label className="field">
          <span>Passport context</span>
          <select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
            {profiles.map((entry) => (
              <option key={entry.projectionId} value={entry.projectionId}>
                {entry.subjectAlias} · {entry.ageBand}
              </option>
            ))}
          </select>
        </label>
        {profile && (
          <div className="active-context">
            <Fingerprint size={16} />
            <span>
              <strong>{profile.subjectAlias}</strong>
              {profile.movementConsiderations.length} considerations ·{" "}
              {profile.accessibilityNeeds.length} access needs
            </span>
            <Link href="/passport">Review</Link>
          </div>
        )}
        <label className="field">
          <span>Session focus</span>
          <select value={goal} onChange={(event) => setGoal(event.target.value)}>
            {goals.map((entry) => (
              <option key={entry}>{entry}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>
            Time available <strong>{duration} min</strong>
          </span>
          <input
            type="range"
            min="20"
            max="75"
            step="5"
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
          />
        </label>
        <div className="field">
          <span>
            Specific equipment <small>(optional)</small>
          </span>
          <div className="selected-equipment">
            {selectedNames.length ? (
              selectedNames.map((name) => (
                <span className="tag tag--green" key={name}>
                  {name}
                </span>
              ))
            ) : (
              <p>Let the matcher choose from all available equipment.</p>
            )}
          </div>
          <Link className="inline-link" href="/equipment">
            Browse equipment <ArrowRight size={14} />
          </Link>
        </div>
        <button
          type="button"
          className="button button--lime button--block"
          disabled={status === "loading" || !profile}
          onClick={() => void generate()}
        >
          {status === "loading" ? (
            <>
              <LoaderCircle className="spin" size={18} /> Matching equipment…
            </>
          ) : (
            <>
              <Sparkles size={18} /> Generate grounded draft
            </>
          )}
        </button>
        <p className="fine-print">
          This creates a reviewable draft—not a medical prescription. Stop signals remain visible
          throughout.
        </p>
      </aside>

      <section className="session-canvas" aria-live="polite">
        {status === "error" && (
          <div className="error-notice">
            <AlertTriangle size={18} />
            {message}
          </div>
        )}
        {session ? (
          <SessionResult
            session={session}
            onReset={() => {
              setSession(null);
              setSelectedEquipment([]);
            }}
          />
        ) : (
          <div className="session-empty">
            <div className="session-empty__orbit">
              <Dumbbell size={38} />
            </div>
            <p className="eyebrow">Ready when you are</p>
            <h2>Your matched session will appear here.</h2>
            <p>
              Every exercise will reference an available item from the 68-piece catalog and explain
              why it was selected.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function SessionResult({ session, onReset }: { session: GeneratedSession; onReset: () => void }) {
  return (
    <div className="session-result">
      <div className="session-result__header">
        <div>
          <p className="eyebrow">Draft · Review before starting</p>
          <h2>{session.title}</h2>
          <span>
            <Clock3 size={15} /> {session.durationMinutes} minutes · {session.exercises.length}{" "}
            stations
          </span>
        </div>
        <button type="button" className="icon-button" onClick={onReset} aria-label="Reset session">
          <RotateCcw size={17} />
        </button>
      </div>
      <ol className="exercise-list">
        {session.exercises.map((exercise, index) => (
          <li key={exercise.equipmentId}>
            <span className="exercise-number">{String(index + 1).padStart(2, "0")}</span>
            <div className="exercise-content">
              <div>
                <h3>{exercise.name}</h3>
                <span className="tag">{exercise.intensity}</span>
              </div>
              <p className="exercise-prescription">
                {exercise.durationMinutes
                  ? `${exercise.durationMinutes} minutes`
                  : `${exercise.sets ?? 2} sets · ${exercise.reps ?? "controlled repetitions"}`}
              </p>
              <p>{exercise.instructions[0]}</p>
              <div className="adaptation-reason">
                <Check size={14} />
                {exercise.adaptationReason}
              </div>
            </div>
          </li>
        ))}
      </ol>
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
        Start session and record feedback <ArrowRight size={17} />
      </Link>
    </div>
  );
}
