"use client";

import type {
  GeneratedSession,
  GymContextProjection,
  SessionFeedback,
} from "@adaptive-world/contracts";
import { equipmentCatalog } from "@adaptive-world/demo-data";
import {
  createGymToolCatalog,
  useWebMCPTools,
  type ConfirmMutation,
  type GymToolHandlers,
  type MutationConfirmationRequest,
} from "@adaptive-world/webmcp";
import { ChevronDown, CircleAlert, CircleCheck, Code2, History, Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

const gymProfile = {
  name: "Adaptive Gym Lab",
  catalogSize: equipmentCatalog.length,
  catalogIntegrity: "Manufacturer-verified product models; synthetic facility ownership",
  walkthroughs: [
    "first_visit_foundations@1.0",
    "low_impact_orientation@1.0",
    "accessible_equipment_tour@1.0",
  ],
  accessFeatures: [
    "Documented approach and setup features",
    "Supported and seated training options",
    "Staff setup review in every first-visit template",
  ],
  constraints: [
    "Only published template IDs can create a walkthrough",
    "Every station resolves to the verified facility catalog",
    "Clinical records and identity are never requested or returned",
    "Mutations require visible human confirmation",
  ],
  syntheticFacilityInventory: true,
};

type ExecutionEvent = { tool: string; at: string };

export function WebMcpBridge() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [confirmation, setConfirmation] = useState<MutationConfirmationRequest | null>(null);
  const confirmationResolver = useRef<((approved: boolean) => void) | null>(null);
  const trace = useCallback((tool: string) => {
    setEvents((current) => [{ tool, at: new Date().toISOString() }, ...current].slice(0, 8));
  }, []);

  const handlers = useMemo<GymToolHandlers>(
    () => ({
      get_gym_profile: () => {
        trace("get_gym_profile");
        return gymProfile;
      },
      search_equipment: (input) => {
        trace("search_equipment");
        const query = input.query?.trim().toLowerCase();
        const matches = equipmentCatalog
          .filter((item) => {
            if (!item.available) return false;
            if (input.categories?.length && !input.categories.includes(item.category)) return false;
            if (input.maxWidthCm && item.dimensionsCm.width > input.maxWidthCm) return false;
            if (input.maxDepthCm && item.dimensionsCm.length > input.maxDepthCm) return false;
            if (input.accessible && item.accessibility.length === 0) return false;
            return (
              !query ||
              [item.name, item.summary, ...item.capabilities, ...item.suitabilityTags]
                .join(" ")
                .toLowerCase()
                .includes(query)
            );
          })
          .slice(0, input.limit ?? 10);
        return {
          count: matches.length,
          catalogVersion: "verified-2026-08-27",
          equipment: matches.map((item) => ({
            id: item.id,
            name: item.name,
            manufacturer: item.manufacturer,
            model: item.model,
            category: item.category,
            capabilities: item.capabilities,
            dimensionsCm: item.dimensionsCm,
            accessibility: item.accessibility,
            locationZone: item.locationZone,
            sourceUrl: item.sourceUrl,
          })),
        };
      },
      get_equipment: ({ equipmentId }) => {
        trace("get_equipment");
        const item = equipmentCatalog.find((entry) => entry.id === equipmentId);
        return item ? { equipment: item } : { error: "Equipment not found in this Gym catalog." };
      },
      get_active_context: async () => {
        trace("get_active_context");
        const response = await fetch("/api/context/current", { cache: "no-store" });
        if (!response.ok) {
          return { active: false, message: "No one-use Passport context is active." };
        }
        return (await response.json()) as { active: true; projection: GymContextProjection };
      },
      create_session_draft: async ({ templateId }) => {
        trace("create_session_draft");
        const response = await fetch("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ templateId, createdVia: "webmcp" }),
        });
        return (await response.json()) as { session?: GeneratedSession; error?: string };
      },
      record_session_feedback: async ({ sessionId, perceivedExertion, pain, notes }) => {
        trace("record_session_feedback");
        const currentResponse = await fetch("/api/session", { cache: "no-store" });
        const current = (await currentResponse.json()) as {
          session?: GeneratedSession | null;
        };
        if (!current.session || current.session.id !== sessionId) {
          return { error: "That walkthrough is not the active persisted Gym session." };
        }
        const payload: SessionFeedback = {
          sessionId,
          perceivedEffort: perceivedExertion ?? 5,
          painDuringSession: pain ?? 0,
          completedExerciseIds: current.session.exercises.map((item) => item.equipmentId),
          ...(notes ? { notes } : {}),
          submittedAt: new Date().toISOString(),
        };
        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        return (await response.json()) as unknown;
      },
    }),
    [trace],
  );

  const completeCatalog = useMemo(() => createGymToolCatalog(handlers), [handlers]);
  const routeTools = useMemo(() => {
    const allowed = pathname.startsWith("/equipment")
      ? ["get_gym_profile", "search_equipment", "get_equipment"]
      : pathname === "/passport"
        ? ["get_gym_profile", "get_active_context"]
        : pathname === "/session/feedback"
          ? ["get_active_context", "record_session_feedback"]
          : pathname === "/session"
            ? [
                "get_gym_profile",
                "search_equipment",
                "get_equipment",
                "get_active_context",
                "create_session_draft",
              ]
            : ["get_gym_profile", "search_equipment", "get_equipment"];
    return completeCatalog.filter((tool) => allowed.includes(tool.name));
  }, [completeCatalog, pathname]);

  const confirmMutation = useCallback<ConfirmMutation>((request) => {
    setConfirmation(request);
    return new Promise<boolean>((resolve) => {
      confirmationResolver.current = resolve;
    });
  }, []);
  const decide = useCallback((approved: boolean) => {
    confirmationResolver.current?.(approved);
    confirmationResolver.current = null;
    setConfirmation(null);
  }, []);
  const { status, error, toolNames } = useWebMCPTools(routeTools, {
    confirmMutation,
    maxOutputChars: 1500,
  });
  const isActive = status === "active";

  return (
    <>
      <div className={open ? "webmcp-status is-open" : "webmcp-status"}>
        <button
          className="webmcp-status__trigger"
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <span
            className={
              isActive
                ? "status-dot is-active"
                : status === "unavailable" || status === "error"
                  ? "status-dot is-unavailable"
                  : "status-dot"
            }
          />
          <span>
            <small>Current route</small>
            <strong>WebMCP {isActive ? "active" : status}</strong>
          </span>
          <ChevronDown size={15} />
        </button>
        {open ? (
          <section className="webmcp-popover" aria-label="WebMCP tool status">
            <div className="webmcp-popover__heading">
              <span>
                <Code2 size={17} /> Registered for {pathname}
              </span>
              <button onClick={() => setOpen(false)} type="button" aria-label="Close tool status">
                <X size={16} />
              </button>
            </div>
            {isActive ? (
              <div className="webmcp-banner is-active">
                <CircleCheck size={17} />
                <p>
                  <strong>Connected to document.modelContext</strong>
                  <span>{toolNames.length} route-scoped tools are registered.</span>
                </p>
              </div>
            ) : (
              <div className="webmcp-banner">
                <CircleAlert size={17} />
                <p>
                  <strong>
                    {status === "unavailable"
                      ? "WebMCP browser API unavailable"
                      : `WebMCP is ${status}`}
                  </strong>
                  <span>
                    The ordinary site still works; this is not reported as an agent execution.
                  </span>
                </p>
              </div>
            )}
            <div className="webmcp-tool-list">
              {routeTools.map((tool) => (
                <details key={tool.name}>
                  <summary>
                    <Sparkles size={13} />
                    <code>{tool.name}</code>
                    <span>{tool.annotations.readOnlyHint ? "Read" : "Confirm"}</span>
                  </summary>
                  <p>{tool.description}</p>
                </details>
              ))}
            </div>
            <div className="execution-log">
              <h3>
                <History size={14} /> Actual handler executions
              </h3>
              {events.length ? (
                events.map((event) => (
                  <p key={`${event.tool}-${event.at}`}>
                    <code>{event.tool}</code>
                    <time>{new Date(event.at).toLocaleTimeString()}</time>
                  </p>
                ))
              ) : (
                <p>No WebMCP handler has run in this browser session.</p>
              )}
            </div>
            {error ? (
              <p className="webmcp-error">
                {error instanceof Error ? error.message : "WebMCP registration failed."}
              </p>
            ) : null}
            <p className="fine-print">
              Definitions and execution history come from the exact handlers mounted on this route.
            </p>
          </section>
        ) : null}
      </div>
      {confirmation ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => decide(false)}>
          <section
            className="webmcp-confirm"
            role="alertdialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p className="eyebrow">WebMCP · Human confirmation</p>
            <h2>{confirmation.title}</h2>
            <p>{confirmation.description}</p>
            <pre>{JSON.stringify(confirmation.input, null, 2)}</pre>
            <div>
              <button className="button button--light" onClick={() => decide(false)}>
                Decline
              </button>
              <button className="button button--lime" onClick={() => decide(true)}>
                Confirm action
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
