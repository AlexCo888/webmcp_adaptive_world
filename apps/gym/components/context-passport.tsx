"use client";

import type { GymContextProjection } from "@adaptive-world/contracts";
import {
  ArrowRight,
  Check,
  Clock3,
  Fingerprint,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type State = "loading" | "disconnected" | "redeeming" | "active" | "error";

export function ContextPassport({ passportUrl }: { passportUrl: string }) {
  const [state, setState] = useState<State>("loading");
  const [projection, setProjection] = useState<GymContextProjection | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");

  const loadCurrent = useCallback(async () => {
    const response = await fetch("/api/context/current", { cache: "no-store" });
    if (!response.ok) {
      setState("disconnected");
      return;
    }
    const data = (await response.json()) as { projection?: GymContextProjection };
    if (data.projection) {
      setProjection(data.projection);
      setState("active");
    } else {
      setState("disconnected");
    }
  }, []);

  const redeem = useCallback(async (code: string) => {
    setState("redeeming");
    setMessage(null);
    const response = await fetch("/api/context/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = (await response.json()) as { projection?: GymContextProjection; error?: string };
    if (!response.ok || !data.projection) {
      setMessage(data.error ?? "The one-use code could not be redeemed.");
      setState("error");
      return;
    }
    setProjection(data.projection);
    setState("active");
  }, []);

  useEffect(() => {
    const code = new URLSearchParams(window.location.hash.slice(1)).get("code");
    if (code) {
      window.history.replaceState(null, "", window.location.pathname);
      void redeem(code);
      return;
    }
    void loadCurrent();
  }, [loadCurrent, redeem]);

  if (state === "loading" || state === "redeeming") {
    return (
      <section className="context-state card" aria-live="polite">
        <LoaderCircle className="spin" size={34} />
        <h2>{state === "redeeming" ? "Opening your private Gym session…" : "Checking context…"}</h2>
        <p>
          {state === "redeeming"
            ? "The server is consuming the code once and creating an anonymous, persisted Gym session."
            : "The Gym is checking its HttpOnly session cookie; it is not reading a Passport from browser storage."}
        </p>
      </section>
    );
  }

  if (!projection) {
    return (
      <div className="context-connect-grid">
        <section className="context-state card">
          <span className="context-state__icon">
            <Fingerprint size={28} />
          </span>
          <p className="eyebrow">No context connected</p>
          <h2>Start from your own Passport.</h2>
          <p>
            Sign in as the Passport owner, review the exact Gym projection, then approve a
            five-minute, one-use exchange. There is no profile picker inside the Gym.
          </p>
          <Link className="button button--lime" href={`${passportUrl}/sharing`}>
            Open Digital Passport <ArrowRight size={17} />
          </Link>
        </section>
        <aside className="card handoff-proof">
          <div>
            <KeyRound size={20} />
            <strong>Already have a one-use code?</strong>
          </div>
          <p>Paste it only as a fallback when the automatic handoff was interrupted.</p>
          <div className="grant-input">
            <input
              autoComplete="off"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              placeholder="One-use context code"
            />
            <button
              type="button"
              disabled={manualCode.trim().length < 32}
              onClick={() => void redeem(manualCode.trim())}
            >
              Redeem
            </button>
          </div>
          {message ? (
            <p className="grant-message" role="alert">
              {message}
            </p>
          ) : null}
          <ul className="handoff-list">
            <li>
              <Check size={15} /> Code stored only as SHA-256 in Neon
            </li>
            <li>
              <Check size={15} /> Atomic replay protection
            </li>
            <li>
              <Check size={15} /> No identity, labs, medications, or documents
            </li>
          </ul>
        </aside>
      </div>
    );
  }

  return (
    <section className="projection-card projection-card--connected" aria-live="polite">
      <div className="projection-card__top">
        <div>
          <p className="eyebrow">Connected Gym context</p>
          <h2>{projection.subjectAlias}</h2>
          <p>This is the complete dataset Adaptive Gym can see for this session.</p>
        </div>
        <span className="verified-context">
          <ShieldCheck size={18} /> One-use grant redeemed
        </span>
      </div>
      <div className="projection-summary">
        <div>
          <span>Age range</span>
          <strong>{projection.ageBand}</strong>
        </div>
        <div>
          <span>Experience</span>
          <strong>{projection.experienceLevel}</strong>
        </div>
        <div>
          <span>Preferred session</span>
          <strong>{projection.preferredSessionMinutes} min</strong>
        </div>
      </div>
      <div className="connected-context-grid">
        <ContextSection title="Goals" values={projection.goals} />
        <ContextSection
          title="Movement considerations"
          values={projection.movementConsiderations}
          emphasis
        />
        {projection.accessibilityNeeds.length ? (
          <ContextSection title="Access needs" values={projection.accessibilityNeeds} />
        ) : null}
        <ContextSection title="Stop signals" values={projection.stopSignals} danger />
      </div>
      <div className="privacy-boundary">
        <LockKeyhole size={18} />
        <p>
          <strong>Not shared:</strong> name, birth date, contact details, diagnoses, medications,
          laboratories, documents, Passport ID, and clinician identity.
        </p>
      </div>
      <div className="projection-actions">
        <span className="projection-expiry">
          <Clock3 size={14} /> Context expires {new Date(projection.expiresAt).toLocaleString()}
        </span>
        <div>
          <button
            className="button button--light"
            type="button"
            onClick={async () => {
              await fetch("/api/context/current", { method: "DELETE" });
              setProjection(null);
              setState("disconnected");
            }}
          >
            Disconnect
          </button>
          <Link className="button button--lime" href="/session">
            Choose a walkthrough <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function ContextSection({
  title,
  values,
  emphasis,
  danger,
}: {
  title: string;
  values: string[];
  emphasis?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="context-section">
      <h3>{title}</h3>
      <div className="tag-cloud">
        {values.map((value) => (
          <span
            className={danger ? "tag tag--orange" : emphasis ? "tag tag--green" : "tag"}
            key={value}
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
