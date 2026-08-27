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
import { demoAccessGrants, demoPassports } from "@adaptive-world/demo-data";
import type { AccessGrant, DigitalPassport, PassportScope } from "@adaptive-world/contracts";
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

export type PortalRole = "owner" | "doctor";
export type ToastState = { message: string; tone?: "success" | "neutral" } | null;

type PortalContextValue = {
  role: PortalRole;
  setRole: (role: PortalRole) => void;
  passports: readonly DigitalPassport[];
  patient: DigitalPassport;
  patientId: string;
  setPatientId: (id: string) => void;
  grants: readonly AccessGrant[];
  createGrant: (recipient: "doctor" | "gym", scopes: PassportScope[], days: number) => void;
  revokeGrant: (id: string) => void;
  toast: ToastState;
  notify: (message: string) => void;
  webmcp: { status: WebMCPAvailability; error: unknown; toolNames: readonly string[] };
  toolCatalog: readonly WebMCPToolDefinition[];
};

const PortalContext = createContext<PortalContextValue | null>(null);
const STORAGE_KEY = "adaptive-world-demo-grants-v1";

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

export function PortalProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<PortalRole>("owner");
  const [patientId, setPatientId] = useState(demoPassports[0]?.id ?? "");
  const [grants, setGrants] = useState<AccessGrant[]>([...demoAccessGrants]);
  const [toast, setToast] = useState<ToastState>(null);
  const [confirmation, setConfirmation] = useState<MutationConfirmationRequest | null>(null);
  const confirmationResolver = useRef<((approved: boolean) => void) | null>(null);
  const hydrated = useRef(false);

  const patient = demoPassports.find((item) => item.id === patientId) ?? demoPassports[0];
  if (!patient) throw new Error("The demo Passport dataset is empty.");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setGrants(JSON.parse(stored) as AccessGrant[]);
    } catch {
      // A blocked localStorage must not prevent the demo from working.
    } finally {
      hydrated.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(grants));
    } catch {
      // Keep in-memory state when browser storage is unavailable.
    }
  }, [grants]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const notify = useCallback((message: string) => setToast({ message, tone: "success" }), []);

  const createGrant = useCallback(
    (recipient: "doctor" | "gym", scopes: PassportScope[], days: number) => {
      const now = new Date();
      const grant: AccessGrant = {
        id: `grant_${crypto.randomUUID()}`,
        passportId: patient.id,
        granteeId: recipient === "doctor" ? "doctor_elena_vargas" : "adaptive_gym",
        granteeType: recipient === "doctor" ? "clinician" : "application",
        scopes,
        status: "active",
        purpose:
          recipient === "doctor"
            ? "Authorized care coordination and clinical review"
            : "One-time Adaptive Gym context projection",
        issuedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + days * 86_400_000).toISOString(),
      };
      setGrants((current) => [grant, ...current]);
      notify(recipient === "doctor" ? "Doctor access granted" : "Gym context grant created");
    },
    [notify, patient.id],
  );

  const revokeGrant = useCallback(
    (id: string) => {
      setGrants((current) =>
        current.map((grant) =>
          grant.id === id
            ? { ...grant, status: "revoked", revokedAt: new Date().toISOString() }
            : grant,
        ),
      );
      notify("Access revoked immediately");
    },
    [notify],
  );

  const passportHandlers = useMemo<PassportToolHandlers>(
    () => ({
      get_my_passport_summary: (args) => {
        const summary = concisePassport(patient);
        if (!args.sections?.length) return summary;
        return Object.fromEntries(
          args.sections.map((section) => [section, summary[section as keyof typeof summary]]),
        );
      },
      list_my_shares: (args) => {
        const status = args.status ?? "active";
        return grants.filter(
          (grant) =>
            grant.passportId === patient.id && (status === "all" || grant.status === status),
        );
      },
      create_context_grant: (args) => {
        createGrant(
          "gym",
          ["gym.context.read"],
          Math.max(1, Math.ceil((args.expiresInMinutes ?? 5) / 1440)),
        );
        return {
          created: true,
          recipient: args.recipient,
          scopes: args.scopes,
          exchangeExpiresInMinutes: args.expiresInMinutes ?? 5,
          containsClinicalRecords: false,
        };
      },
      revoke_access_grant: ({ grantId }) => {
        const ownGrant = grants.find(
          (grant) =>
            grant.id === grantId && grant.passportId === patient.id && grant.status === "active",
        );
        if (!ownGrant) throw new Error("Active grant not found for the signed-in Passport owner.");
        revokeGrant(grantId);
        return { revoked: true, grantId };
      },
    }),
    [createGrant, grants, patient, revokeGrant],
  );

  const doctorHandlers = useMemo<DoctorToolHandlers>(
    () => ({
      search_my_patients: ({ query = "", limit = 10 }) => {
        const normalized = query.toLowerCase();
        return demoPassports
          .filter((item) =>
            grants.some(
              (grant) =>
                grant.passportId === item.id &&
                grant.granteeType === "clinician" &&
                grant.status === "active",
            ),
          )
          .filter(
            (item) =>
              item.identity.displayName.toLowerCase().includes(normalized) ||
              item.id.toLowerCase().includes(normalized),
          )
          .slice(0, limit)
          .map((item) => ({
            id: item.id,
            displayName: item.identity.displayName,
            updatedAt: item.updatedAt,
          }));
      },
      get_patient_overview: ({ patientId: requestedId }) => {
        const requested = getAuthorizedPatient(requestedId, grants);
        return concisePassport(requested);
      },
      get_patient_section: ({ patientId: requestedId, section }) => {
        const requested = getAuthorizedPatient(requestedId, grants);
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
      get_patient_changes: ({ patientId: requestedId, since }) => {
        const requested = getAuthorizedPatient(requestedId, grants);
        return {
          patientId: requested.id,
          since,
          hasChanges: new Date(requested.updatedAt) > new Date(since),
          updatedAt: requested.updatedAt,
          changedSections: ["summary", "labs"],
        };
      },
      open_patient_source: ({ patientId: requestedId, sourceId }) => {
        const requested = getAuthorizedPatient(requestedId, grants);
        const source = requested.sources.find((item) => item.id === sourceId);
        if (!source) throw new Error("Source not found within the authorized Passport.");
        return source;
      },
      add_clinical_guidance: ({ patientId: requestedId, guidance, expiresAt }) => {
        getAuthorizedPatient(requestedId, grants);
        notify("Clinical guidance added to the demo timeline");
        return { saved: true, patientId: requestedId, guidance, expiresAt: expiresAt ?? null };
      },
    }),
    [grants, notify],
  );

  const toolCatalog = useMemo(
    () =>
      role === "owner"
        ? createPassportToolCatalog(passportHandlers)
        : createDoctorToolCatalog(doctorHandlers),
    [doctorHandlers, passportHandlers, role],
  );

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

  const webmcp = useWebMCPTools(toolCatalog, {
    confirmMutation,
    maxOutputChars: 1500,
  });

  const value = useMemo<PortalContextValue>(
    () => ({
      role,
      setRole,
      passports: demoPassports,
      patient,
      patientId,
      setPatientId,
      grants,
      createGrant,
      revokeGrant,
      toast,
      notify,
      webmcp,
      toolCatalog,
    }),
    [
      createGrant,
      grants,
      notify,
      patient,
      patientId,
      revokeGrant,
      role,
      toast,
      toolCatalog,
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

function getAuthorizedPatient(patientId: string, grants: readonly AccessGrant[]) {
  const authorized = grants.some(
    (grant) =>
      grant.passportId === patientId &&
      grant.granteeType === "clinician" &&
      grant.status === "active" &&
      new Date(grant.expiresAt) > new Date(),
  );
  if (!authorized) throw new Error("Patient is outside My Patients or the grant has expired.");
  const patient = demoPassports.find((item) => item.id === patientId);
  if (!patient) throw new Error("Patient not found.");
  return patient;
}

export function usePortal() {
  const value = useContext(PortalContext);
  if (!value) throw new Error("usePortal must be used inside PortalProvider.");
  return value;
}
