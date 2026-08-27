"use client";

import type { GeneratedSession, SessionFeedback } from "@adaptive-world/contracts";
import { demoGymProfiles, equipmentCatalog } from "@adaptive-world/demo-data";
import {
  createGymToolCatalog,
  useGymWebMCPTools,
  type GymToolHandlers,
  type MutationConfirmationRequest,
} from "@adaptive-world/webmcp";
import { ChevronDown, CircleAlert, CircleCheck, Code2, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";

const gymProfile = {
  name: "Adaptive Gym",
  catalogSize: 68,
  zones: [
    "Cardio",
    "Guided Strength",
    "Plate Loaded",
    "Free Weights",
    "Functional",
    "Mind & Body",
    "Adaptive Training",
  ],
  services: [
    "Catalog-grounded session drafts",
    "Adaptive equipment matching",
    "Post-session feedback",
  ],
  accessFeatures: [
    "Documented equipment approach paths",
    "Supported and seated training options",
    "Staff setup available for adaptive equipment",
  ],
  constraints: [
    "Session drafts use only available catalog records",
    "Clinical records are never requested or returned",
    "Mutations require visible human confirmation",
  ],
  syntheticDemo: true,
};

export function WebMcpBridge() {
  const [open, setOpen] = useState(false);
  const handlers = useMemo<GymToolHandlers>(
    () => ({
      get_gym_profile: () => gymProfile,
      search_equipment: (input) => {
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
          equipment: matches.map((item) => ({
            id: item.id,
            name: item.name,
            category: item.category,
            capabilities: item.capabilities,
            dimensionsCm: item.dimensionsCm,
            accessibility: item.accessibility,
            locationZone: item.locationZone,
          })),
        };
      },
      get_equipment: ({ equipmentId }) => {
        const item = equipmentCatalog.find((entry) => entry.id === equipmentId);
        return item ? { equipment: item } : { error: "Equipment not found in this gym catalog." };
      },
      get_active_context: () => {
        const projectionId = window.localStorage.getItem("adaptive-gym-context");
        if (!projectionId)
          return {
            active: false,
            message:
              "No Gym projection is active. The person must connect one in Passport context.",
          };
        const projection = demoGymProfiles.find((entry) => entry.projectionId === projectionId);
        return projection
          ? { active: true, projection }
          : { active: false, message: "The locally selected projection is no longer available." };
      },
      create_session_draft: async ({ goal, durationMinutes, equipmentIds }) => {
        const projectionId = window.localStorage.getItem("adaptive-gym-context");
        const profile = demoGymProfiles.find((entry) => entry.projectionId === projectionId);
        if (!profile)
          return { error: "No active Gym context. Connect a minimum Passport projection first." };
        const response = await fetch("/api/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile,
            goal,
            durationMinutes: durationMinutes ?? profile.preferredSessionMinutes,
            equipmentIds: equipmentIds ?? [],
          }),
        });
        const data = (await response.json()) as { session?: GeneratedSession; error?: string };
        if (data.session)
          window.sessionStorage.setItem("adaptive-gym-last-session", JSON.stringify(data.session));
        return data;
      },
      record_session_feedback: async ({ sessionId, perceivedExertion, pain, notes }) => {
        const raw = window.sessionStorage.getItem("adaptive-gym-last-session");
        const stored = raw ? (JSON.parse(raw) as GeneratedSession) : null;
        if (!stored || stored.id !== sessionId)
          return { error: "That session is not the current reviewable session in this browser." };
        const payload: SessionFeedback = {
          sessionId,
          perceivedEffort: perceivedExertion ?? 5,
          painDuringSession: pain ?? 0,
          completedExerciseIds: stored.exercises.map((exercise) => exercise.equipmentId),
          ...(notes ? { notes } : {}),
          submittedAt: new Date().toISOString(),
        };
        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data: unknown = await response.json();
        return data;
      },
    }),
    [],
  );

  const confirmMutation = useMemo(
    () => (request: MutationConfirmationRequest) =>
      Promise.resolve(
        window.confirm(
          `${request.title}\n\n${request.description}\n\nReview and allow this action?`,
        ),
      ),
    [],
  );
  const { status, error, toolNames } = useGymWebMCPTools({
    handlers,
    confirmMutation,
    maxOutputChars: 1500,
  });
  const tools = useMemo(() => createGymToolCatalog(handlers), [handlers]);
  const isActive = status === "active";

  return (
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
          <small>Site tools</small>
          <strong>
            WebMCP {isActive ? "active" : status === "unavailable" ? "unavailable" : status}
          </strong>
        </span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <section className="webmcp-popover" aria-label="WebMCP tool status">
          <div className="webmcp-popover__heading">
            <span>
              <Code2 size={17} /> Registered page tools
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
                <span>{toolNames.length} tools are registered from this page.</span>
              </p>
            </div>
          ) : (
            <div className="webmcp-banner">
              <CircleAlert size={17} />
              <p>
                <strong>
                  {status === "unavailable"
                    ? "document.modelContext is not available"
                    : `WebMCP is ${status}`}
                </strong>
                <span>
                  {status === "unavailable"
                    ? "The normal interface still works, but no Site/WebMCP tools are exposed to this conversation."
                    : "Tool registration is not active yet."}
                </span>
              </p>
            </div>
          )}
          <div className="webmcp-tool-list">
            {tools.map((tool) => (
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
          {error ? (
            <p className="webmcp-error">
              {error instanceof Error ? error.message : "WebMCP registration failed."}
            </p>
          ) : null}
          <p className="fine-print">
            This list comes from the exact definitions used for registration. No tool is inferred
            from the interface.
          </p>
        </section>
      )}
    </div>
  );
}
