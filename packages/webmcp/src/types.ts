export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[];

/** JSON Schema subset accepted by the current WebMCP imperative API. */
export interface JsonSchema {
  readonly type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  readonly title?: string;
  readonly description?: string;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean | JsonSchema;
  readonly items?: JsonSchema;
  readonly enum?: readonly JsonPrimitive[];
  readonly const?: JsonPrimitive;
  readonly format?: string;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly uniqueItems?: boolean;
  readonly default?: JsonValue;
  readonly oneOf?: readonly JsonSchema[];
  readonly anyOf?: readonly JsonSchema[];
}

export interface WebMCPToolAnnotations {
  /** True only when executing the tool cannot change application or server state. */
  readonly readOnlyHint: boolean;
  /** True when the output can contain uploads, UGC, or externally sourced content. */
  readonly untrustedContentHint: boolean;
}

export interface WebMCPExecutionContext {
  readonly signal?: AbortSignal;
  readonly [key: string]: unknown;
}

export type WebMCPToolHandler<
  TInput extends object = Record<string, unknown>,
  TResult = unknown,
> = (input: TInput, context: WebMCPExecutionContext) => TResult;

export interface WebMCPToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly annotations: WebMCPToolAnnotations;
  readonly execute: WebMCPToolHandler;
}

export interface ModelContextRegistrationOptions {
  readonly signal?: AbortSignal;
  readonly exposedTo?: readonly string[];
}

export interface ModelContextTool {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly annotations?: WebMCPToolAnnotations;
  readonly execute: (input: Record<string, unknown>, context?: WebMCPExecutionContext) => unknown;
}

export interface ModelContext {
  registerTool(tool: ModelContextTool, options?: ModelContextRegistrationOptions): unknown;
  /** Legacy escape hatch. Current Chrome lifecycle uses AbortSignal instead. */
  unregisterTool?(name: string): unknown;
}

export type WebMCPAvailability = "disabled" | "unavailable" | "registering" | "active" | "error";

export interface MutationConfirmationRequest {
  readonly toolName: string;
  readonly title: string;
  readonly description: string;
  readonly input: Readonly<Record<string, unknown>>;
}

/** Must render an application-owned confirmation UI and resolve with the user's explicit choice. */
export type ConfirmMutation = (request: MutationConfirmationRequest) => boolean | Promise<boolean>;

export interface WebMCPRegistrationOptions {
  readonly modelContext?: ModelContext | null;
  readonly confirmMutation?: ConfirmMutation;
  readonly maxOutputChars?: number;
  readonly onError?: (error: unknown) => void;
}

export interface WebMCPRegistration {
  readonly toolNames: readonly string[];
  readonly signal: AbortSignal;
  readonly ready: Promise<void>;
  unregister(): void;
}

export interface UseWebMCPOptions extends WebMCPRegistrationOptions {
  readonly enabled?: boolean;
}

export interface UseWebMCPResult {
  readonly status: WebMCPAvailability;
  readonly error: unknown;
  readonly toolNames: readonly string[];
}
