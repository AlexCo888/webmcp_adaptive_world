"use client";

import { useMemo, useState } from "react";
import type { DigitalPassport } from "@adaptive-world/contracts";
import { Icon } from "@/components/icon";
import { PageHeading, PortalShell } from "@/components/shell";
import { usePortal } from "@/lib/portal-context";

type Document = DigitalPassport["documents"][number];

function kindLabel(kind: Document["kind"]) {
  return {
    "lab-report": "Laboratory",
    imaging: "Imaging",
    "clinical-summary": "Summary",
    "functional-assessment": "Assessment",
    "care-guidance": "Guidance",
  }[kind];
}

function docIcon(kind: Document["kind"]) {
  return kind === "lab-report" ? "lab" : kind === "imaging" ? "scan" : "file";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(value),
  );
}

export function DocumentsView() {
  const { patient } = usePortal();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [selected, setSelected] = useState<Document | null>(null);
  const filtered = useMemo(
    () =>
      patient.documents.filter(
        (document) =>
          (kind === "all" || document.kind === kind) &&
          document.title.toLowerCase().includes(query.toLowerCase()),
      ),
    [kind, patient.documents, query],
  );

  return (
    <PortalShell view="documents" title="Documents">
      <PageHeading
        eyebrow="Your source of truth"
        title="Documents & labs"
        description="Every insight can be traced back to its source. All files shown here contain synthetic demo data."
      />
      <section className="card">
        <div className="toolbar">
          <div className="search">
            <Icon name="search" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search documents…"
              aria-label="Search documents"
            />
          </div>
          <select
            className="filter-button"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            aria-label="Filter by document type"
          >
            <option value="all">All types</option>
            <option value="lab-report">Laboratory</option>
            <option value="clinical-summary">Summaries</option>
            <option value="functional-assessment">Assessments</option>
            <option value="care-guidance">Guidance</option>
          </select>
          <button
            className="button primary"
            onClick={() => alert("Uploads are disabled in this synthetic, read-only demo.")}
          >
            <Icon name="plus" width="14" /> Add document
          </button>
        </div>
        {filtered.length ? (
          <div className="document-grid">
            {filtered.map((document) => (
              <button
                type="button"
                className="document-card"
                key={document.id}
                onClick={() => setSelected(document)}
                style={{ textAlign: "left" }}
              >
                <div className="doc-top">
                  <div
                    className={`doc-icon ${document.kind === "lab-report" ? "lab" : document.kind === "imaging" ? "scan" : ""}`}
                  >
                    <Icon name={docIcon(document.kind)} width="18" />
                  </div>
                  <Icon name="more" width="16" />
                </div>
                <h3>{document.title}</h3>
                <p>{kindLabel(document.kind)} · Synthetic demo</p>
                <div className="doc-footer">
                  <small>{formatDate(document.issuedAt)}</small>
                  <span className="pill neutral">{document.sensitivity}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <Icon name="search" width="22" />
            </div>
            <h2>No matching documents</h2>
            <p>Try a different name or document type.</p>
          </div>
        )}
      </section>

      <section className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div>
            <h2>Structured notable results</h2>
            <p className="card-subtitle">
              Machine-readable values for progressive, scoped retrieval
            </p>
          </div>
          <span className="pill blue">{patient.notableResults.length} observations</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Observation</th>
                <th>Value</th>
                <th>Interpretation</th>
                <th>Observed</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {patient.notableResults.map((result) => (
                <tr key={result.code}>
                  <td>
                    <strong>{result.label}</strong>
                  </td>
                  <td>
                    {result.value} {result.unit}
                  </td>
                  <td>
                    <span
                      className={`pill ${result.interpretation === "low" || result.interpretation === "high" ? "warning" : ""}`}
                    >
                      {result.interpretation ?? "informational"}
                    </span>
                  </td>
                  <td>{formatDate(result.observedAt)}</td>
                  <td>
                    <code>{result.sourceId}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="document-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">{kindLabel(selected.kind)}</p>
                <h2 id="document-title">{selected.title}</h2>
                <p>
                  Source-linked synthetic document record. The production app would stream the
                  authorized private file after re-checking the current session and scope.
                </p>
              </div>
              <button className="icon-button" onClick={() => setSelected(null)} aria-label="Close">
                <Icon name="x" width="15" />
              </button>
            </div>
            <div className="data-list">
              <div className="data-row">
                <span>Document ID</span>
                <strong>{selected.id}</strong>
              </div>
              <div className="data-row">
                <span>Issued</span>
                <strong>{formatDate(selected.issuedAt)}</strong>
              </div>
              <div className="data-row">
                <span>Sensitivity</span>
                <strong>{selected.sensitivity}</strong>
              </div>
              <div className="data-row">
                <span>Source</span>
                <strong>{selected.sourceId}</strong>
              </div>
            </div>
            <div className="progressive-note" style={{ marginTop: 20 }}>
              <Icon name="lock" width="17" />
              <span>
                This document is not automatically exposed to environments or agents. A specific
                authorized source request is required.
              </span>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => setSelected(null)}>
                Close
              </button>
              <button
                className="button primary"
                onClick={() => alert("Synthetic file preview only in this MVP.")}
              >
                <Icon name="eye" width="14" /> Preview source
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </PortalShell>
  );
}
