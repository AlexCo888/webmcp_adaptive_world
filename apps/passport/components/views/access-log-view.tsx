"use client";

import { Icon } from "@/components/icon";
import { PageHeading, PortalShell } from "@/components/shell";
import { usePortal } from "@/lib/portal-context";

function relativeLabel(value: string) {
  const days = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 86_400_000));
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}

export function AccessLogView() {
  const { patient, grants } = usePortal();
  const patientGrants = grants.filter((grant) => grant.passportId === patient.id);
  const events = [
    ...patientGrants.map((grant) => ({
      id: `${grant.id}_${grant.status}`,
      title: grant.status === "revoked" ? "Permission revoked" : "Passport access granted",
      detail: `${grant.granteeType === "clinician" ? "Dr. Elena Vargas" : "Adaptive Gym"} · ${grant.scopes.length} approved scope${grant.scopes.length === 1 ? "" : "s"}`,
      time: grant.revokedAt ?? grant.issuedAt,
      outcome: grant.status === "revoked" ? "Revoked" : "Allowed",
    })),
    {
      id: "owner_view",
      title: "Passport opened",
      detail: "You · Owner dashboard · Full private view",
      time: patient.updatedAt,
      outcome: "Allowed",
    },
    {
      id: "doctor_denied",
      title: "Unauthorized request blocked",
      detail: "Unknown clinician · No active relationship",
      time: "2026-08-19T16:22:00.000Z",
      outcome: "Denied",
    },
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  return (
    <PortalShell view="access" title="Access log">
      <PageHeading
        eyebrow="Transparent by design"
        title="Access log"
        description="A human-readable audit trail of who accessed, changed, or attempted to view this Passport."
      />
      <div className="dashboard-grid">
        <section className="card">
          <div className="card-header">
            <div>
              <h2>Recent activity</h2>
              <p className="card-subtitle">Synthetic audit events for the selected profile</p>
            </div>
            <span className="pill neutral">Immutable log</span>
          </div>
          <div className="timeline">
            {events.map((event) => (
              <article className="timeline-item" key={event.id}>
                <span
                  className="timeline-dot"
                  style={
                    event.outcome === "Denied"
                      ? { background: "var(--red)" }
                      : event.outcome === "Revoked"
                        ? { background: "var(--amber)" }
                        : undefined
                  }
                />
                <h3>
                  {event.title}{" "}
                  <span
                    className={`pill ${event.outcome === "Denied" ? "warning" : "neutral"}`}
                    style={{ marginLeft: 6 }}
                  >
                    {event.outcome}
                  </span>
                </h3>
                <p>{event.detail}</p>
                <span className="timeline-time">
                  {relativeLabel(event.time)} ·{" "}
                  {new Date(event.time).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </article>
            ))}
          </div>
        </section>
        <aside className="stack">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Audit summary</h2>
                <p className="card-subtitle">Events shown for this Passport</p>
              </div>
            </div>
            <div className="metric-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
              <div className="metric">
                <div className="metric-label">Allowed</div>
                <div className="metric-value">
                  {events.filter((item) => item.outcome === "Allowed").length}
                </div>
                <small>authorized events</small>
              </div>
              <div className="metric">
                <div className="metric-label">Blocked</div>
                <div className="metric-value">
                  {events.filter((item) => item.outcome === "Denied").length}
                </div>
                <small>denied requests</small>
              </div>
            </div>
          </section>
          <section className="card">
            <div className="insight" style={{ padding: 0 }}>
              <div className="insight-icon">
                <Icon name="database" width="17" />
              </div>
              <div>
                <h3>What gets recorded?</h3>
                <p>
                  Actor, purpose, requested resource, outcome, and timestamp. Sensitive content is
                  not duplicated into the audit event.
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </PortalShell>
  );
}
