"use client";

import {
  createDoctorToolCatalog,
  createPassportToolCatalog,
  useWebMCPTools,
  WebMCPToolError,
  type ConfirmMutation,
  type CreateContextGrantInput,
  type DoctorToolHandlers,
  type MutationConfirmationRequest,
  type PassportToolHandlers,
  type WebMCPAvailability,
  type WebMCPExecutionContext,
  type WebMCPToolDefinition,
} from "@adaptive-world/webmcp";
import {
  AccessGrantSchema,
  DigitalPassportSchema,
  type AccessGrant,
  type DigitalPassport,
  type PassportScope,
} from "@adaptive-world/contracts";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";
import { readPassportApiResponse } from "./api-client";
import {
  ContextGrantToolInputSchema,
  PreparedGymContextGrantResponseSchema,
  contextGrantConfirmationFields,
  type ContextGrantToolInput,
  type PreparedGymContextGrant,
} from "./context-grant-contract";
import type { GymHandoff, PortalBootstrap } from "./session";
import {
  createMutationConfirmationGate,
  type MutationConfirmationGate,
} from "./mutation-confirmation";
import { callPassportWebMcp } from "./webmcp-client";

export type PortalRole = "owner" | "doctor";
export type ToastState = { message: string; tone?: "success" | "neutral" } | null;
export type ToolEvent = { name: string; at: string; source: "webmcp-handler" };

type PreparedContextGrantMutation = Readonly<{
  expiresAt: string;
  input: ContextGrantToolInput;
  preparationToken: string;
}>;

function sameContextGrantInput(
  prepared: ContextGrantToolInput,
  requested: CreateContextGrantInput,
): boolean {
  const expiresInMinutes = requested.expiresInMinutes ?? 5;
  return (
    prepared.recipient === requested.recipient &&
    prepared.goal === requested.goal.trim() &&
    prepared.expiresInMinutes === expiresInMinutes &&
    prepared.scopes.length === requested.scopes.length &&
    prepared.scopes.every((scope) => requested.scopes.includes(scope))
  );
}

type PortalContextValue = {
  role: PortalRole;
  actor: PortalBootstrap["actor"];
  passports: PortalBootstrap["passports"];
  patient: DigitalPassport | null;
  grants: readonly AccessGrant[];
  gymHandoffs: readonly GymHandoff[];
  prepareGymContextGrant: (
    goal: string,
    expiresInMinutes: number,
    signal?: AbortSignal,
  ) => Promise<PreparedGymContextGrant>;
  createDoctorAccessGrant: (scopes: PassportScope[], days: number) => Promise<void>;
  createGymContextGrant: (
    goal: string,
    expiresInMinutes: number,
    signal: AbortSignal | undefined,
    preparationToken: string,
  ) => Promise<{
    audience: "adaptive-gym";
    scopes: readonly ["gym.context.read", "gym.feedback.write"];
    expiresAt: string;
  }>;
  revokeGrant: (id: string) => Promise<void>;
  revokeGymHandoff: (id: string) => Promise<void>;
  toast: ToastState;
  notify: (message: string) => void;
  webmcp: { status: WebMCPAvailability; error: unknown; toolNames: readonly string[] };
  toolCatalog: readonly WebMCPToolDefinition[];
  toolEvents: readonly ToolEvent[];
  auditEvents: PortalBootstrap["auditEvents"];
  guidance: PortalBootstrap["guidance"];
  savedRoutines: PortalBootstrap["savedRoutines"];
  demoResetEnabled: boolean;
};

const PortalContext = createContext<PortalContextValue | null>(null);

const DoctorGrantResponseSchema = z.object({ grant: AccessGrantSchema }).strict();
const GymContextResponseSchema = z
  .object({
    exchangeUrl: z.string().url().max(2_048),
    expiresAt: z.string().datetime(),
    audience: z.literal("adaptive-gym"),
    scopes: z.tuple([z.literal("gym.context.read"), z.literal("gym.feedback.write")]),
  })
  .strict();
const RevokeGrantResponseSchema = z
  .object({ revoked: z.literal(true), grantId: z.string().min(1).max(128) })
  .strict();
const RevokeGymHandoffResponseSchema = RevokeGrantResponseSchema.extend({
  sessionCancelled: z.boolean(),
}).strict();
const GuidanceResponseSchema = z
  .object({
    saved: z.literal(true),
    guidanceId: z.string().min(1).max(128),
    expiresAt: z.string().datetime(),
  })
  .strict();
export function PortalProvider({
  bootstrap,
  children,
}: {
  bootstrap: PortalBootstrap;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const role = bootstrap.actor.role;
  const passports = bootstrap.passports;
  const ownerPassport =
    role === "owner" ? DigitalPassportSchema.safeParse(passports[0]) : undefined;
  const patient = ownerPassport?.success ? ownerPassport.data : null;
  if (role === "owner" && !ownerPassport?.success) {
    throw new Error("No Passport is linked to this owner account.");
  }

  const [grants, setGrants] = useState<AccessGrant[]>(bootstrap.grants);
  const [gymHandoffs, setGymHandoffs] = useState<GymHandoff[]>(bootstrap.gymHandoffs);
  const [toast, setToast] = useState<ToastState>(null);
  const [confirmation, setConfirmation] = useState<MutationConfirmationRequest | null>(null);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const confirmationGate = useRef<MutationConfirmationGate | null>(null);
  if (!confirmationGate.current) {
    confirmationGate.current = createMutationConfirmationGate(setConfirmation);
  }
  const preparedContextGrants = useRef(new Map<string, PreparedContextGrantMutation>());

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => () => confirmationGate.current?.dispose(), []);

  const notify = useCallback((message: string) => setToast({ message, tone: "success" }), []);
  const trace = useCallback((name: string) => {
    setToolEvents((current) =>
      [{ name, at: new Date().toISOString(), source: "webmcp-handler" as const }, ...current].slice(
        0,
        8,
      ),
    );
  }, []);

  const createDoctorAccessGrant = useCallback(
    async (scopes: PassportScope[], days: number) => {
      const response = await fetch("/api/access-grants", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ scopes, days }),
      });
      const result = await readPassportApiResponse(
        response,
        DoctorGrantResponseSchema,
        "The permission could not be created.",
      );
      setGrants((current) => [result.grant, ...current]);
      notify("Doctor access granted and persisted");
    },
    [notify],
  );

  const prepareGymContextGrant = useCallback(
    async (goal: string, expiresInMinutes: number, signal?: AbortSignal) => {
      const input = ContextGrantToolInputSchema.parse({
        recipient: "adaptive-gym",
        scopes: ["gym.context.read", "gym.feedback.write"],
        goal,
        expiresInMinutes,
      });
      const response = await callPassportWebMcp({ tool: "prepare_context_grant", input }, signal);
      const prepared = PreparedGymContextGrantResponseSchema.safeParse(response);
      if (!prepared.success) {
        throw new WebMCPToolError(
          "UNAVAILABLE",
          "The Passport returned an invalid Gym projection preparation.",
        );
      }
      return prepared.data;
    },
    [],
  );

  const createGymContextGrant = useCallback(
    async (
      goal: string,
      expiresInMinutes: number,
      signal: AbortSignal | undefined,
      preparationToken: string,
    ) => {
      const response = await fetch("/api/context-grants", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          goal,
          expiresInMinutes,
          preparationToken,
        }),
        signal,
      });
      const result = await readPassportApiResponse(
        response,
        GymContextResponseSchema,
        "The one-use Gym context could not be created.",
      );
      notify("One-use Gym context approved. Continuing to Adaptive Gym…");
      // Publish the WebMCP result before cross-app navigation tears down this
      // route-scoped tool. The one-use code stays out of the tool result.
      window.setTimeout(() => window.location.assign(result.exchangeUrl), 0);
      return {
        audience: result.audience,
        scopes: result.scopes,
        expiresAt: result.expiresAt,
      };
    },
    [notify],
  );

  const revokeGrant = useCallback(
    async (id: string, signal?: AbortSignal) => {
      const response = await fetch(`/api/access-grants/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { accept: "application/json" },
        signal,
      });
      await readPassportApiResponse(
        response,
        RevokeGrantResponseSchema,
        "The permission could not be revoked.",
      );
      setGrants((current) =>
        current.map((grant) =>
          grant.id === id
            ? { ...grant, status: "revoked", revokedAt: new Date().toISOString() }
            : grant,
        ),
      );
      notify("Access revoked in Neon");
    },
    [notify],
  );

  const revokeGymHandoff = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/context-grants/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { accept: "application/json" },
      });
      const result = await readPassportApiResponse(
        response,
        RevokeGymHandoffResponseSchema,
        "The Gym handoff could not be revoked.",
      );
      setGymHandoffs((current) =>
        current.map((handoff) =>
          handoff.id === id
            ? { ...handoff, status: "revoked", revokedAt: new Date().toISOString() }
            : handoff,
        ),
      );
      notify(
        result.sessionCancelled
          ? "Gym handoff revoked and its active session cancelled"
          : "Gym handoff revoked",
      );
    },
    [notify],
  );

  const passportHandlers = useMemo<PassportToolHandlers>(
    () => ({
      get_my_passport_summary: (args, context) => {
        trace("get_my_passport_summary");
        return callPassportWebMcp(
          {
            tool: "get_my_passport_summary",
            input: { sections: args.sections ? [...args.sections] : undefined },
          },
          context.signal,
        );
      },
      list_my_shares: (args, context) => {
        trace("list_my_shares");
        return callPassportWebMcp(
          { tool: "list_my_shares", input: { status: args.status ?? "active" } },
          context.signal,
        );
      },
      create_context_grant: async (args, context) => {
        const digest = context.mutationApproval?.quoteDigest;
        const prepared = digest ? preparedContextGrants.current.get(digest) : undefined;
        if (!digest || !prepared || !sameContextGrantInput(prepared.input, args)) {
          throw new WebMCPToolError(
            "CONFLICT",
            "The approved Gym projection is no longer available. Review it again.",
          );
        }
        preparedContextGrants.current.delete(digest);
        trace("create_context_grant");
        const result = await createGymContextGrant(
          prepared.input.goal,
          prepared.input.expiresInMinutes,
          context.signal,
          prepared.preparationToken,
        );
        return {
          created: true,
          recipient: result.audience,
          scopes: result.scopes,
          expiresAt: result.expiresAt,
          requestedRoutineGoal: prepared.input.goal,
          containsClinicalRecords: false,
          handoffStarted: true,
        };
      },
      revoke_access_grant: async ({ grantId }, context) => {
        trace("revoke_access_grant");
        await revokeGrant(grantId, context.signal);
        return { revoked: true, grantId };
      },
    }),
    [createGymContextGrant, revokeGrant, trace],
  );

  const doctorHandlers = useMemo<DoctorToolHandlers>(
    () => ({
      search_my_patients: ({ query = "", limit = 10 }, context) => {
        trace("search_my_patients");
        return callPassportWebMcp(
          { tool: "search_my_patients", input: { query, limit } },
          context.signal,
        );
      },
      get_patient_overview: ({ patientId }, context) => {
        trace("get_patient_overview");
        return callPassportWebMcp(
          { tool: "get_patient_overview", input: { patientId } },
          context.signal,
        );
      },
      get_patient_section: ({ patientId, section }, context) => {
        trace("get_patient_section");
        return callPassportWebMcp(
          { tool: "get_patient_section", input: { patientId, section } },
          context.signal,
        );
      },
      open_patient_source: ({ patientId, sourceId }, context) => {
        trace("open_patient_source");
        return callPassportWebMcp(
          { tool: "open_patient_source", input: { patientId, sourceId } },
          context.signal,
        );
      },
      add_clinical_guidance: async ({ patientId, guidance, expiresAt }, context) => {
        trace("add_clinical_guidance");
        const response = await fetch("/api/guidance", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ patientId, guidance, expiresAt }),
          signal: context.signal,
        });
        const result = await readPassportApiResponse(
          response,
          GuidanceResponseSchema,
          "Guidance was not authorized or could not be saved.",
        );
        notify("Clinical guidance persisted to the authorized audit timeline");
        return { saved: true, patientId, expiresAt: result.expiresAt };
      },
    }),
    [notify, trace],
  );

  const completeToolCatalog = useMemo(() => {
    if (role === "doctor") return createDoctorToolCatalog(doctorHandlers);
    return createPassportToolCatalog(passportHandlers).map((tool) =>
      tool.name === "create_context_grant"
        ? {
            ...tool,
            prepareMutation: async (
              input: Record<string, unknown>,
              context: WebMCPExecutionContext,
            ) => {
              const parsed = ContextGrantToolInputSchema.safeParse(input);
              if (!parsed.success) {
                throw new WebMCPToolError("VALIDATION", "The Gym context request was invalid.");
              }
              const response = await callPassportWebMcp(
                { tool: "prepare_context_grant", input: parsed.data },
                context.signal,
              );
              const prepared = PreparedGymContextGrantResponseSchema.safeParse(response);
              if (!prepared.success) {
                throw new WebMCPToolError(
                  "UNAVAILABLE",
                  "The Passport returned an invalid Gym projection preparation.",
                );
              }
              for (const [digest, current] of preparedContextGrants.current) {
                if (Date.parse(current.expiresAt) <= Date.now()) {
                  preparedContextGrants.current.delete(digest);
                }
              }
              if (preparedContextGrants.current.size >= 20) {
                const oldest = preparedContextGrants.current.keys().next().value;
                if (oldest) preparedContextGrants.current.delete(oldest);
              }
              preparedContextGrants.current.set(prepared.data.quoteDigest, {
                expiresAt: prepared.data.projection.expiresAt,
                input: parsed.data,
                preparationToken: prepared.data.preparationToken,
              });
              return {
                confirmation: {
                  title: "Share minimum context with Adaptive Gym",
                  description:
                    "Create one short-lived, one-use handoff containing exactly the server-prepared Gym projection shown below.",
                  fields: contextGrantConfirmationFields(prepared.data),
                  riskClass: "account-write" as const,
                  confirmLabel: "Share with Gym",
                  cancelLabel: "Cancel",
                },
                quoteDigest: prepared.data.quoteDigest,
              };
            },
          }
        : tool,
    );
  }, [doctorHandlers, passportHandlers, role]);

  const toolCatalog = useMemo(() => {
    if (pathname === "/tools" || role === "doctor") return completeToolCatalog;
    const allowed =
      pathname === "/sharing"
        ? ["list_my_shares", "create_context_grant", "revoke_access_grant"]
        : pathname === "/"
          ? ["get_my_passport_summary", "list_my_shares"]
          : pathname === "/documents"
            ? ["get_my_passport_summary"]
            : [];
    return completeToolCatalog.filter((tool) => allowed.includes(tool.name));
  }, [completeToolCatalog, pathname, role]);

  const confirmMutation = useCallback<ConfirmMutation>((request) => {
    return confirmationGate.current?.confirm(request) ?? false;
  }, []);

  const decideMutation = useCallback((approved: boolean) => {
    confirmationGate.current?.decide(approved);
  }, []);

  const toolsEnabled =
    role === "owner"
      ? !pathname.startsWith("/doctor")
      : pathname === "/doctor" || pathname === "/tools";
  const webmcp = useWebMCPTools(toolCatalog, {
    enabled: toolsEnabled,
    confirmMutation,
    maxOutputChars: 1500,
  });

  const value = useMemo<PortalContextValue>(
    () => ({
      role,
      actor: bootstrap.actor,
      passports,
      patient,
      grants,
      gymHandoffs,
      prepareGymContextGrant,
      createDoctorAccessGrant,
      createGymContextGrant,
      revokeGrant,
      revokeGymHandoff,
      toast,
      notify,
      webmcp,
      toolCatalog,
      toolEvents,
      auditEvents: bootstrap.auditEvents,
      guidance: bootstrap.guidance,
      savedRoutines: bootstrap.savedRoutines,
      demoResetEnabled: bootstrap.demoResetEnabled,
    }),
    [
      bootstrap.actor,
      bootstrap.auditEvents,
      bootstrap.demoResetEnabled,
      bootstrap.guidance,
      bootstrap.savedRoutines,
      createDoctorAccessGrant,
      createGymContextGrant,
      grants,
      gymHandoffs,
      notify,
      passports,
      patient,
      prepareGymContextGrant,
      revokeGrant,
      revokeGymHandoff,
      role,
      toast,
      toolCatalog,
      toolEvents,
      webmcp,
    ],
  );

  return (
    <PortalContext.Provider value={value}>
      {children}
      {confirmation ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => decideMutation(false)}
        >
          <section
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="webmcp-confirm-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">WebMCP · Human confirmation</p>
                <h2 id="webmcp-confirm-title">{confirmation.title}</h2>
                <p>{confirmation.description}</p>
              </div>
            </div>
            {confirmation.fields.length ? (
              <div className="data-list">
                {confirmation.fields.map((field) => (
                  <div className="data-row" key={field.label}>
                    <span>{field.label}</span>
                    <strong>{field.value}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <div className="progressive-note">
                <strong>Review exact input</strong>
                <span>{JSON.stringify(confirmation.input, null, 2)}</span>
              </div>
            )}
            <div className="modal-actions">
              <button className="button" onClick={() => decideMutation(false)}>
                {confirmation.cancelLabel ?? "Decline"}
              </button>
              <button className="button primary" onClick={() => decideMutation(true)}>
                {confirmation.confirmLabel ?? "Confirm action"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </PortalContext.Provider>
  );
}

export function usePortal() {
  const value = useContext(PortalContext);
  if (!value) throw new Error("usePortal must be used inside PortalProvider.");
  return value;
}
