"use client";

import type {
  GeneratedSession,
  SessionFeedback as FeedbackPayload,
} from "@adaptive-world/contracts";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Gauge,
  HeartPulse,
  LoaderCircle,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function SessionFeedback() {
  const [session, setSession] = useState<GeneratedSession | null>(null);
  const [effort, setEffort] = useState(6);
  const [pain, setPain] = useState(0);
  const [completed, setCompleted] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.sessionStorage.getItem("adaptive-gym-last-session");
    if (!raw) return;
    try {
      const value = JSON.parse(raw) as GeneratedSession;
      setSession(value);
      setCompleted(value.exercises.map((exercise) => exercise.equipmentId));
    } catch {
      window.sessionStorage.removeItem("adaptive-gym-last-session");
    }
  }, []);

  function toggle(id: string) {
    setCompleted((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  async function submit() {
    if (!session) return;
    setSending(true);
    const payload: FeedbackPayload = {
      sessionId: session.id,
      perceivedEffort: effort,
      painDuringSession: pain,
      completedExerciseIds: completed,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      submittedAt: new Date().toISOString(),
    };
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as { nextAdaptation?: string; error?: string };
    setSending(false);
    setResult(
      response.ok
        ? (data.nextAdaptation ?? "Feedback recorded.")
        : (data.error ?? "Feedback could not be recorded."),
    );
  }

  if (!session)
    return (
      <div className="feedback-empty card">
        <MessageSquareText size={32} />
        <h2>No recent session found</h2>
        <p>Generate a session first. Its exercise list will be available here for feedback.</p>
        <Link href="/session" className="button button--dark">
          Build a session
        </Link>
      </div>
    );

  if (result)
    return (
      <div className="feedback-success">
        <span>
          <CheckCircle2 size={34} />
        </span>
        <p className="eyebrow">Measure → Adapt</p>
        <h2>Feedback recorded.</h2>
        <p>{result}</p>
        <p className="fine-print">
          No medical records were changed. This response remains scoped to the synthetic gym
          session.
        </p>
        <div>
          <Link href="/session" className="button button--lime">
            Build the next session <Sparkles size={17} />
          </Link>
          <Link href="/" className="button button--ghost">
            Return home
          </Link>
        </div>
      </div>
    );

  return (
    <div className="feedback-layout">
      <section className="feedback-session card">
        <Link href="/session" className="back-link">
          <ArrowLeft size={15} /> Back to session
        </Link>
        <p className="eyebrow">{session.durationMinutes} minute draft</p>
        <h2>{session.title}</h2>
        <p>Mark what you completed. This gives the next adaptation a factual starting point.</p>
        <div className="completion-list">
          {session.exercises.map((exercise) => (
            <label
              key={exercise.equipmentId}
              className={
                completed.includes(exercise.equipmentId)
                  ? "completion-item is-complete"
                  : "completion-item"
              }
            >
              <input
                type="checkbox"
                checked={completed.includes(exercise.equipmentId)}
                onChange={() => toggle(exercise.equipmentId)}
              />
              <span>
                <Check size={15} />
              </span>
              <div>
                <strong>{exercise.name}</strong>
                <small>
                  {exercise.durationMinutes
                    ? `${exercise.durationMinutes} min`
                    : `${exercise.sets ?? 2} sets`}
                </small>
              </div>
            </label>
          ))}
        </div>
      </section>
      <section className="feedback-form">
        <p className="eyebrow">Post-session check-in</p>
        <h1 className="page-title">How did it feel?</h1>
        <div className="rating-card card">
          <div className="rating-heading">
            <Gauge size={20} />
            <div>
              <strong>Perceived effort</strong>
              <span>1 easy · 10 maximal</span>
            </div>
            <b>{effort}</b>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={effort}
            onChange={(event) => setEffort(Number(event.target.value))}
          />
        </div>
        <div className="rating-card card">
          <div className="rating-heading">
            <HeartPulse size={20} />
            <div>
              <strong>Pain during session</strong>
              <span>0 none · 10 severe</span>
            </div>
            <b>{pain}</b>
          </div>
          <input
            type="range"
            min="0"
            max="10"
            value={pain}
            onChange={(event) => setPain(Number(event.target.value))}
          />
        </div>
        <label className="notes-field">
          <span>Anything the next session should know?</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={600}
            placeholder="For example: the seat setup was comfortable, but the third set felt too long."
          />
          <small>{notes.length}/600</small>
        </label>
        <button
          className="button button--dark button--block"
          disabled={sending}
          onClick={() => void submit()}
          type="button"
        >
          {sending ? (
            <>
              <LoaderCircle className="spin" size={17} /> Recording…
            </>
          ) : (
            "Record feedback"
          )}
        </button>
        <p className="fine-print">
          Submitting requires a human action. WebMCP uses the same confirmation boundary.
        </p>
      </section>
    </div>
  );
}
