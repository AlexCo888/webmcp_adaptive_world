import { limitToolOutput } from "./output";
import type {
  ModelContext,
  ModelContextTool,
  WebMCPRegistration,
  WebMCPRegistrationOptions,
  WebMCPToolDefinition,
} from "./types";

const CONFIRMATION_REQUIRED = "WEBMCP_MUTATION_CONFIRMATION_REQUIRED";
const MUTATION_DECLINED = "WEBMCP_MUTATION_DECLINED";

/** Resolve the current API first, with navigator support for early prototypes only. */
export function getModelContext(): ModelContext | null {
  if (typeof document !== "undefined") {
    const currentDocument = document as Document & { readonly modelContext?: ModelContext };
    if (currentDocument.modelContext) return currentDocument.modelContext;
  }
  if (typeof navigator !== "undefined") {
    const currentNavigator = navigator as Navigator & { readonly modelContext?: ModelContext };
    if (currentNavigator.modelContext) return currentNavigator.modelContext;
  }
  return null;
}

function toRegisteredTool(
  definition: WebMCPToolDefinition,
  options: WebMCPRegistrationOptions,
): ModelContextTool {
  return {
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputSchema: definition.inputSchema,
    annotations: definition.annotations,
    execute: async (input, executionContext = {}) => {
      if (!definition.annotations.readOnlyHint) {
        if (!options.confirmMutation) {
          throw new Error(CONFIRMATION_REQUIRED);
        }

        const approved = await options.confirmMutation({
          toolName: definition.name,
          title: definition.title,
          description: definition.description,
          input,
        });
        if (!approved) throw new Error(MUTATION_DECLINED);
      }

      const result = await definition.execute(input, executionContext);
      return limitToolOutput(result, options.maxOutputChars);
    },
  };
}

/**
 * Register a route-appropriate set of tools. Returns null during SSR or in browsers
 * without WebMCP; the application's regular UI remains fully functional.
 */
export function registerWebMcpTools(
  definitions: readonly WebMCPToolDefinition[],
  options: WebMCPRegistrationOptions = {},
): WebMCPRegistration | null {
  const context = options.modelContext === undefined ? getModelContext() : options.modelContext;
  if (!context) return null;

  const controller = new AbortController();
  const cleanups: Array<() => void> = [];
  let unregistered = false;

  const ready = Promise.all(
    definitions.map(async (definition) => {
      const result = await context.registerTool(toRegisteredTool(definition, options), {
        signal: controller.signal,
      });

      let returnedCleanup: (() => void) | undefined;
      if (typeof result === "function") {
        returnedCleanup = result as () => void;
      } else if (
        typeof result === "object" &&
        result !== null &&
        "unregister" in result &&
        typeof result.unregister === "function"
      ) {
        returnedCleanup = () => (result.unregister as () => void)();
      }

      // A component can unmount before an asynchronous implementation resolves.
      if (unregistered) {
        returnedCleanup?.();
        if (!returnedCleanup && context.unregisterTool) {
          await context.unregisterTool(definition.name);
        }
      } else if (returnedCleanup) {
        cleanups.push(returnedCleanup);
      }
    }),
  )
    .then(() => undefined)
    .catch((error: unknown) => {
      controller.abort();
      for (const cleanup of cleanups.splice(0)) cleanup();
      options.onError?.(error);
      throw error;
    });

  const unregister = () => {
    if (unregistered) return;
    unregistered = true;
    controller.abort();
    for (const cleanup of cleanups.splice(0)) cleanup();

    // Compatibility for implementations predating AbortSignal registration.
    if (context.unregisterTool) {
      for (const definition of definitions) {
        void context.unregisterTool(definition.name);
      }
    }
  };

  return {
    toolNames: definitions.map(({ name }) => name),
    signal: controller.signal,
    ready,
    unregister,
  };
}

export const registerWebMCPTools = registerWebMcpTools;

export function unregisterWebMcpTools(registration: WebMCPRegistration | null | undefined): void {
  registration?.unregister();
}

export const unregisterWebMCPTools = unregisterWebMcpTools;
