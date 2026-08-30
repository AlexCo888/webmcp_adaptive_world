"use client";

import { useEffect, useState } from "react";
import type { PassportScope } from "@adaptive-world/contracts";
import { Icon } from "@/components/icon";
import { PageHeading, PortalShell } from "@/components/shell";
import type { PreparedGymContextGrant } from "@/lib/context-grant-contract";
import { formatPassportDate, formatPassportDateTime } from "@/lib/date-format";
import { GYM_CONTEXT_SCOPES } from "@/lib/gym-projection";
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

function gymHandoffStatus(status: "ready" | "connected" | "expired" | "revoked") {
  if (status === "ready") return "awaiting Gym";
  return status;
}

export function SharingView() {
  const {
    patient,
    grants,
    gymHandoffs,
    revokeGrant,
    revokeGymHandoff,
    prepareGymContextGrant,
    createDoctorAccessGrant,
    createGymContextGrant,
  } = usePortal();
  if (!patient) throw new Error("The owner Passport is unavailable.");
  const [showCreate, setShowCreate] = useState(false);
  const [recipient, setRecipient] = useState<"doctor" | "gym">("doctor");
  const [selectedScopes, setSelectedScopes] = useState<PassportScope[]>(["passport.summary.read"]);
  const [days, setDays] = useState(30);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preparedGymGrant, setPreparedGymGrant] = useState<PreparedGymContextGrant | null>(null);
  const [preparingGymGrant, setPreparingGymGrant] = useState(false);
  const [preparationRevision, setPreparationRevision] = useState(0);
  const patientGrants = grants.filter((grant) => grant.passportId === patient.id);
  const activeGymHandoffs = gymHandoffs.filter(
    (handoff) => handoff.status === "ready" || handoff.status === "connected",
  );

  useEffect(() => {
    if (!showCreate || recipient !== "gym") {
      setPreparedGymGrant(null);
      setPreparingGymGrant(false);
      return;
    }
    const controller = new AbortController();
    setPreparedGymGrant(null);
    setPreparingGymGrant(true);
    setError(null);
    void prepareGymContextGrant(5, controller.signal)
      .then((prepared) => {
        if (!controller.signal.aborted) setPreparedGymGrant(prepared);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "The live Gym projection could not be prepared.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreparingGymGrant(false);
      });
    return () => controller.abort();
  }, [preparationRevision, prepareGymContextGrant, recipient, showCreate]);

  const toggleScope = (scope: PassportScope) =>
    setSelectedScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
  const submit = async () => {
    const scopes = recipient === "gym" ? [...GYM_CONTEXT_SCOPES] : selectedScopes;
    setPending(true);
    setError(null);
    try {
      if (recipient === "gym") {
        if (!preparedGymGrant) throw new Error("Review the live Gym projection before approval.");
        await createGymContextGrant(5, undefined, preparedGymGrant.preparationToken);
      } else await createDoctorAccessGrant(scopes, days);
      if (recipient === "doctor") setShowCreate(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The permission could not be created.");
      if (recipient === "gym") {
        setPreparedGymGrant(null);
        setPreparationRevision((current) => current + 1);
      }
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
              {patientGrants.filter((grant) => grant.status === "active").length +
                activeGymHandoffs.length}{" "}
              active
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
                      <td>{formatPassportDate(grant.expiresAt)}</td>
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
          <div style={{ borderTop: "1px solid var(--line)", marginTop: 24, paddingTop: 24 }}>
            <div className="card-header">
              <div>
                <h3>Gym handoffs</h3>
                <p className="card-subtitle">
                  Live one-use application permissions and their resulting Gym sessions
                </p>
              </div>
              <span className="pill">{activeGymHandoffs.length} live</span>
            </div>
            {gymHandoffs.length ? (
              <div className="table-wrap">
                <table className="data-table" aria-label="Gym handoffs">
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
                    {gymHandoffs.map((handoff) => {
                      const live = handoff.status === "ready" || handoff.status === "connected";
                      return (
                        <tr key={handoff.id}>
                          <td>
                            <div className="person">
                              <div
                                className="avatar"
                                style={{ "--avatar": "#4d5ca7" } as React.CSSProperties}
                              >
                                <Icon name="settings" width="14" />
                              </div>
                              <div>
                                <strong>Adaptive Gym</strong>
                                <small>{handoff.purpose}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="scope-tags">
                              {handoff.scopes.map((scope) => (
                                <span key={scope} className="scope-tag">
                                  {scope}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>{formatPassportDateTime(handoff.expiresAt)}</td>
                          <td>
                            <span className={`pill ${live ? "" : "neutral"}`}>
                              {gymHandoffStatus(handoff.status)}
                            </span>
                          </td>
                          <td>
                            {live ? (
                              <button
                                className="button danger small"
                                onClick={() => void revokeGymHandoff(handoff.id)}
                              >
                                Revoke
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="card-subtitle">
                No Gym handoff has been created yet. Its live state will appear here after approval.
              </p>
            )}
          </div>
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
                <div className="form-grid">
                  <div className="progressive-note">
                    <Icon name="shield" width="17" />
                    <span>
                      This live, server-prepared preview comes from the current Passport. Approval
                      is bound to these exact fields and timestamps; payment adds no data or scopes.
                    </span>
                  </div>
                  {preparingGymGrant ? (
                    <div className="progressive-note" role="status">
                      <Icon name="clock" width="17" />
                      <span>Preparing the current minimum Gym projection…</span>
                    </div>
                  ) : preparedGymGrant ? (
                    <GymProjectionPreview prepared={preparedGymGrant} />
                  ) : null}
                  <div className="progressive-note">
                    <Icon name="info" width="17" />
                    <span>
                      Not shared: name, exact birth date, contacts, diagnoses, medications, labs,
                      allergies, documents, Passport ID, clinician identity, or payment data.
                    </span>
                  </div>
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
                disabled={
                  pending ||
                  (recipient === "doctor" && selectedScopes.length === 0) ||
                  (recipient === "gym" && !preparedGymGrant)
                }
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

function GymProjectionPreview({ prepared }: { prepared: PreparedGymContextGrant }) {
  const projection = prepared.projection;
  const rows: Array<[string, string]> = [
    ["Grant purpose", prepared.purpose],
    ["Granted scopes", prepared.scopes.join(", ")],
    ["Projection purpose", projection.purpose],
    ["Subject alias", projection.subjectAlias],
    ["Anonymous projection reference", projection.projectionReference],
    ["Goals", projection.goals.join("; ") || "None"],
    ["Experience", projection.experienceLevel],
    ["Preferred session", `${projection.preferredSessionMinutes} minutes`],
    ["Preferred activities", projection.preferredActivities.join("; ") || "None"],
    ["Functional capabilities", projection.functionalCapabilities.join("; ") || "None"],
    ["Movement considerations", projection.movementConsiderations.join("; ") || "None"],
    ["Avoid", projection.avoid.join("; ") || "None"],
    ["Stop signals", projection.stopSignals.join("; ") || "None"],
    ["Accessibility needs", projection.accessibilityNeeds.join("; ") || "None"],
    ["Provenance classes", projection.sourceCategories.join(", ") || "None"],
    ["Issued at", projection.issuedAt],
    ["Expires at", projection.expiresAt],
    ["Synthetic", projection.synthetic ? "Yes" : "No"],
  ];
  return (
    <div className="data-list" aria-label="Adaptive Gym projection field preview">
      {rows.map(([label, value]) => (
        <div className="data-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
