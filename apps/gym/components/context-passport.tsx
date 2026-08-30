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
import { useGymExperience } from "@/components/gym-experience-context";

type State = "loading" | "disconnected" | "redeeming" | "active" | "error";

export function ContextPassport({ passportUrl }: { passportUrl: string }) {
  const { setContextActive } = useGymExperience();
  const [state, setState] = useState<State>("loading");
  const [projection, setProjection] = useState<GymContextProjection | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");

  const loadCurrent = useCallback(async () => {
    try {
      const response = await fetch("/api/context/current", { cache: "no-store" });
      if (!response.ok) {
        setContextActive(false);
        setState("disconnected");
        return;
      }
      const data = (await response.json()) as {
        projection?: GymContextProjection;
        scopes?: string[];
      };
      if (data.projection) {
        setContextActive(true);
        setProjection(data.projection);
        setScopes(data.scopes ?? []);
        setState("active");
      } else {
        setContextActive(false);
        setState("disconnected");
      }
    } catch {
      setContextActive(false);
      setMessage("The Gym could not check the current session. Please try again.");
      setState("error");
    }
  }, [setContextActive]);

  const redeem = useCallback(
    async (code: string) => {
      setState("redeeming");
      setMessage(null);
      try {
        const response = await fetch("/api/context/redeem", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const data = (await response.json().catch(() => null)) as {
          projection?: GymContextProjection;
          scopes?: string[];
          error?: string;
        } | null;
        if (!response.ok || !data?.projection) {
          setContextActive(false);
          setMessage(data?.error ?? "The one-use code could not be redeemed.");
          setState("error");
          return;
        }
        setContextActive(true);
        setProjection(data.projection);
        setScopes(data.scopes ?? []);
        setState("active");
      } catch {
        setContextActive(false);
        setMessage("The Gym could not reach the session service. Please try again.");
        setState("error");
      }
    },
    [setContextActive],
  );

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
          <p className="eyebrow">
            {state === "error" ? "Handoff interrupted" : "No context connected"}
          </p>
          <h2>
            {state === "error" ? "Your Gym session did not open." : "Start from your own Passport."}
          </h2>
          <p>
            {state === "error"
              ? (message ?? "The one-use handoff could not be completed.")
              : "Sign in as the Passport owner, review the exact Gym projection, then approve a five-minute, one-use exchange. There is no profile picker inside the Gym."}
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
        <ContextSection title="Preferred activities" values={projection.preferredActivities} />
        <ContextSection
          title="Functional capabilities"
          values={projection.functionalCapabilities}
        />
        <ContextSection
          title="Movement considerations"
          values={projection.movementConsiderations}
          emphasis
        />
        <ContextSection title="Avoid" values={projection.avoid} danger />
        <ContextSection title="Access needs" values={projection.accessibilityNeeds} />
        <ContextSection title="Stop signals" values={projection.stopSignals} danger />
      </div>
      <div className="data-list" aria-label="Projection authority and provenance">
        <div className="data-row">
          <span>Projection reference</span>
          <strong>{projection.projectionId}</strong>
        </div>
        <div className="data-row">
          <span>Purpose</span>
          <strong>{projection.purpose}</strong>
        </div>
        <div className="data-row">
          <span>Granted scopes</span>
          <strong>{scopes.length ? scopes.join(", ") : "None"}</strong>
        </div>
        <div className="data-row">
          <span>Provenance classes</span>
          <strong>
            {projection.sourceCategories.length ? projection.sourceCategories.join(", ") : "None"}
          </strong>
        </div>
        <div className="data-row">
          <span>Issued at</span>
          <strong>{projection.issuedAt}</strong>
        </div>
        <div className="data-row">
          <span>Expires at</span>
          <strong>{projection.expiresAt}</strong>
        </div>
        <div className="data-row">
          <span>Synthetic</span>
          <strong>{projection.synthetic ? "Yes" : "No"}</strong>
        </div>
      </div>
      <div className="privacy-boundary">
        <LockKeyhole size={18} />
        <p>
          <strong>Not shared:</strong> name, birth date, contact details, diagnoses, medications,
          laboratories, documents, Passport ID, and clinician identity.
        </p>
      </div>
      {message ? (
        <p className="grant-message" role="alert">
          {message}
        </p>
      ) : null}
      <div className="projection-actions">
        <span className="projection-expiry">
          <Clock3 size={14} /> Context expires {new Date(projection.expiresAt).toLocaleString()}
        </span>
        <div>
          <button
            className="button button--light"
            type="button"
            onClick={async () => {
              const response = await fetch("/api/context/current", { method: "DELETE" });
              if (!response.ok) {
                setMessage("The server could not revoke this Gym session. Please try again.");
                return;
              }
              setProjection(null);
              setScopes([]);
              setContextActive(false);
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
        {values.length ? (
          values.map((value) => (
            <span
              className={danger ? "tag tag--orange" : emphasis ? "tag tag--green" : "tag"}
              key={value}
            >
              {value}
            </span>
          ))
        ) : (
          <span className="tag">None</span>
        )}
      </div>
    </div>
  );
}
