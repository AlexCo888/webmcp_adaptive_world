import type {
  JsonSchema,
  WebMCPExecutionContext,
  WebMCPToolDefinition,
  WebMCPToolHandler,
} from "../types";

export type CatalogHandler<TInput extends object> = (
  input: TInput,
  context: WebMCPExecutionContext,
) => unknown;

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
    execute: handler as unknown as WebMCPToolHandler,
  };
}
