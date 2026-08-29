"use client";

import { useState } from "react";
import { z } from "zod";
import { Icon } from "@/components/icon";
import { PageHeading, PortalShell } from "@/components/shell";
import { readPassportApiResponse } from "@/lib/api-client";
import { usePortal } from "@/lib/portal-context";

const DemoResetResponseSchema = z
  .object({
    restored: z.literal(true),
    restoredRelationships: z.number().int().nonnegative(),
    removedSavedRoutines: z.number().int().nonnegative(),
    removedGymSessions: z.number().int().nonnegative(),
    removedContextGrants: z.number().int().nonnegative(),
    revokedEntitlements: z.number().int().nonnegative(),
  })
  .strict();

export function ToolsView() {
  const { role, toolCatalog, webmcp, toolEvents, demoResetEnabled } = usePortal();
  const [showReset, setShowReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const active = webmcp.status === "active";
  const label = active
    ? "Active"
    : webmcp.status === "registering"
      ? "Registering"
      : webmcp.status === "error"
        ? "Error"
        : "Unavailable";
  return (
    <PortalShell view="tools" title="WebMCP tools">
      <PageHeading
        eyebrow="Live capability inspector"
        title="WebMCP tool registry"
        description="Definitions below come from the same catalog this page attempts to register. Registration status reflects the actual browser API—never a simulation."
        selector={false}
      />
      <div className="dashboard-grid">
        <section className="card">
          <div className="card-header">
            <div>
              <h2>{role === "doctor" ? "Doctor portal" : "Passport owner"} tools</h2>
              <p className="card-subtitle">
                Role-scoped definitions currently mounted by this page
              </p>
            </div>
            <span className={`pill ${active ? "" : "warning"}`}>
              <span className={`status-dot ${active ? "live" : ""}`} style={{ marginRight: 6 }} />
              {label}
            </span>
          </div>
          <div className="scope-list">
            {toolCatalog.map((tool) => {
              const fields = Object.keys(tool.inputSchema.properties ?? {});
              return (
                <article
                  className="scope"
                  key={tool.name}
                  style={{ alignItems: "flex-start", padding: 16 }}
                >
                  <div className="scope-main" style={{ alignItems: "flex-start" }}>
                    <div className="scope-icon">
                      <Icon name={tool.annotations.readOnlyHint ? "eye" : "settings"} width="15" />
                    </div>
                    <div>
                      <strong style={{ fontFamily: "monospace", fontSize: 12 }}>{tool.name}</strong>
                      <small style={{ display: "block", marginTop: 5, lineHeight: 1.5 }}>
                        {tool.description}
                      </small>
                      {fields.length ? (
                        <div className="scope-tags" style={{ marginTop: 9 }}>
                          {fields.map((field) => (
                            <span className="scope-tag" key={field}>
                              {field}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="scope-tags" style={{ marginTop: 9 }}>
                          <span className="scope-tag">no arguments</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 5, justifyItems: "end" }}>
                    <span className={`pill ${active ? "" : "neutral"}`}>
                      {active ? "Registered" : "Defined only"}
                    </span>
                    <span className={`pill ${tool.annotations.readOnlyHint ? "blue" : "warning"}`}>
                      {tool.annotations.readOnlyHint ? "Read only" : "Confirmation"}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        <aside className="stack">
          <section className="card" style={{ background: active ? "#eaf3e8" : "#fff4df" }}>
            <div className="insight" style={{ padding: 0 }}>
              <div className={`insight-icon ${active ? "" : "amber"}`}>
                <Icon name={active ? "check" : "alert"} width="17" />
              </div>
              <div>
                <h3>{active ? "WebMCP is active" : "WebMCP API unavailable"}</h3>
                <p>
                  {active
                    ? `${webmcp.toolNames.length} tools were actually registered with the current page's model context.`
                    : "The tool definitions exist in the application, but document.modelContext / navigator.modelContext was not exposed here. No tools were registered."}
                </p>
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Registration facts</h2>
                <p className="card-subtitle">Useful when debugging the browser integration</p>
              </div>
            </div>
            <div className="data-list">
              <div className="data-row">
                <span>Current role</span>
                <strong>{role === "doctor" ? "Doctor" : "Passport owner"}</strong>
              </div>
              <div className="data-row">
                <span>Catalog size</span>
                <strong>{toolCatalog.length} definitions</strong>
              </div>
              <div className="data-row">
                <span>Registered tools</span>
                <strong>{active ? webmcp.toolNames.length : 0}</strong>
              </div>
              <div className="data-row">
                <span>Output budget</span>
                <strong>1,500 characters</strong>
              </div>
              <div className="data-row">
                <span>Mutation policy</span>
                <strong>Explicit UI confirmation</strong>
              </div>
            </div>
          </section>
          {demoResetEnabled ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <h2>Demo maintenance</h2>
                  <p className="card-subtitle">
                    Clinician demo operator: return shared synthetic accounts to canonical state
                  </p>
                </div>
              </div>
              <button className="button small" type="button" onClick={() => setShowReset(true)}>
                <Icon name="settings" width="14" /> Restore synthetic demo
              </button>
            </section>
          ) : null}
          <section className="card">
            <div className="card-header">
              <div>
                <h2>Actual handler executions</h2>
                <p className="card-subtitle">This browser session only</p>
              </div>
            </div>
            {toolEvents.length ? (
              <div className="data-list">
                {toolEvents.map((event) => (
                  <div className="data-row" key={`${event.name}-${event.at}`}>
                    <code>{event.name}</code>
                    <strong>{new Date(event.at).toLocaleTimeString()}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="card-subtitle">
                No WebMCP handler has executed. Defined or registered does not mean used.
              </p>
            )}
          </section>
          <section className="card">
            <div className="progressive-note" style={{ margin: 0 }}>
              <Icon name="shield" width="17" />
              <span>
                Tools never replace server authorization. Every handler limits data to the current
                person, relationship, and approved scope.
              </span>
            </div>
          </section>
        </aside>
      </div>
      {showReset ? (
        <div className="modal-backdrop" onMouseDown={() => !resetting && setShowReset(false)}>
          <section
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="demo-reset-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Synthetic demo maintenance</p>
                <h2 id="demo-reset-title">Restore synthetic demo</h2>
                <p>
                  This clinician-operator action restores the canonical doctor grants and guidance,
                  removes transient Gym context and routines, and returns Routine Pro to its free
                  state. Immutable payment evidence is preserved. Ambiguous payment state blocks the
                  reset.
                </p>
              </div>
            </div>
            {resetError ? (
              <p className="form-error" role="alert">
                {resetError}
              </p>
            ) : null}
            <div className="modal-actions">
              <button className="button" disabled={resetting} onClick={() => setShowReset(false)}>
                Cancel
              </button>
              <button
                className="button primary"
                disabled={resetting}
                onClick={async () => {
                  setResetting(true);
                  setResetError(null);
                  try {
                    const response = await fetch("/api/demo/reset", {
                      method: "POST",
                      headers: { "content-type": "application/json", accept: "application/json" },
                      body: "{}",
                    });
                    await readPassportApiResponse(
                      response,
                      DemoResetResponseSchema,
                      "The demo could not be restored.",
                    );
                    window.location.reload();
                  } catch (error) {
                    setResetError(
                      error instanceof Error ? error.message : "The demo could not be restored.",
                    );
                    setResetting(false);
                  }
                }}
              >
                {resetting ? "Restoring…" : "Restore demo"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </PortalShell>
  );
}
