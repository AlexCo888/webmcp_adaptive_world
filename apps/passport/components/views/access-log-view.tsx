"use client";

import { Icon } from "@/components/icon";
import { PageHeading, PortalShell } from "@/components/shell";
import { usePortal } from "@/lib/portal-context";

function relativeLabel(value: string) {
  const days = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 86_400_000));
  return days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
}

export function AccessLogView() {
  const { auditEvents } = usePortal();
  const labels: Record<string, { title: string; detail: string }> = {
    "passport.demo.seeded": {
      title: "Synthetic Passport initialized",
      detail: "Demo fixture was loaded into the private Passport store",
    },
    "doctor.access_grant.created": {
      title: "Doctor permission created",
      detail: "An exact set of clinical scopes was persisted",
    },
    "doctor.access_grant.revoked": {
      title: "Doctor permission revoked",
      detail: "Subsequent protected requests are blocked",
    },
    "gym.context_grant.created": {
      title: "One-use Gym context approved",
      detail: "A minimum projection was stored behind a hashed exchange token",
    },
    "gym.context_grant.redeemed": {
      title: "Gym context redeemed",
      detail: "The code was atomically closed and an anonymous Gym session began",
    },
    "clinical_guidance.confirmed": {
      title: "Clinical guidance confirmed",
      detail: "The authorized clinician confirmed a write action",
    },
  };
  const events = auditEvents.map((event) => ({
    id: event.id,
    title: labels[event.action]?.title ?? event.action,
    detail: labels[event.action]?.detail ?? "Purpose-bound server event",
    time: event.occurredAt,
    outcome:
      event.outcome === "success" ? "Allowed" : event.outcome === "denied" ? "Denied" : "Error",
  }));
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
              <p className="card-subtitle">Persisted server events for this signed-in Passport</p>
            </div>
            <span className="pill neutral">Immutable log</span>
          </div>
          <div className="timeline">
            {!events.length ? <p className="card-subtitle">No persisted events yet.</p> : null}
            {events.map((event) => (
              <article className="timeline-item" key={event.id}>
                <span
                  className="timeline-dot"
                  style={
                    event.outcome === "Denied" || event.outcome === "Error"
                      ? { background: "var(--red)" }
                      : event.outcome === "Revoked"
                        ? { background: "var(--amber)" }
                        : undefined
                  }
                />
                <h3>
                  {event.title}{" "}
                  <span
                    className={`pill ${event.outcome === "Denied" || event.outcome === "Error" ? "warning" : "neutral"}`}
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
                  {events.filter((item) => item.outcome !== "Allowed").length}
                </div>
                <small>denied or failed events</small>
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
