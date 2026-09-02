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

export interface AgentGeneratedRoutineInput {
  readonly title: string;
  readonly durationMinutes: number;
  readonly exercises: readonly {
    readonly equipmentId: string;
    readonly durationMinutes: number;
    readonly intensity: "easy" | "moderate";
    readonly instructions: readonly string[];
    readonly adaptationReason: string;
  }[];
  readonly warmup?: readonly string[];
  readonly cooldown?: readonly string[];
  readonly safetyNotes: readonly string[];
  readonly requiresExpertReview: boolean;
  readonly expertReviewReason?: string;
}

export interface CreatePersonalizedRoutineInput {
  readonly goal: string;
  readonly paymentMode?: "human_checkout" | "agent_wallet";
  readonly routine: AgentGeneratedRoutineInput;
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
  readonly get_routine_pro_status: CatalogHandler<EmptyInput>;
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
              description: "Maximum available operating width in centimeters.",
              minimum: 1,
              maximum: 10_000,
            },
            maxDepthCm: {
              type: "number",
              description: "Maximum available operating depth in centimeters.",
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
              default: 2,
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
          "Explain the free-versus-paid boundary and return the exact server-authoritative Adaptive Routine Pro offer for the active minimum Passport context. Passport connection, context review, Gym profile, and equipment discovery are free; only personalized routine validation, payment, and Passport saving require Routine Pro. Use this after inspecting the active context and relevant equipment, and before personalized routine submission.",
        inputSchema: EMPTY_OBJECT_SCHEMA,
        readOnly: true,
      },
      handlers.get_routine_pro_offer,
    ),
    makeTool<EmptyInput>(
      {
        name: "get_routine_pro_status",
        title: "Get Routine Pro payment and save status",
        description:
          "Read the latest Routine Pro order for the active Gym session, including fulfilled orders, so a timed-out paid mutation can be recovered without submitting another payment. Returns only safe payment, entitlement, and saved-routine provenance fields.",
        inputSchema: EMPTY_OBJECT_SCHEMA,
        readOnly: true,
        untrustedOutput: true,
      },
      handlers.get_routine_pro_status,
    ),
    makeTool<CreatePersonalizedRoutineInput>(
      {
        name: "create_personalized_routine",
        title: "Validate, purchase, and save an agent-generated routine",
        description:
          "Submit the exact structured routine generated by the calling agent. Before calling, the agent must inspect get_active_context, inspect relevant current Gym equipment, generate a new routine from the user's request plus only that approved Passport projection and verified Gym inventory, never invent equipment or manufacturer facts, preserve uncertainty around injuries or medical clearance, and obtain exact user confirmation for this routine, payer, $4.99 test USD sandbox payment, and Passport save. Adaptive Gym validates and hydrates the routine; the Gym does not generate it.",
        inputSchema: {
          type: "object",
          properties: {
            goal: {
              type: "string",
              description: "The exact natural-language goal shown to the user during confirmation.",
              minLength: 2,
              maxLength: 160,
            },
            paymentMode: {
              type: "string",
              description:
                "Optional sandbox payer. Omit it to use the demo agent wallet when available; every paid path requires exact first-party confirmation.",
              enum: ["human_checkout", "agent_wallet"],
            },
            routine: {
              type: "object",
              description:
                "A new routine generated by the calling agent from the approved projection and verified inventory. Supply equipment IDs only; Adaptive Gym hydrates canonical equipment facts.",
              properties: {
                title: { type: "string", minLength: 2, maxLength: 120 },
                durationMinutes: { type: "integer", minimum: 10, maximum: 120 },
                exercises: {
                  type: "array",
                  minItems: 1,
                  maxItems: 12,
                  items: {
                    type: "object",
                    properties: {
                      equipmentId: { type: "string", minLength: 1, maxLength: 128 },
                      durationMinutes: { type: "integer", minimum: 1, maximum: 45 },
                      intensity: { type: "string", enum: ["easy", "moderate"] },
                      instructions: {
                        type: "array",
                        minItems: 1,
                        maxItems: 4,
                        items: { type: "string", minLength: 2, maxLength: 220 },
                      },
                      adaptationReason: { type: "string", minLength: 3, maxLength: 240 },
                    },
                    required: [
                      "equipmentId",
                      "durationMinutes",
                      "intensity",
                      "instructions",
                      "adaptationReason",
                    ],
                    additionalProperties: false,
                  },
                },
                warmup: {
                  type: "array",
                  maxItems: 6,
                  items: { type: "string", minLength: 2, maxLength: 200 },
                },
                cooldown: {
                  type: "array",
                  maxItems: 6,
                  items: { type: "string", minLength: 2, maxLength: 200 },
                },
                safetyNotes: {
                  type: "array",
                  maxItems: 8,
                  items: { type: "string", minLength: 2, maxLength: 200 },
                },
                requiresExpertReview: { type: "boolean" },
                expertReviewReason: { type: "string", minLength: 3, maxLength: 240 },
              },
              required: [
                "title",
                "durationMinutes",
                "exercises",
                "safetyNotes",
                "requiresExpertReview",
              ],
              additionalProperties: false,
            },
          },
          required: ["goal", "routine"],
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
