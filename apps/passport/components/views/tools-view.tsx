"use client";

import { Icon } from "@/components/icon";
import { PageHeading, PortalShell } from "@/components/shell";
import { usePortal } from "@/lib/portal-context";

export function ToolsView() {
  const { role, toolCatalog, webmcp, toolEvents } = usePortal();
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
    </PortalShell>
  );
}
