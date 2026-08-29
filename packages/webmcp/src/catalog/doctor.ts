"use client";

import { useMemo } from "react";

import { useWebMCPTools } from "../hooks";
import type { UseWebMCPOptions, UseWebMCPResult, WebMCPToolDefinition } from "../types";
import { makeTool, type CatalogHandler } from "./shared";

export interface SearchMyPatientsInput {
  readonly query?: string;
  readonly limit?: number;
}

export interface PatientInput {
  readonly patientId: string;
}

export interface GetPatientSectionInput extends PatientInput {
  readonly section: "summary" | "medications" | "allergies" | "labs" | "mobility" | "documents";
}

export interface OpenPatientSourceInput extends PatientInput {
  readonly sourceId: string;
}

export interface AddClinicalGuidanceInput extends PatientInput {
  readonly guidance: string;
  readonly expiresAt?: string;
}

export interface DoctorToolHandlers {
  readonly search_my_patients: CatalogHandler<SearchMyPatientsInput>;
  readonly get_patient_overview: CatalogHandler<PatientInput>;
  readonly get_patient_section: CatalogHandler<GetPatientSectionInput>;
  readonly open_patient_source: CatalogHandler<OpenPatientSourceInput>;
  readonly add_clinical_guidance: CatalogHandler<AddClinicalGuidanceInput>;
}

const patientIdProperty = {
  type: "string",
  description: "Authorized patient identifier from My Patients.",
  minLength: 1,
  maxLength: 128,
} as const;

export function createDoctorToolCatalog(
  handlers: DoctorToolHandlers,
): readonly WebMCPToolDefinition[] {
  return [
    makeTool<SearchMyPatientsInput>(
      {
        name: "search_my_patients",
        title: "Search My Patients",
        description: "Search only patients who currently granted the signed-in doctor access.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Name or identifier prefix.", maxLength: 100 },
            limit: {
              type: "integer",
              description: "Maximum matches to return.",
              minimum: 1,
              maximum: 20,
              default: 10,
            },
          },
          additionalProperties: false,
        },
        readOnly: true,
      },
      handlers.search_my_patients,
    ),
    makeTool<PatientInput>(
      {
        name: "get_patient_overview",
        title: "Get patient overview",
        description:
          "Return an authorized, minimal clinical overview for one patient in My Patients.",
        inputSchema: {
          type: "object",
          properties: { patientId: patientIdProperty },
          required: ["patientId"],
          additionalProperties: false,
        },
        readOnly: true,
        untrustedOutput: true,
      },
      handlers.get_patient_overview,
    ),
    makeTool<GetPatientSectionInput>(
      {
        name: "get_patient_section",
        title: "Get a patient section",
        description: "Return one authorized Passport section, applying progressive disclosure.",
        inputSchema: {
          type: "object",
          properties: {
            patientId: patientIdProperty,
            section: {
              type: "string",
              description: "Single clinical section required for the task.",
              enum: ["summary", "medications", "allergies", "labs", "mobility", "documents"],
            },
          },
          required: ["patientId", "section"],
          additionalProperties: false,
        },
        readOnly: true,
        untrustedOutput: true,
      },
      handlers.get_patient_section,
    ),
    makeTool<OpenPatientSourceInput>(
      {
        name: "open_patient_source",
        title: "Open a patient source",
        description: "Open one authorized source referenced by a patient overview or section.",
        inputSchema: {
          type: "object",
          properties: {
            patientId: patientIdProperty,
            sourceId: {
              type: "string",
              description: "Source identifier returned by another patient tool.",
              minLength: 1,
              maxLength: 128,
            },
          },
          required: ["patientId", "sourceId"],
          additionalProperties: false,
        },
        readOnly: true,
        untrustedOutput: true,
      },
      handlers.open_patient_source,
    ),
    makeTool<AddClinicalGuidanceInput>(
      {
        name: "add_clinical_guidance",
        title: "Add clinical guidance",
        description:
          "Prepare clinical guidance for a patient; save only after the doctor confirms the exact text.",
        inputSchema: {
          type: "object",
          properties: {
            patientId: patientIdProperty,
            guidance: {
              type: "string",
              description: "Exact guidance to show in the confirmation UI.",
              minLength: 1,
              maxLength: 2_000,
            },
            expiresAt: {
              type: "string",
              format: "date-time",
              description: "Optional ISO 8601 expiry for the guidance.",
            },
          },
          required: ["patientId", "guidance"],
          additionalProperties: false,
        },
        readOnly: false,
        untrustedOutput: true,
      },
      handlers.add_clinical_guidance,
    ),
  ];
}

export interface UseDoctorWebMCPOptions extends UseWebMCPOptions {
  readonly handlers: DoctorToolHandlers;
}

export function useDoctorWebMCPTools(options: UseDoctorWebMCPOptions): UseWebMCPResult {
  const { handlers, ...registrationOptions } = options;
  const tools = useMemo(() => createDoctorToolCatalog(handlers), [handlers]);
  return useWebMCPTools(tools, registrationOptions);
}
