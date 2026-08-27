"use client";

import { useMemo } from "react";

import { useWebMCPTools } from "../hooks";
import type { UseWebMCPOptions, UseWebMCPResult, WebMCPToolDefinition } from "../types";
import { makeTool, type CatalogHandler } from "./shared";

export interface GetMyPassportSummaryInput {
  readonly sections?: readonly ("profile" | "health" | "mobility" | "goals")[];
}

export interface ListMySharesInput {
  readonly status?: "active" | "expired" | "revoked" | "all";
}

export interface CreateContextGrantInput {
  readonly recipient: "adaptive-gym";
  readonly scopes: readonly "gym.context.read"[];
  readonly expiresInMinutes?: number;
}

export interface RevokeAccessGrantInput {
  readonly grantId: string;
}

export interface PassportToolHandlers {
  readonly get_my_passport_summary: CatalogHandler<GetMyPassportSummaryInput>;
  readonly list_my_shares: CatalogHandler<ListMySharesInput>;
  readonly create_context_grant: CatalogHandler<CreateContextGrantInput>;
  readonly revoke_access_grant: CatalogHandler<RevokeAccessGrantInput>;
}

export function createPassportToolCatalog(
  handlers: PassportToolHandlers,
): readonly WebMCPToolDefinition[] {
  return [
    makeTool<GetMyPassportSummaryInput>(
      {
        name: "get_my_passport_summary",
        title: "Get my Passport summary",
        description:
          "Return the signed-in person's concise Passport summary for selected sections.",
        inputSchema: {
          type: "object",
          properties: {
            sections: {
              type: "array",
              description: "Optional summary sections.",
              items: { type: "string", enum: ["profile", "health", "mobility", "goals"] },
              uniqueItems: true,
              maxItems: 4,
            },
          },
          additionalProperties: false,
        },
        readOnly: true,
        untrustedOutput: true,
      },
      handlers.get_my_passport_summary,
    ),
    makeTool<ListMySharesInput>(
      {
        name: "list_my_shares",
        title: "List my sharing grants",
        description: "List the signed-in person's sharing grants and their current status.",
        inputSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              description: "Filter grants by status.",
              enum: ["active", "expired", "revoked", "all"],
              default: "active",
            },
          },
          additionalProperties: false,
        },
        readOnly: true,
      },
      handlers.list_my_shares,
    ),
    makeTool<CreateContextGrantInput>(
      {
        name: "create_context_grant",
        title: "Share context with Gym",
        description:
          "Prepare a short-lived, one-use grant containing only approved Adaptive Gym context.",
        inputSchema: {
          type: "object",
          properties: {
            recipient: {
              type: "string",
              description: "Service receiving the minimum projection.",
              enum: ["adaptive-gym"],
            },
            scopes: {
              type: "array",
              description: "Gym scopes the person explicitly approves.",
              items: {
                type: "string",
                enum: ["gym.context.read"],
              },
              minItems: 1,
              maxItems: 1,
              uniqueItems: true,
            },
            expiresInMinutes: {
              type: "integer",
              description: "Minutes before the one-use code expires.",
              minimum: 1,
              maximum: 15,
              default: 5,
            },
          },
          required: ["recipient", "scopes"],
          additionalProperties: false,
        },
        readOnly: false,
      },
      handlers.create_context_grant,
    ),
    makeTool<RevokeAccessGrantInput>(
      {
        name: "revoke_access_grant",
        title: "Revoke a sharing grant",
        description: "Revoke one of the signed-in person's active sharing grants.",
        inputSchema: {
          type: "object",
          properties: {
            grantId: {
              type: "string",
              description: "Grant identifier shown in the sharing list.",
              minLength: 1,
              maxLength: 128,
            },
          },
          required: ["grantId"],
          additionalProperties: false,
        },
        readOnly: false,
      },
      handlers.revoke_access_grant,
    ),
  ];
}

export interface UsePassportWebMCPOptions extends UseWebMCPOptions {
  readonly handlers: PassportToolHandlers;
}

export function usePassportWebMCPTools(options: UsePassportWebMCPOptions): UseWebMCPResult {
  const { handlers, ...registrationOptions } = options;
  const tools = useMemo(() => createPassportToolCatalog(handlers), [handlers]);
  return useWebMCPTools(tools, registrationOptions);
}
