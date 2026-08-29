import type {
  JsonSchema,
  WebMCPExecutionContext,
  WebMCPMutationPreparer,
  WebMCPToolDefinition,
  WebMCPToolHandler,
} from "../types";

export type CatalogHandler<TInput extends object> = (
  input: TInput,
  context: WebMCPExecutionContext,
) => unknown;

export interface PreparedCatalogHandler<TInput extends object> {
  readonly prepare: WebMCPMutationPreparer<TInput>;
  readonly execute: CatalogHandler<TInput>;
}

export const EMPTY_OBJECT_SCHEMA = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const satisfies JsonSchema;

interface ToolMetadata {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly readOnly: boolean;
  readonly untrustedOutput?: boolean;
}

export function makeTool<TInput extends object>(
  metadata: ToolMetadata,
  handler: CatalogHandler<TInput>,
  prepareMutation?: WebMCPMutationPreparer<TInput>,
): WebMCPToolDefinition {
  return {
    name: metadata.name,
    title: metadata.title,
    description: metadata.description,
    inputSchema: metadata.inputSchema,
    annotations: {
      readOnlyHint: metadata.readOnly,
      untrustedContentHint: metadata.untrustedOutput ?? false,
    },
    ...(prepareMutation
      ? {
          prepareMutation: prepareMutation as unknown as WebMCPMutationPreparer,
        }
      : {}),
    execute: handler as unknown as WebMCPToolHandler,
  };
}
