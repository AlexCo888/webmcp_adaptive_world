import type { Page } from "@playwright/test";

export interface ShimToolSnapshot {
  id: number;
  name: string;
  title?: string;
  description: string;
  inputSchema: unknown;
  annotations?: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
  registrationSignal: boolean;
}

export interface ShimInvocationSnapshot {
  id: number;
  tool: string;
  input: unknown;
  output?: unknown;
  error?: string;
}

export interface ModelContextShimSnapshot {
  activeTools: ShimToolSnapshot[];
  registrations: ShimToolSnapshot[];
  invocations: ShimInvocationSnapshot[];
  unregistrations: Array<{ id: number; name: string }>;
}

interface TestShimApi {
  invoke(name: string, input: Record<string, unknown>): Promise<unknown>;
  snapshot(): ModelContextShimSnapshot;
}

type ShimWindow = Window & { __adaptiveWorldWebMcpTest?: TestShimApi };

/**
 * Installs a deterministic implementation before application code runs. It
 * exercises registration and invocation mechanics only; it is not a model or
 * a native-browser WebMCP evaluation.
 */
export async function installModelContextShim(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Tool = {
      name: string;
      title?: string;
      description: string;
      inputSchema: unknown;
      annotations?: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute(input: Record<string, unknown>, context?: { signal?: AbortSignal }): unknown;
    };

    type ActiveRegistration = { id: number; tool: Tool; registrationSignal: boolean };

    const clone = <T>(value: T): T => {
      if (value === undefined) return value;
      return JSON.parse(JSON.stringify(value)) as T;
    };

    const active = new Map<string, ActiveRegistration>();
    const registrations: Array<{
      id: number;
      name: string;
      title?: string;
      description: string;
      inputSchema: unknown;
      annotations?: { readOnlyHint: boolean; untrustedContentHint: boolean };
      registrationSignal: boolean;
    }> = [];
    const invocations: Array<{
      id: number;
      tool: string;
      input: unknown;
      output?: unknown;
      error?: string;
    }> = [];
    const unregistrations: Array<{ id: number; name: string }> = [];
    let nextRegistrationId = 1;
    let nextInvocationId = 1;

    const modelContext = {
      registerTool(tool: Tool, options: { signal?: AbortSignal } = {}) {
        const id = nextRegistrationId++;
        const registrationSignal = options.signal instanceof AbortSignal;
        const snapshot = {
          id,
          name: tool.name,
          ...(tool.title ? { title: tool.title } : {}),
          description: tool.description,
          inputSchema: clone(tool.inputSchema),
          ...(tool.annotations ? { annotations: clone(tool.annotations) } : {}),
          registrationSignal,
        };
        registrations.push(snapshot);
        active.set(tool.name, { id, tool, registrationSignal });

        let closed = false;
        const unregister = () => {
          if (closed) return;
          closed = true;
          if (active.get(tool.name)?.id === id) active.delete(tool.name);
          unregistrations.push({ id, name: tool.name });
        };
        options.signal?.addEventListener("abort", unregister, { once: true });
        return { unregister };
      },
      unregisterTool(name: string) {
        const registration = active.get(name);
        if (!registration) return;
        active.delete(name);
        unregistrations.push({ id: registration.id, name });
      },
    };

    const api = {
      async invoke(name: string, input: Record<string, unknown>) {
        const registration = active.get(name);
        if (!registration) throw new Error(`WEBMCP_TEST_TOOL_NOT_REGISTERED:${name}`);

        const invocation = {
          id: nextInvocationId++,
          tool: name,
          input: clone(input),
        } as {
          id: number;
          tool: string;
          input: unknown;
          output?: unknown;
          error?: string;
        };
        invocations.push(invocation);
        const controller = new AbortController();
        try {
          const output = await registration.tool.execute(input, { signal: controller.signal });
          invocation.output = clone(output);
          return output;
        } catch (error: unknown) {
          invocation.error = error instanceof Error ? error.message : String(error);
          throw error;
        }
      },
      snapshot() {
        return {
          activeTools: [...active.values()].map(({ id, tool, registrationSignal }) => ({
            id,
            name: tool.name,
            ...(tool.title ? { title: tool.title } : {}),
            description: tool.description,
            inputSchema: clone(tool.inputSchema),
            ...(tool.annotations ? { annotations: clone(tool.annotations) } : {}),
            registrationSignal,
          })),
          registrations: clone(registrations),
          invocations: clone(invocations),
          unregistrations: clone(unregistrations),
        };
      },
    };

    Object.defineProperty(document, "modelContext", {
      configurable: true,
      enumerable: false,
      value: modelContext,
    });
    Object.defineProperty(window, "__adaptiveWorldWebMcpTest", {
      configurable: true,
      enumerable: false,
      value: api,
    });
  });
}

export async function modelContextSnapshot(page: Page): Promise<ModelContextShimSnapshot> {
  return page.evaluate(() => {
    const api = (window as ShimWindow).__adaptiveWorldWebMcpTest;
    if (!api) throw new Error("WEBMCP_TEST_SHIM_NOT_INSTALLED");
    return api.snapshot();
  });
}

export async function invokeModelContextTool(
  page: Page,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  return page.evaluate(
    async ({ toolName, toolInput }) => {
      const api = (window as ShimWindow).__adaptiveWorldWebMcpTest;
      if (!api) throw new Error("WEBMCP_TEST_SHIM_NOT_INSTALLED");
      return api.invoke(toolName, toolInput);
    },
    { toolName: name, toolInput: input },
  );
}

export async function activeModelContextToolNames(page: Page): Promise<string[]> {
  const snapshot = await modelContextSnapshot(page);
  return snapshot.activeTools.map(({ name }) => name).sort();
}
