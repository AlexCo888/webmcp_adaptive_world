"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/icon";
import { PageHeading, PortalShell } from "@/components/shell";
import { usePortal } from "@/lib/portal-context";
import type { DoctorPassportView } from "@/lib/session";

type Section = "overview" | "clinical" | "movement" | "documents";

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

function PatientCard({
  patient,
  selected,
  onSelect,
}: {
  patient: DoctorPassportView;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button className={`patient-card ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div className="person">
        <div className="avatar">{initials(patient.displayName)}</div>
        <div>
          <strong>{patient.displayName}</strong>
          <small>
            {patient.ageYears} years · Updated {new Date(patient.updatedAt).toLocaleDateString()}
          </small>
        </div>
      </div>
      <div className="patient-summary">
        {patient.clinical?.conditions.length ? (
          patient.clinical.conditions.slice(0, 2).map((condition) => (
            <span className="pill neutral" key={condition.id}>
              {condition.label}
            </span>
          ))
        ) : patient.clinical ? (
          <span className="pill">No active conditions</span>
        ) : (
          <span className="pill neutral">Summary scope</span>
        )}
      </div>
      <div className="patient-footer">
        <span>{patient.documents.length} sources</span>
        <span style={{ color: "#437057", fontWeight: 800 }}>Open Passport →</span>
      </div>
    </button>
  );
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="data-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PatientDetail({ patient, section }: { patient: DoctorPassportView; section: Section }) {
  if (section === "clinical") {
    const clinical = patient.clinical;
    if (!clinical) {
      return (
        <div className="progressive-note">
          <Icon name="lock" width="17" />
          <span>Clinical details are not present in this scope-projected response.</span>
        </div>
      );
    }
    return (
      <>
        <div className="progressive-note">
          <Icon name="shield" width="17" />
          <span>
            Clinical data is visible because this patient granted{" "}
            <code>passport.clinical.read</code>. Open sources only when the current task needs them.
          </span>
        </div>
        <div className="data-block">
          <h3>Conditions</h3>
          <div className="data-list">
            {clinical.conditions.length ? (
              clinical.conditions.map((item) => (
                <DataRow
                  key={item.id}
                  label={item.label}
                  value={
                    <span className={`pill ${item.status === "monitoring" ? "warning" : ""}`}>
                      {item.status}
                    </span>
                  }
                />
              ))
            ) : (
              <DataRow label="Current conditions" value="None reported" />
            )}
          </div>
        </div>
        <div className="data-block">
          <h3>Medications & allergies</h3>
          <div className="data-list">
            <DataRow
              label="Active medications"
              value={
                clinical.medications.length
                  ? clinical.medications.map((item) => `${item.name} ${item.dose}`).join(", ")
                  : "None"
              }
            />
            <DataRow
              label="Known allergies"
              value={
                clinical.allergies.length
                  ? clinical.allergies
                      .map((item) => `${item.substance} (${item.reaction})`)
                      .join(", ")
                  : "None known"
              }
            />
          </div>
        </div>
        <div className="data-block">
          <h3>Notable observations</h3>
          <div className="data-list">
            {clinical.notableResults.map((result) => (
              <DataRow
                key={result.code}
                label={result.label}
                value={
                  <>
                    {result.value} {result.unit}{" "}
                    <span
                      className={`pill ${result.interpretation === "high" || result.interpretation === "low" ? "warning" : ""}`}
                      style={{ marginLeft: 6 }}
                    >
                      {result.interpretation}
                    </span>
                  </>
                }
              />
            ))}
          </div>
        </div>
      </>
    );
  }

  if (section === "movement")
    return (
      <>
        <div className="progressive-note">
          <Icon name="activity" width="17" />
          <span>
            This functional view is intentionally separate from full clinical records so movement
            professionals can receive only relevant context.
          </span>
        </div>
        <div className="data-block">
          <h3>Goals & preferences</h3>
          <div className="data-list">
            <DataRow label="Experience" value={patient.functional.experienceLevel} />
            <DataRow
              label="Preferred session"
              value={`${patient.functional.preferredSessionMinutes} minutes`}
            />
            <DataRow label="Goals" value={patient.functional.goals.join(" · ")} />
            <DataRow
              label="Preferred activities"
              value={patient.functional.preferredActivities.join(" · ")}
            />
          </div>
        </div>
        <div className="data-block">
          <h3>Movement considerations</h3>
          <div className="scope-list">
            {patient.functional.movementConsiderations.map((item) => (
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
        </div>
        <div className="data-block">
          <h3>Stop signals</h3>
          <div className="scope-tags">
            {patient.functional.stopSignals.map((signal) => (
              <span className="pill warning" key={signal}>
                {signal}
              </span>
            ))}
          </div>
        </div>
      </>
    );

  if (section === "documents")
    return (
      <>
        <div className="progressive-note">
          <Icon name="lock" width="17" />
          <span>
            The list is a low-detail index. Opening any source requires a separate authorized
            request and produces an audit event.
          </span>
        </div>
        <div className="document-grid" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
          {patient.documents.map((document) => (
            <article className="document-card" key={document.id}>
              <div className="doc-top">
                <div className={`doc-icon ${document.kind === "lab-report" ? "lab" : ""}`}>
                  <Icon name={document.kind === "lab-report" ? "lab" : "file"} width="18" />
                </div>
                <span className="pill neutral">Index only</span>
              </div>
              <h3>{document.title}</h3>
              <p>
                {document.kind} · {document.sourceId}
              </p>
              <div className="doc-footer">
                <small>{new Date(document.issuedAt).toLocaleDateString()}</small>
                <button className="text-link">Open source</button>
              </div>
            </article>
          ))}
        </div>
      </>
    );

  const bpS = patient.clinical?.vitalSigns.find((item) => item.code === "systolic_bp")?.value;
  const bpD = patient.clinical?.vitalSigns.find((item) => item.code === "diastolic_bp")?.value;
  return (
    <>
      <div className="progressive-note">
        <Icon name="info" width="17" />
        <span>
          This overview combines the minimum clinical and functional context needed for orientation.
          Use the sections at left to disclose more only when necessary.
        </span>
      </div>
      <div className="data-block">
        <h3>Patient overview</h3>
        <div className="data-list">
          <DataRow label="Age" value={`${patient.ageYears} years`} />
          {patient.clinical ? (
            <>
              <DataRow label="Sex" value={patient.clinical.biologicalSex} />
              <DataRow label="Blood pressure" value={`${bpS}/${bpD} mmHg`} />
              <DataRow
                label="Height / weight"
                value={`${patient.clinical.heightCm} cm · ${patient.clinical.weightKg} kg`}
              />
            </>
          ) : null}
          <DataRow
            label="Activity"
            value={`${patient.functional.weeklyActivityMinutes} min/week`}
          />
        </div>
      </div>
      {patient.clinical ? (
        <div className="data-block">
          <h3>Current picture</h3>
          <div className="scope-tags">
            {patient.clinical.conditions.map((condition) => (
              <span key={condition.id} className="pill neutral">
                {condition.label} · {condition.status}
              </span>
            ))}
            {patient.clinical.notableResults
              .filter((result) => result.interpretation !== "normal")
              .map((result) => (
                <span key={result.code} className="pill warning">
                  {result.label} · {result.value} {result.unit}
                </span>
              ))}
          </div>
        </div>
      ) : null}
      <div className="data-block">
        <h3>Primary goals</h3>
        <div className="scope-list">
          {patient.functional.goals.map((goal) => (
            <div className="scope" key={goal}>
              <div className="scope-main">
                <div className="scope-icon">
                  <Icon name="spark" width="15" />
                </div>
                <strong>{goal}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function DoctorView() {
  const { actor, passports, grants, notify } = usePortal();
  const doctorPassports = useMemo(
    () =>
      passports.filter(
        (passport): passport is DoctorPassportView =>
          "kind" in passport && passport.kind === "doctor-passport-view",
      ),
    [passports],
  );
  const authorized = useMemo(
    () =>
      doctorPassports.filter((passport) =>
        grants.some(
          (grant) =>
            grant.passportId === passport.id &&
            grant.granteeType === "clinician" &&
            grant.status === "active" &&
            new Date(grant.expiresAt) > new Date(),
        ),
      ),
    [doctorPassports, grants],
  );
  const [selectedId, setSelectedId] = useState(authorized[0]?.id ?? "");
  const [section, setSection] = useState<Section>("overview");
  const [query, setQuery] = useState("");
  const [guidance, setGuidance] = useState("");
  const [showGuidance, setShowGuidance] = useState(false);
  const [savingGuidance, setSavingGuidance] = useState(false);
  const patient = authorized.find((item) => item.id === selectedId) ?? authorized[0];
  const filtered = authorized.filter((item) =>
    item.displayName.toLowerCase().includes(query.toLowerCase()),
  );
  useEffect(() => {
    if (!patient && authorized[0]) setSelectedId(authorized[0].id);
  }, [authorized, patient]);
  const patientGrants = grants.filter(
    (grant) =>
      grant.passportId === patient?.id &&
      grant.granteeType === "clinician" &&
      grant.status === "active" &&
      new Date(grant.expiresAt) > new Date(),
  );
  const patientScopes = new Set(patientGrants.flatMap((grant) => grant.scopes));
  const authorizationExpiry = patientGrants.reduce(
    (latest, grant) => (grant.expiresAt > latest ? grant.expiresAt : latest),
    "",
  );
  const sections: Array<{ id: Section; label: string; icon: IconName }> = [
    { id: "overview", label: "Overview", icon: "user" },
    ...(patientScopes.has("passport.clinical.read")
      ? ([{ id: "clinical", label: "Clinical", icon: "heart" }] as const)
      : []),
    { id: "movement", label: "Movement", icon: "activity" },
    ...(patientScopes.has("passport.documents.read")
      ? ([{ id: "documents", label: "Sources", icon: "file" }] as const)
      : []),
  ];

  return (
    <PortalShell view="doctor" title="Doctor portal">
      <PageHeading
        eyebrow="Doctor portal · Synthetic demo"
        title="My Patients"
        description="Search only the people who have explicitly granted this signed-in doctor access. There is no global patient search."
        selector={false}
      />
      <section className="doctor-hero">
        <div>
          <p className="eyebrow" style={{ color: "var(--lime)" }}>
            Welcome back
          </p>
          <h2>{actor.displayName}</h2>
          <p>Sports medicine · Adaptive World Demo Clinic</p>
        </div>
        <div className="doctor-stat">
          <strong>{authorized.length}</strong>
          <span>Active patient grants</span>
        </div>
      </section>
      <section className="card" style={{ marginBottom: 20 }}>
        <div className="toolbar">
          <div className="search">
            <Icon name="search" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search within My Patients…"
            />
          </div>
          <span className="pill neutral">
            <Icon name="lock" width="11" style={{ marginRight: 4 }} /> Relationship-bound
          </span>
        </div>
        {filtered.length ? (
          <div className="patient-grid">
            {filtered.map((item) => (
              <PatientCard
                key={item.id}
                patient={item}
                selected={item.id === patient?.id}
                onSelect={() => {
                  setSelectedId(item.id);
                  setSection("overview");
                }}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <Icon name="search" width="22" />
            </div>
            <h2>No authorized match</h2>
            <p>Results never include people outside this doctor&apos;s active grants.</p>
          </div>
        )}
      </section>
      {patient ? (
        <section className="card">
          <div className="card-header">
            <div className="person">
              <div className="avatar" style={{ width: 42, height: 42 }}>
                {initials(patient.displayName)}
              </div>
              <div>
                <h2>{patient.displayName}</h2>
                <p className="card-subtitle">
                  Authorized through {new Date(authorizationExpiry).toLocaleDateString()}
                </p>
              </div>
            </div>
            {patientScopes.has("passport.guidance.write") ? (
              <button className="button primary" onClick={() => setShowGuidance(true)}>
                <Icon name="plus" width="14" /> Add guidance
              </button>
            ) : (
              <span className="pill neutral">Read-only grant</span>
            )}
          </div>
          <div className="disclosure">
            <nav className="disclosure-nav" aria-label="Patient sections">
              {sections.map((item) => (
                <button
                  key={item.id}
                  className={section === item.id ? "active" : ""}
                  onClick={() => setSection(item.id)}
                >
                  <Icon name={item.icon} width="15" />
                  {item.label}
                </button>
              ))}
            </nav>
            <div>
              <PatientDetail patient={patient} section={section} />
            </div>
          </div>
        </section>
      ) : null}
      {showGuidance && patient ? (
        <div className="modal-backdrop" onMouseDown={() => setShowGuidance(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guidance-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Human-confirmed write</p>
                <h2 id="guidance-title">Add clinical guidance</h2>
                <p>
                  The patient will see the exact text below and its author. This demo does not
                  provide medical advice.
                </p>
              </div>
              <button className="icon-button" onClick={() => setShowGuidance(false)}>
                <Icon name="x" width="15" />
              </button>
            </div>
            <div className="field">
              <label htmlFor="guidance">Guidance for {patient.displayName}</label>
              <textarea
                id="guidance"
                rows={6}
                value={guidance}
                onChange={(event) => setGuidance(event.target.value)}
                style={{
                  width: "100%",
                  resize: "vertical",
                  border: "1px solid var(--line)",
                  borderRadius: 11,
                  padding: 12,
                }}
                placeholder="Enter exact, purpose-specific guidance…"
              />
            </div>
            <div className="progressive-note" style={{ marginTop: 14 }}>
              <Icon name="info" width="16" />
              <span>
                This UI confirmation remains required even when a WebMCP agent prepares the action.
              </span>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setShowGuidance(false)}>
                Cancel
              </button>
              <button
                className="button primary"
                disabled={!guidance.trim()}
                onClick={async () => {
                  setSavingGuidance(true);
                  const response = await fetch("/api/guidance", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ patientId: patient.id, guidance }),
                  });
                  setSavingGuidance(false);
                  if (!response.ok) {
                    notify("Guidance was blocked because the active scope was insufficient");
                    return;
                  }
                  notify("Clinical guidance saved in the patient’s Passport and audit history");
                  setGuidance("");
                  setShowGuidance(false);
                }}
              >
                {savingGuidance ? "Saving…" : "Confirm & add"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </PortalShell>
  );
}
