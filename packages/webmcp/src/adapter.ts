import { limitToolOutput, toSafeWebMCPError, WebMCPToolError } from "./output";
import type {
  ModelContext,
  ModelContextTool,
  WebMCPMutationPreparation,
  WebMCPRegistration,
  WebMCPRegistrationOptions,
  WebMCPToolDefinition,
} from "./types";

// The minimum Gym-context disclosure intentionally enumerates every projected
// field (including expiry and the explicit "not shared" boundary). Keep the
// preparation bounded while allowing that complete 20-field review.
const MAX_CONFIRMATION_FIELDS = 24;

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}

function snapshotToolInput<T>(input: T): T {
  try {
    return deepFreeze(structuredClone(input));
  } catch {
    throw new WebMCPToolError("VALIDATION", "The tool input could not be safely snapshotted.");
  }
}

function combinedAbortSignal(...signals: Array<AbortSignal | undefined>): {
  readonly signal: AbortSignal;
  cleanup(): void;
} {
  const controller = new AbortController();
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  const abort = () => controller.abort();

  if (activeSignals.some((signal) => signal.aborted)) controller.abort();
  for (const signal of activeSignals) signal.addEventListener("abort", abort, { once: true });

  return {
    signal: controller.signal,
    cleanup() {
      for (const signal of activeSignals) signal.removeEventListener("abort", abort);
    },
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new WebMCPToolError("ABORTED", "The WebMCP action was cancelled.");
  }
}

function abortable<T>(value: T | PromiseLike<T>, signal: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new WebMCPToolError("ABORTED", "The WebMCP action was cancelled."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(value).then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(toSafeWebMCPError(error, signal));
      },
    );
  });
}

function validText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function normalizePreparation(value: unknown): WebMCPMutationPreparation {
  if (!value || typeof value !== "object" || !("confirmation" in value)) {
    throw new WebMCPToolError(
      "INVALID_PREPARATION",
      "The server could not prepare a safe confirmation.",
    );
  }
  const candidate = value as {
    readonly confirmation?: unknown;
    readonly quoteDigest?: unknown;
  };
  if (!candidate.confirmation || typeof candidate.confirmation !== "object") {
    throw new WebMCPToolError(
      "INVALID_PREPARATION",
      "The server could not prepare a safe confirmation.",
    );
  }
  const confirmation = candidate.confirmation as {
    readonly title?: unknown;
    readonly description?: unknown;
    readonly fields?: unknown;
    readonly riskClass?: unknown;
    readonly confirmLabel?: unknown;
    readonly cancelLabel?: unknown;
  };
  if (
    !validText(confirmation.title, 160) ||
    !validText(confirmation.description, 800) ||
    !Array.isArray(confirmation.fields) ||
    confirmation.fields.length > MAX_CONFIRMATION_FIELDS ||
    (confirmation.riskClass !== "payment" && confirmation.riskClass !== "account-write") ||
    (confirmation.confirmLabel !== undefined && !validText(confirmation.confirmLabel, 80)) ||
    (confirmation.cancelLabel !== undefined && !validText(confirmation.cancelLabel, 80)) ||
    (candidate.quoteDigest !== undefined && !validText(candidate.quoteDigest, 512))
  ) {
    throw new WebMCPToolError(
      "INVALID_PREPARATION",
      "The server could not prepare a safe confirmation.",
    );
  }
  const fields = confirmation.fields.map((field: unknown) => {
    const candidateField = field as { readonly label?: unknown; readonly value?: unknown };
    if (
      !field ||
      typeof field !== "object" ||
      !validText(candidateField.label, 80) ||
      !validText(candidateField.value, 240)
    ) {
      throw new WebMCPToolError(
        "INVALID_PREPARATION",
        "The server could not prepare a safe confirmation.",
      );
    }
    return { label: candidateField.label, value: candidateField.value };
  });

  return {
    confirmation: {
      title: confirmation.title,
      description: confirmation.description,
      fields,
      riskClass: confirmation.riskClass,
      ...(confirmation.confirmLabel ? { confirmLabel: confirmation.confirmLabel } : {}),
      ...(confirmation.cancelLabel ? { cancelLabel: confirmation.cancelLabel } : {}),
    },
    ...(candidate.quoteDigest ? { quoteDigest: candidate.quoteDigest } : {}),
  };
}

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
  lifecycleSignal: AbortSignal,
): ModelContextTool {
  return {
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputSchema: definition.inputSchema,
    annotations: definition.annotations,
    execute: async (input, executionContext = {}) => {
      // The browser caller retains its original object. Snapshot synchronously
      // before any prepare/confirmation await so the approved input is exactly
      // the value later passed to the consequential handler.
      const trustedInput = snapshotToolInput(input);
      const combined = combinedAbortSignal(lifecycleSignal, executionContext.signal);
      const {
        mutationApproval: _untrustedApproval,
        signal: _untrustedSignal,
        ...safeContext
      } = executionContext;
      void _untrustedApproval;
      void _untrustedSignal;
      try {
        throwIfAborted(combined.signal);
        let quoteDigest: string | undefined;

        if (!definition.annotations.readOnlyHint) {
          if (!options.confirmMutation) {
            throw new WebMCPToolError(
              "CONFIRMATION_REQUIRED",
              "This action requires application-owned confirmation.",
            );
          }

          let preparation: WebMCPMutationPreparation;
          if (definition.prepareMutation) {
            throwIfAborted(combined.signal);
            const prepared = definition.prepareMutation(trustedInput, {
              ...safeContext,
              signal: combined.signal,
            });
            preparation = normalizePreparation(await abortable(prepared, combined.signal));
          } else {
            preparation = {
              confirmation: {
                title: definition.title,
                description: definition.description,
                fields: [],
                riskClass: "account-write",
              },
            };
          }
          quoteDigest = preparation.quoteDigest;

          throwIfAborted(combined.signal);
          const confirmation = options.confirmMutation({
            toolName: definition.name,
            title: preparation.confirmation.title,
            description: preparation.confirmation.description,
            fields: preparation.confirmation.fields,
            riskClass: preparation.confirmation.riskClass,
            ...(preparation.confirmation.confirmLabel
              ? { confirmLabel: preparation.confirmation.confirmLabel }
              : {}),
            ...(preparation.confirmation.cancelLabel
              ? { cancelLabel: preparation.confirmation.cancelLabel }
              : {}),
            input: trustedInput,
            signal: combined.signal,
          });
          const approved = await abortable(confirmation, combined.signal);
          if (!approved) {
            throw new WebMCPToolError("MUTATION_DECLINED", "The action was declined.");
          }
        }

        throwIfAborted(combined.signal);
        const execution = definition.execute(trustedInput, {
          ...safeContext,
          signal: combined.signal,
          ...(!definition.annotations.readOnlyHint
            ? {
                mutationApproval: {
                  ...(quoteDigest ? { quoteDigest } : {}),
                },
              }
            : {}),
        });
        const result = await abortable(execution, combined.signal);
        return limitToolOutput(result, options.maxOutputChars);
      } catch (error) {
        const safeError = toSafeWebMCPError(error, combined.signal);
        if (safeError.code !== "ABORTED" && safeError.code !== "MUTATION_DECLINED") {
          options.onError?.(safeError);
        }
        throw safeError;
      } finally {
        combined.cleanup();
      }
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
      const result = await context.registerTool(
        toRegisteredTool(definition, options, controller.signal),
        {
          signal: controller.signal,
        },
      );

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
      const safeError = toSafeWebMCPError(error, controller.signal);
      controller.abort();
      for (const cleanup of cleanups.splice(0)) cleanup();
      options.onError?.(safeError);
      throw safeError;
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
