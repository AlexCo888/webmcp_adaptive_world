"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import { PageHeading, PortalShell } from "@/components/shell";
import { formatPassportDate } from "@/lib/date-format";
import type { SavedRoutineDetail } from "@/lib/saved-routines";

export function SavedRoutineView({ routine }: { routine: SavedRoutineDetail }) {
  const [completedStations, setCompletedStations] = useState<Set<number>>(() => new Set());

  return (
    <PortalShell view="dashboard" title="Saved routine">
      <PageHeading
        eyebrow="Saved to your Passport"
        title={routine.title}
        description={`${routine.durationMinutes} minutes · Saved ${formatPassportDate(routine.savedAt)}`}
        selector={false}
      />
      <div className="dashboard-grid">
        <div className="stack">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Station checklist</h2>
                <p className="card-subtitle">
                  Staff-authored structure grounded in verified equipment
                </p>
              </div>
              <span className="pill">
                {completedStations.size}/{routine.exercises.length} complete
              </span>
            </div>
            <div className="scope-list">
              {routine.exercises.map((exercise, index) => (
                <article className="scope" key={`${exercise.equipmentId}-${index}`}>
                  <div className="scope-main" style={{ alignItems: "flex-start" }}>
                    <div className="scope-icon">
                      <input
                        aria-label={`Mark station ${index + 1}, ${exercise.name}, complete`}
                        checked={completedStations.has(index)}
                        type="checkbox"
                        onChange={(event) => {
                          setCompletedStations((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(index);
                            else next.delete(index);
                            return next;
                          });
                        }}
                      />
                    </div>
                    <div>
                      <strong>{exercise.name}</strong>
                      <small>
                        {exercise.durationMinutes
                          ? `${exercise.durationMinutes} minutes`
                          : `${exercise.sets ?? "—"} sets · ${exercise.reps ?? "guided reps"}`}{" "}
                        · {exercise.intensity}
                      </small>
                      <p className="card-subtitle" style={{ marginTop: 8 }}>
                        {exercise.instructions.join(" ")}
                      </p>
                      <div className="progressive-note" style={{ marginTop: 10 }}>
                        <Icon name="spark" width="15" />
                        <span>{exercise.adaptationReason}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong>{exercise.manufacturer}</strong>
                    <small style={{ display: "block" }}>{exercise.model}</small>
                    {exercise.sourceUrl ? (
                      <a
                        className="text-link"
                        href={exercise.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Manufacturer source
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2>Safety notes</h2>
                <p className="card-subtitle">Keep these visible throughout the routine</p>
              </div>
            </div>
            <div className="scope-list">
              {routine.safetyNotes.map((note) => (
                <div className="scope" key={note}>
                  <div className="scope-main">
                    <div className="scope-icon">
                      <Icon name="shield" width="15" />
                    </div>
                    <strong>{note}</strong>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="stack">
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Provenance</h2>
                <p className="card-subtitle">Versioned inputs used when this snapshot was saved</p>
              </div>
            </div>
            <div className="data-list">
              <div className="data-row">
                <span>Your stated goal</span>
                <strong>{routine.goal}</strong>
              </div>
              <div className="data-row">
                <span>Template</span>
                <strong>{routine.templateId}</strong>
              </div>
              <div className="data-row">
                <span>Template version</span>
                <strong>{routine.templateVersion}</strong>
              </div>
              <div className="data-row">
                <span>Catalog version</span>
                <strong>{routine.catalogVersion}</strong>
              </div>
              <div className="data-row">
                <span>Created via</span>
                <strong>{routine.createdVia === "webmcp" ? "WebMCP" : "Gym site"}</strong>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2>Adaptation trace</h2>
                <p className="card-subtitle">Why this staff-authored template was selected</p>
              </div>
            </div>
            <div className="scope-list">
              {routine.decisionTrace.map((reason) => (
                <div className="scope" key={reason}>
                  <div className="scope-main">
                    <div className="scope-icon">
                      <Icon name="check" width="14" />
                    </div>
                    <small>{reason}</small>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card" style={{ background: "#fff4df" }}>
            <div className="progressive-note" style={{ margin: 0 }}>
              <Icon name="info" width="17" />
              <span>
                Synthetic demonstration only. This routine is non-clinical and is not medical
                advice, diagnosis, treatment, clearance, or emergency guidance.
              </span>
            </div>
          </section>
        </aside>
      </div>
    </PortalShell>
  );
}
