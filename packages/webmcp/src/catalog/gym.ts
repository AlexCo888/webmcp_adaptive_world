"use client";

import { useMemo } from "react";

import { useWebMCPTools } from "../hooks";
import type { UseWebMCPOptions, UseWebMCPResult, WebMCPToolDefinition } from "../types";
import {
  EMPTY_OBJECT_SCHEMA,
  makeTool,
  type CatalogHandler,
  type PreparedCatalogHandler,
} from "./shared";

export type EmptyInput = Record<string, never>;

export interface SearchEquipmentInput {
  readonly query?: string;
  readonly categories?: readonly string[];
  readonly maxWidthCm?: number;
  readonly maxDepthCm?: number;
  readonly accessible?: boolean;
  readonly limit?: number;
}

export interface GetEquipmentInput {
  readonly equipmentId: string;
}

export interface CreatePersonalizedRoutineInput {
  readonly templateId:
    "first_visit_foundations" | "low_impact_orientation" | "accessible_equipment_tour";
  readonly paymentMode?: "human_checkout" | "agent_wallet";
}

export interface RecordSessionFeedbackInput {
  readonly sessionId: string;
  readonly perceivedExertion?: number;
  readonly pain?: number;
  readonly notes?: string;
}

export interface GymToolHandlers {
  readonly get_gym_profile: CatalogHandler<EmptyInput>;
  readonly search_equipment: CatalogHandler<SearchEquipmentInput>;
  readonly get_equipment: CatalogHandler<GetEquipmentInput>;
  readonly get_active_context: CatalogHandler<EmptyInput>;
  readonly get_routine_pro_offer: CatalogHandler<EmptyInput>;
  readonly create_personalized_routine: PreparedCatalogHandler<CreatePersonalizedRoutineInput>;
  readonly record_session_feedback: PreparedCatalogHandler<RecordSessionFeedbackInput>;
}

export function createGymToolCatalog(handlers: GymToolHandlers): readonly WebMCPToolDefinition[] {
  return [
    makeTool<EmptyInput>(
      {
        name: "get_gym_profile",
        title: "Get Adaptive Gym profile",
        description:
          "Return the gym's facilities, services, access features, and operating constraints.",
        inputSchema: EMPTY_OBJECT_SCHEMA,
        readOnly: true,
      },
      handlers.get_gym_profile,
    ),
    makeTool<SearchEquipmentInput>(
      {
        name: "search_equipment",
        title: "Search gym equipment",
        description:
          "Search equipment actually available at Adaptive Gym using goals, space, and access needs.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Goal, movement, or equipment keyword.",
              maxLength: 120,
            },
            categories: {
              type: "array",
              description: "Optional equipment category filters.",
              items: { type: "string", maxLength: 60 },
              uniqueItems: true,
              maxItems: 8,
            },
            maxWidthCm: {
              type: "number",
              description: "Maximum available width in centimeters.",
              minimum: 1,
              maximum: 10_000,
            },
            maxDepthCm: {
              type: "number",
              description: "Maximum available depth in centimeters.",
              minimum: 1,
              maximum: 10_000,
            },
            accessible: {
              type: "boolean",
              description: "Require equipment with documented access features.",
            },
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
        untrustedOutput: true,
      },
      handlers.search_equipment,
    ),
    makeTool<GetEquipmentInput>(
      {
        name: "get_equipment",
        title: "Get equipment details",
        description:
          "Return verified specifications and access notes for one gym equipment record.",
        inputSchema: {
          type: "object",
          properties: {
            equipmentId: {
              type: "string",
              description: "Equipment identifier returned by search_equipment.",
              minLength: 1,
              maxLength: 128,
            },
          },
          required: ["equipmentId"],
          additionalProperties: false,
        },
        readOnly: true,
        untrustedOutput: true,
      },
      handlers.get_equipment,
    ),
    makeTool<EmptyInput>(
      {
        name: "get_active_context",
        title: "Get active Gym context",
        description:
          "Return only the currently active, consented Gym projection; never return the full Passport.",
        inputSchema: EMPTY_OBJECT_SCHEMA,
        readOnly: true,
        untrustedOutput: true,
      },
      handlers.get_active_context,
    ),
    makeTool<EmptyInput>(
      {
        name: "get_routine_pro_offer",
        title: "Get Adaptive Routine Pro offer",
        description:
          "Return the exact server-authoritative Adaptive Routine Pro offer for the active minimum Passport context.",
        inputSchema: EMPTY_OBJECT_SCHEMA,
        readOnly: true,
      },
      handlers.get_routine_pro_offer,
    ),
    makeTool<CreatePersonalizedRoutineInput>(
      {
        name: "create_personalized_routine",
        title: "Create and save a personalized routine",
        description:
          "Create and save one grounded routine from a published template and the active minimum Passport context after exact confirmation.",
        inputSchema: {
          type: "object",
          properties: {
            templateId: {
              type: "string",
              description: "Published facility template identifier.",
              enum: [
                "first_visit_foundations",
                "low_impact_orientation",
                "accessible_equipment_tour",
              ],
            },
            paymentMode: {
              type: "string",
              description:
                "Required only when the server reports no active entitlement; selects the approved sandbox payer flow.",
              enum: ["human_checkout", "agent_wallet"],
            },
          },
          required: ["templateId"],
          additionalProperties: false,
        },
        readOnly: false,
        untrustedOutput: true,
      },
      handlers.create_personalized_routine.execute,
      handlers.create_personalized_routine.prepare,
    ),
    makeTool<RecordSessionFeedbackInput>(
      {
        name: "record_session_feedback",
        title: "Record session feedback",
        description:
          "Save post-session effort, pain, and notes after the person confirms the exact feedback.",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              description: "Opaque public routine reference returned by the active Gym session.",
              minLength: 1,
              maxLength: 128,
            },
            perceivedExertion: {
              type: "integer",
              description: "Perceived effort from 1 to 10.",
              minimum: 1,
              maximum: 10,
            },
            pain: {
              type: "integer",
              description: "Pain reported from 0 to 10.",
              minimum: 0,
              maximum: 10,
            },
            notes: {
              type: "string",
              description: "Optional post-session notes.",
              maxLength: 1_000,
            },
          },
          required: ["sessionId"],
          additionalProperties: false,
        },
        readOnly: false,
        untrustedOutput: true,
      },
      handlers.record_session_feedback.execute,
      handlers.record_session_feedback.prepare,
    ),
  ];
}

export interface UseGymWebMCPOptions extends UseWebMCPOptions {
  readonly handlers: GymToolHandlers;
}

export function useGymWebMCPTools(options: UseGymWebMCPOptions): UseWebMCPResult {
  const { handlers, ...registrationOptions } = options;
  const tools = useMemo(() => createGymToolCatalog(handlers), [handlers]);
  return useWebMCPTools(tools, registrationOptions);
}
