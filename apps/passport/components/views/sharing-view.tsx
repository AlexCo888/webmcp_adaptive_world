"use client";

import { useState } from "react";
import type { PassportScope } from "@adaptive-world/contracts";
import { Icon } from "@/components/icon";
import { PageHeading, PortalShell } from "@/components/shell";
import { usePortal } from "@/lib/portal-context";

const scopeOptions: Array<{ value: PassportScope; label: string; note: string }> = [
  {
    value: "passport.summary.read",
    label: "Passport summary",
    note: "Identity, conditions, goals, and recent highlights",
  },
  {
    value: "passport.clinical.read",
    label: "Clinical data",
    note: "Medications, allergies, and structured observations",
  },
  {
    value: "passport.documents.read",
    label: "Documents",
    note: "Open individual authorized source documents",
  },
];

function recipientName(id: string, type: string) {
  if (id.includes("gym") || type === "application") return "Adaptive Gym";
  if (id.includes("vargas") || type === "clinician") return "Dr. Elena Vargas";
  return id;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(value),
  );
}

export function SharingView() {
  const { patient, grants, revokeGrant, createGrant } = usePortal();
  const [showCreate, setShowCreate] = useState(false);
  const [recipient, setRecipient] = useState<"doctor" | "gym">("doctor");
  const [selectedScopes, setSelectedScopes] = useState<PassportScope[]>(["passport.summary.read"]);
  const [days, setDays] = useState(30);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patientGrants = grants.filter((grant) => grant.passportId === patient.id);

  const toggleScope = (scope: PassportScope) =>
    setSelectedScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
  const submit = async () => {
    const scopes = recipient === "gym" ? ["gym.context.read" as const] : selectedScopes;
    setPending(true);
    setError(null);
    try {
      await createGrant(recipient, scopes, days);
      if (recipient === "doctor") setShowCreate(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The permission could not be created.");
      setPending(false);
    }
  };

  return (
    <PortalShell view="sharing" title="Sharing">
      <PageHeading
        eyebrow="Consent, made visible"
        title="Sharing & permissions"
        description="See exactly who can access which parts of this Passport, why, and for how long."
        action={
          <button className="button primary" onClick={() => setShowCreate(true)}>
            <Icon name="plus" width="14" /> Create permission
          </button>
        }
      />

      <div className="dashboard-grid">
        <section className="card">
          <div className="card-header">
            <div>
              <h2>Access grants</h2>
              <p className="card-subtitle">
                Permissions are purpose-bound and can be revoked immediately
              </p>
            </div>
            <span className="pill">
              {patientGrants.filter((grant) => grant.status === "active").length} active
            </span>
          </div>
          {patientGrants.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Approved scopes</th>
                    <th>Expires</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {patientGrants.map((grant) => (
                    <tr key={grant.id}>
                      <td>
                        <div className="person">
                          <div
                            className="avatar"
                            style={
                              {
                                "--avatar":
                                  grant.granteeType === "clinician" ? "#365c48" : "#4d5ca7",
                              } as React.CSSProperties
                            }
                          >
                            <Icon
                              name={grant.granteeType === "clinician" ? "doctor" : "settings"}
                              width="14"
                            />
                          </div>
                          <div>
                            <strong>{recipientName(grant.granteeId, grant.granteeType)}</strong>
                            <small>{grant.purpose}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="scope-tags">
                          {grant.scopes.map((scope) => (
                            <span key={scope} className="scope-tag">
                              {scope}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>{formatDate(grant.expiresAt)}</td>
                      <td>
                        <span className={`pill ${grant.status === "active" ? "" : "neutral"}`}>
                          {grant.status}
                        </span>
                      </td>
                      <td>
                        {grant.status === "active" ? (
                          <button
                            className="button danger small"
                            onClick={() => revokeGrant(grant.id)}
                          >
                            Revoke
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">
                <Icon name="share" width="22" />
              </div>
              <h2>No permissions yet</h2>
              <p>Create a time-bound permission when you are ready to share.</p>
              <button className="button primary" onClick={() => setShowCreate(true)}>
                Create permission
              </button>
            </div>
          )}
        </section>
        <aside className="stack">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Your control model</h2>
                <p className="card-subtitle">Every grant answers four questions</p>
              </div>
            </div>
            <div className="scope-list">
              {[
                { icon: "user" as const, title: "Who", copy: "A verified person or application" },
                { icon: "eye" as const, title: "What", copy: "Explicit, minimal scopes" },
                { icon: "info" as const, title: "Why", copy: "A declared purpose" },
                { icon: "clock" as const, title: "Until when", copy: "Automatic expiration" },
              ].map((item) => (
                <div className="scope" key={item.title}>
                  <div className="scope-main">
                    <div className="scope-icon">
                      <Icon name={item.icon} width="15" />
                    </div>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.copy}</small>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="card" style={{ background: "#171f1a", color: "white" }}>
            <div className="insight" style={{ padding: 0 }}>
              <div
                className="insight-icon"
                style={{ background: "var(--lime)", color: "var(--ink)" }}
              >
                <Icon name="key" width="17" />
              </div>
              <div>
                <h3>Gym handoff is one-use</h3>
                <p style={{ color: "#aeb8b1" }}>
                  The exchange code expires quickly. The receiving Gym gets a minimal projection,
                  never the complete Passport.
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {showCreate ? (
        <div className="modal-backdrop" onMouseDown={() => setShowCreate(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">New permission</p>
                <h2 id="share-title">Choose what to share</h2>
                <p>
                  The account session and permission are real. The people and health records are
                  synthetic demo data.
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setShowCreate(false)}
                aria-label="Close"
              >
                <Icon name="x" width="15" />
              </button>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="recipient">Recipient</label>
                <select
                  id="recipient"
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value as "doctor" | "gym")}
                >
                  <option value="doctor">Dr. Elena Vargas · Clinician</option>
                  <option value="gym">Adaptive Gym · Application</option>
                </select>
              </div>
              {recipient === "doctor" ? (
                <div className="field">
                  <label>Approved scopes</label>
                  <div className="form-grid" style={{ gap: 8 }}>
                    {scopeOptions.map((scope) => (
                      <label className="checkbox-row" key={scope.value}>
                        <input
                          type="checkbox"
                          checked={selectedScopes.includes(scope.value)}
                          onChange={() => toggleScope(scope.value)}
                        />
                        <span>
                          <strong>{scope.label}</strong>
                          <small>{scope.note}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="progressive-note">
                  <Icon name="shield" width="17" />
                  <span>
                    Adaptive Gym receives goals, movement considerations, safety signals, and
                    accessibility needs—never labs, medications, identity, or source documents. The
                    exchange code works once and expires in five minutes.
                  </span>
                </div>
              )}
              {recipient === "doctor" ? (
                <div className="field">
                  <label htmlFor="duration">Duration</label>
                  <select
                    id="duration"
                    value={days}
                    onChange={(event) => setDays(Number(event.target.value))}
                  >
                    <option value="1">24 hours</option>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                  </select>
                </div>
              ) : null}
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button
                className="button primary"
                disabled={pending || (recipient === "doctor" && selectedScopes.length === 0)}
                onClick={submit}
              >
                <Icon name="shield" width="14" />
                {pending
                  ? "Creating permission…"
                  : recipient === "gym"
                    ? "Approve & continue to Gym"
                    : "Approve permission"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </PortalShell>
  );
}
