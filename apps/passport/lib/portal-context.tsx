"use client";

import {
  createDoctorToolCatalog,
  createPassportToolCatalog,
  useWebMCPTools,
  type ConfirmMutation,
  type DoctorToolHandlers,
  type MutationConfirmationRequest,
  type PassportToolHandlers,
  type WebMCPAvailability,
  type WebMCPToolDefinition,
} from "@adaptive-world/webmcp";
import type { AccessGrant, DigitalPassport, PassportScope } from "@adaptive-world/contracts";
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
import type { PortalBootstrap } from "./session";

export type PortalRole = "owner" | "doctor";
export type ToastState = { message: string; tone?: "success" | "neutral" } | null;
export type ToolEvent = { name: string; at: string; source: "webmcp-handler" };

type PortalContextValue = {
  role: PortalRole;
  actor: PortalBootstrap["actor"];
  passports: readonly DigitalPassport[];
  patient: DigitalPassport;
  grants: readonly AccessGrant[];
  createGrant: (
    recipient: "doctor" | "gym",
    scopes: PassportScope[],
    days: number,
  ) => Promise<void>;
  revokeGrant: (id: string) => Promise<void>;
  toast: ToastState;
  notify: (message: string) => void;
  webmcp: { status: WebMCPAvailability; error: unknown; toolNames: readonly string[] };
  toolCatalog: readonly WebMCPToolDefinition[];
  toolEvents: readonly ToolEvent[];
  auditEvents: PortalBootstrap["auditEvents"];
  guidance: PortalBootstrap["guidance"];
};

const PortalContext = createContext<PortalContextValue | null>(null);

function ageFrom(dateOfBirth: string) {
  return Math.floor((Date.now() - new Date(dateOfBirth).getTime()) / 31_557_600_000);
}

function concisePassport(passport: DigitalPassport) {
  return {
    id: passport.id,
    profile: {
      displayName: passport.identity.displayName,
      age: ageFrom(passport.identity.dateOfBirth),
      heightCm: passport.heightCm,
      weightKg: passport.weightKg,
    },
    health: {
      conditions: passport.conditions.map(({ label, status }) => ({ label, status })),
      notableResults: passport.notableResults.map(({ label, value, unit, interpretation }) => ({
        label,
        value,
        unit,
        interpretation,
      })),
    },
    mobility: {
      considerations: passport.functional.movementConsiderations,
      accessibilityNeeds: passport.functional.accessibilityNeeds,
      stopSignals: passport.functional.stopSignals,
    },
    goals: passport.functional.goals,
    updatedAt: passport.updatedAt,
    synthetic: true,
  };
}

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
  const patient = passports[0];
  if (!patient) throw new Error("No authorized Passport is available for this account.");

  const [grants, setGrants] = useState<AccessGrant[]>(bootstrap.grants);
  const [toast, setToast] = useState<ToastState>(null);
  const [confirmation, setConfirmation] = useState<MutationConfirmationRequest | null>(null);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const confirmationResolver = useRef<((approved: boolean) => void) | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const notify = useCallback((message: string) => setToast({ message, tone: "success" }), []);
  const trace = useCallback((name: string) => {
    setToolEvents((current) =>
      [{ name, at: new Date().toISOString(), source: "webmcp-handler" as const }, ...current].slice(
        0,
        8,
      ),
    );
  }, []);

  const createGrant = useCallback(
    async (recipient: "doctor" | "gym", scopes: PassportScope[], days: number) => {
      const response = await fetch(
        recipient === "gym" ? "/api/context-grants" : "/api/access-grants",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scopes, days, expiresInMinutes: 5 }),
        },
      );
      const result = (await response.json()) as {
        grant?: AccessGrant;
        exchangeUrl?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "The permission could not be created.");
      if (result.grant) setGrants((current) => [result.grant as AccessGrant, ...current]);
      if (result.exchangeUrl) {
        notify("One-use Gym context approved. Continuing to Adaptive Gym…");
        window.location.assign(result.exchangeUrl);
        return;
      }
      notify("Doctor access granted and persisted");
    },
    [notify],
  );

  const revokeGrant = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/access-grants/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("The permission could not be revoked.");
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

  const getAuthorizedPatient = useCallback(
    (patientId: string, requiredScope: PassportScope = "passport.summary.read") => {
      const authorized = grants.some(
        (grant) =>
          grant.passportId === patientId &&
          grant.granteeType === "clinician" &&
          grant.status === "active" &&
          grant.scopes.includes(requiredScope) &&
          new Date(grant.expiresAt) > new Date(),
      );
      if (!authorized) throw new Error(`Missing active ${requiredScope} scope for this patient.`);
      const requested = passports.find((item) => item.id === patientId);
      if (!requested) throw new Error("Patient is outside this doctor's My Patients list.");
      return requested;
    },
    [grants, passports],
  );

  const passportHandlers = useMemo<PassportToolHandlers>(
    () => ({
      get_my_passport_summary: (args) => {
        trace("get_my_passport_summary");
        const summary = concisePassport(patient);
        if (!args.sections?.length) return summary;
        return Object.fromEntries(
          args.sections.map((section) => [section, summary[section as keyof typeof summary]]),
        );
      },
      list_my_shares: (args) => {
        trace("list_my_shares");
        const status = args.status ?? "active";
        return grants.filter(
          (grant) =>
            grant.passportId === patient.id && (status === "all" || grant.status === status),
        );
      },
      create_context_grant: async (args) => {
        trace("create_context_grant");
        await createGrant("gym", ["gym.context.read"], 1);
        return {
          created: true,
          recipient: args.recipient,
          scopes: args.scopes,
          exchangeExpiresInMinutes: Math.min(args.expiresInMinutes ?? 5, 15),
          containsClinicalRecords: false,
          handoffStarted: true,
        };
      },
      revoke_access_grant: async ({ grantId }) => {
        trace("revoke_access_grant");
        const ownGrant = grants.find(
          (grant) =>
            grant.id === grantId && grant.passportId === patient.id && grant.status === "active",
        );
        if (!ownGrant) throw new Error("Active grant not found for this Passport owner.");
        await revokeGrant(grantId);
        return { revoked: true, grantId };
      },
    }),
    [createGrant, grants, patient, revokeGrant, trace],
  );

  const doctorHandlers = useMemo<DoctorToolHandlers>(
    () => ({
      search_my_patients: ({ query = "", limit = 10 }) => {
        trace("search_my_patients");
        const normalized = query.toLowerCase();
        return passports
          .filter((item) => item.identity.displayName.toLowerCase().includes(normalized))
          .slice(0, limit)
          .map((item) => ({
            id: item.id,
            displayName: item.identity.displayName,
            updatedAt: item.updatedAt,
          }));
      },
      get_patient_overview: ({ patientId }) => {
        trace("get_patient_overview");
        return concisePassport(getAuthorizedPatient(patientId));
      },
      get_patient_section: ({ patientId, section }) => {
        trace("get_patient_section");
        const scope =
          section === "documents"
            ? "passport.documents.read"
            : section === "summary" || section === "mobility"
              ? "passport.summary.read"
              : "passport.clinical.read";
        const requested = getAuthorizedPatient(patientId, scope);
        const sections = {
          summary: concisePassport(requested),
          medications: requested.medications,
          allergies: requested.allergies,
          labs: requested.notableResults,
          mobility: requested.functional,
          documents: requested.documents.map(({ id, title, kind, issuedAt, sourceId }) => ({
            id,
            title,
            kind,
            issuedAt,
            sourceId,
          })),
        };
        return { patientId: requested.id, section, data: sections[section] };
      },
      get_patient_changes: ({ patientId, since }) => {
        trace("get_patient_changes");
        const requested = getAuthorizedPatient(patientId);
        return {
          patientId: requested.id,
          since,
          hasChanges: new Date(requested.updatedAt) > new Date(since),
          updatedAt: requested.updatedAt,
          changedSections: ["summary", "labs"],
        };
      },
      open_patient_source: ({ patientId, sourceId }) => {
        trace("open_patient_source");
        const requested = getAuthorizedPatient(patientId, "passport.documents.read");
        const source = requested.sources.find((item) => item.id === sourceId);
        if (!source) throw new Error("Source not found within the authorized Passport.");
        return source;
      },
      add_clinical_guidance: async ({ patientId, guidance, expiresAt }) => {
        trace("add_clinical_guidance");
        getAuthorizedPatient(patientId, "passport.guidance.write");
        const response = await fetch("/api/guidance", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ patientId, guidance, expiresAt }),
        });
        if (!response.ok) throw new Error("Guidance was not authorized or could not be saved.");
        notify("Clinical guidance persisted to the authorized audit timeline");
        return { saved: true, patientId, expiresAt: expiresAt ?? null };
      },
    }),
    [getAuthorizedPatient, notify, passports, trace],
  );

  const completeToolCatalog = useMemo(
    () =>
      role === "owner"
        ? createPassportToolCatalog(passportHandlers)
        : createDoctorToolCatalog(doctorHandlers),
    [doctorHandlers, passportHandlers, role],
  );

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
    setConfirmation(request);
    return new Promise<boolean>((resolve) => {
      confirmationResolver.current = resolve;
    });
  }, []);

  const decideMutation = useCallback((approved: boolean) => {
    confirmationResolver.current?.(approved);
    confirmationResolver.current = null;
    setConfirmation(null);
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
      createGrant,
      revokeGrant,
      toast,
      notify,
      webmcp,
      toolCatalog,
      toolEvents,
      auditEvents: bootstrap.auditEvents,
      guidance: bootstrap.guidance,
    }),
    [
      bootstrap.actor,
      bootstrap.auditEvents,
      bootstrap.guidance,
      createGrant,
      grants,
      notify,
      passports,
      patient,
      revokeGrant,
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
            <div className="progressive-note">
              <strong>Review exact input</strong>
              <span>{JSON.stringify(confirmation.input, null, 2)}</span>
            </div>
            <div className="modal-actions">
              <button className="button" onClick={() => decideMutation(false)}>
                Decline
              </button>
              <button className="button primary" onClick={() => decideMutation(true)}>
                Confirm action
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
