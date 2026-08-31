"use client";

import Link from "next/link";
import { Icon } from "@/components/icon";
import { PageHeading, PortalShell } from "@/components/shell";
import { formatPassportDate } from "@/lib/date-format";
import { usePortal } from "@/lib/portal-context";

function age(dateOfBirth: string) {
  return Math.floor((Date.now() - new Date(dateOfBirth).getTime()) / 31_557_600_000);
}

export function DashboardView() {
  const { patient, grants, guidance, savedRoutines } = usePortal();
  if (!patient) throw new Error("The owner Passport is unavailable.");
  const initials = patient.identity.displayName
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  const systolic = patient.vitalSigns.find((item) => item.code === "systolic_bp");
  const diastolic = patient.vitalSigns.find((item) => item.code === "diastolic_bp");
  const restingHr = patient.vitalSigns.find((item) => item.code === "resting_hr");
  const bmi = patient.weightKg / (patient.heightCm / 100) ** 2;
  const activeShares = grants.filter(
    (grant) => grant.passportId === patient.id && grant.status === "active",
  );
  const highlighted = patient.notableResults.slice(0, 3);

  return (
    <PortalShell view="dashboard" title="Overview">
      <PageHeading
        eyebrow="Personal context, under your control"
        title={`Good afternoon, ${patient.identity.displayName.split(" ")[0]}`}
        description="Your Passport brings health, movement, and preference data together—then shares only what you approve."
      />
      <div className="dashboard-grid">
        <div className="stack">
          <section className="hero-card">
            <div className="hero-top">
              <div className="hero-identity">
                <div className="avatar">{initials}</div>
                <div>
                  <h2>{patient.identity.displayName}</h2>
                  <p>
                    {age(patient.identity.dateOfBirth)} years ·{" "}
                    {patient.identity.pronouns ?? patient.identity.biologicalSex}
                  </p>
                  <span className="verified">
                    <Icon name="check" width="12" /> Synthetic identity verified
                  </span>
                </div>
              </div>
              <span className="visibility">
                <Icon name="lock" width="11" style={{ verticalAlign: "middle", marginRight: 5 }} />{" "}
                Private
              </span>
            </div>
            <div className="passport-number">
              Passport ID<strong>{patient.id.toUpperCase()}</strong>
            </div>
            <div className="hero-stats">
              <div className="hero-stat">
                <span>Last updated</span>
                <strong>{formatPassportDate(patient.updatedAt)}</strong>
              </div>
              <div className="hero-stat">
                <span>Active shares</span>
                <strong>
                  {activeShares.length} permission{activeShares.length === 1 ? "" : "s"}
                </strong>
              </div>
              <div className="hero-stat">
                <span>Data sources</span>
                <strong>{patient.sources.length} verified sources</strong>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2>Health at a glance</h2>
                <p className="card-subtitle">The latest structured observations in this Passport</p>
              </div>
              <Link className="text-link" href="/documents">
                View documents
              </Link>
            </div>
            <div className="metric-grid">
              <div className="metric">
                <div className="metric-label">
                  Blood pressure
                  <span className="metric-status" />
                </div>
                <div className="metric-value">
                  {systolic?.value ?? "—"}/{diastolic?.value ?? "—"}
                </div>
                <small>mmHg · Latest</small>
              </div>
              <div className="metric">
                <div className="metric-label">
                  Resting HR
                  <span className="metric-status" />
                </div>
                <div className="metric-value">{restingHr?.value ?? "—"}</div>
                <small>bpm · Latest</small>
              </div>
              <div className="metric">
                <div className="metric-label">
                  BMI
                  <span className="metric-status monitor" />
                </div>
                <div className="metric-value">{bmi.toFixed(1)}</div>
                <small>kg/m² · Calculated</small>
              </div>
              <div className="metric">
                <div className="metric-label">
                  Activity
                  <span className="metric-status" />
                </div>
                <div className="metric-value">{patient.functional.weeklyActivityMinutes}</div>
                <small>minutes / week</small>
              </div>
            </div>
          </section>

          {guidance.length ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Current clinician guidance</h2>
                  <p className="card-subtitle">Visible in your Passport; never copied into Gym</p>
                </div>
                <span className="pill neutral">Private</span>
              </div>
              {guidance.slice(0, 3).map((item) => (
                <div className="insight" key={item.id}>
                  <div className="insight-icon blue">
                    <Icon name="doctor" width="17" />
                  </div>
                  <div>
                    <h3>{item.doctorName}</h3>
                    <p>{item.guidance}</p>
                    <small>Expires {formatPassportDate(item.expiresAt)}</small>
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {savedRoutines.length ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Saved routines</h2>
                  <p className="card-subtitle">Personalized Gym routines saved to this Passport</p>
                </div>
                <span className="pill neutral">Synthetic demo</span>
              </div>
              <div className="scope-list">
                {savedRoutines.map((routine) => (
                  <Link className="scope" href={`/routines/${routine.id}`} key={routine.id}>
                    <div className="scope-main">
                      <div className="scope-icon">
                        <Icon name="activity" width="15" />
                      </div>
                      <div>
                        <strong>{routine.title}</strong>
                        <small>
                          Saved {formatPassportDate(routine.savedAt)} · Template{" "}
                          {routine.templateVersion}
                        </small>
                      </div>
                    </div>
                    <span className="text-link">Open →</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="card-header">
              <div>
                <h2>Relevant insights</h2>
                <p className="card-subtitle">
                  Small signals worth keeping in context—not diagnoses
                </p>
              </div>
            </div>
            {highlighted.map((result, index) => (
              <div className="insight" key={result.code}>
                <div
                  className={`insight-icon ${result.interpretation === "low" || result.interpretation === "high" ? "amber" : index === 2 ? "blue" : ""}`}
                >
                  <Icon name={result.interpretation === "normal" ? "check" : "spark"} width="17" />
                </div>
                <div>
                  <h3>
                    {result.label}: {result.value} {result.unit}
                  </h3>
                  <p>
                    {result.interpretation === "normal"
                      ? "Within the illustrative reference range."
                      : "Flagged for context and appropriate follow-up; this demo does not provide a diagnosis."}
                  </p>
                </div>
              </div>
            ))}
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Movement profile</h2>
                <p className="card-subtitle">What an adaptive environment may need</p>
              </div>
            </div>
            <div className="data-list">
              <div className="data-row">
                <span>Experience</span>
                <strong style={{ textTransform: "capitalize" }}>
                  {patient.functional.experienceLevel}
                </strong>
              </div>
              <div className="data-row">
                <span>Session preference</span>
                <strong>{patient.functional.preferredSessionMinutes} minutes</strong>
              </div>
              <div className="data-row">
                <span>Primary goal</span>
                <strong>{patient.functional.goals[0]}</strong>
              </div>
            </div>
            <div style={{ marginTop: 18 }} className="scope-list">
              {patient.functional.movementConsiderations.slice(0, 3).map((item) => (
                <div className="scope" key={item}>
                  <div className="scope-main">
                    <div className="scope-icon">
                      <Icon name="activity" width="15" />
                    </div>
                    <strong>{item}</strong>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Currently shared</h2>
                <p className="card-subtitle">Purpose-bound, revocable access</p>
              </div>
              <Link href="/sharing" className="text-link">
                Manage
              </Link>
            </div>
            <div className="scope-list">
              {activeShares.length ? (
                activeShares.slice(0, 3).map((grant) => (
                  <div className="scope" key={grant.id}>
                    <div className="scope-main">
                      <div className="scope-icon">
                        <Icon
                          name={grant.granteeType === "clinician" ? "doctor" : "key"}
                          width="15"
                        />
                      </div>
                      <div>
                        <strong>
                          {grant.granteeType === "clinician" ? "Dr. Elena Vargas" : "Adaptive Gym"}
                        </strong>
                        <small>{grant.purpose}</small>
                      </div>
                    </div>
                    <span className="pill">Active</span>
                  </div>
                ))
              ) : (
                <div className="empty-state" style={{ padding: "22px 8px" }}>
                  <p>No active shares for this profile.</p>
                  <Link className="button small" href="/sharing">
                    Create one
                  </Link>
                </div>
              )}
            </div>
          </section>
          <section className="card" style={{ background: "#e8eedf" }}>
            <div className="insight" style={{ padding: 0 }}>
              <div className="insight-icon">
                <Icon name="shield" width="17" />
              </div>
              <div>
                <h3>Progressive disclosure</h3>
                <p>
                  Recipients get the smallest useful view. Your complete Passport remains private.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </PortalShell>
  );
}
