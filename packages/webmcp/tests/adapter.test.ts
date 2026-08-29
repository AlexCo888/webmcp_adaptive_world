import { describe, expect, it, vi } from "vitest";

import {
  limitToolOutput,
  registerWebMcpTools,
  type ModelContext,
  type ModelContextTool,
  type WebMCPExecutionContext,
  type WebMCPToolDefinition,
} from "../src";

function mockContext() {
  const tools = new Map<string, ModelContextTool>();
  const signals: AbortSignal[] = [];
  const context: ModelContext = {
    registerTool(tool, options) {
      tools.set(tool.name, tool);
      if (options?.signal) signals.push(options.signal);
    },
  };
  return { context, tools, signals };
}

function tool(readOnly: boolean): WebMCPToolDefinition {
  return {
    name: readOnly ? "read_tool" : "write_tool",
    title: readOnly ? "Read" : "Write",
    description: "Test tool",
    inputSchema: { type: "object", additionalProperties: false },
    annotations: { readOnlyHint: readOnly, untrustedContentHint: false },
    execute: (input) => ({ ok: true, input }),
  };
}

describe("registerWebMcpTools", () => {
  it("registers read tools and unregisters via AbortSignal", async () => {
    const { context, tools, signals } = mockContext();
    const registration = registerWebMcpTools([tool(true)], { modelContext: context });

    expect(registration).not.toBeNull();
    await registration?.ready;
    expect(tools.get("read_tool")?.annotations?.readOnlyHint).toBe(true);
    await expect(tools.get("read_tool")?.execute({ value: 1 })).resolves.toBe(
      '{"ok":true,"data":{"ok":true,"input":{"value":1}}}',
    );

    registration?.unregister();
    expect(signals[0]?.aborted).toBe(true);
  });

  it("fails closed when a mutation has no application-owned confirmation", async () => {
    const { context, tools } = mockContext();
    const registration = registerWebMcpTools([tool(false)], { modelContext: context });
    await registration?.ready;

    await expect(tools.get("write_tool")?.execute({ value: 1 })).rejects.toThrow(
      "application-owned confirmation",
    );
  });

  it("executes a mutation only after explicit confirmation", async () => {
    const { context, tools } = mockContext();
    const confirmMutation = vi.fn(() => true);
    const registration = registerWebMcpTools([tool(false)], {
      modelContext: context,
      confirmMutation,
    });
    await registration?.ready;

    await expect(tools.get("write_tool")?.execute({ value: 2 })).resolves.toContain('"ok":true');
    expect(confirmMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "write_tool",
        input: { value: 2 },
        fields: [],
        riskClass: "account-write",
      }),
    );
  });

  it("executes the immutable input snapshot that the person approved", async () => {
    const { context, tools } = mockContext();
    let approve: ((approved: boolean) => void) | undefined;
    const confirmedInputs: unknown[] = [];
    const executedInputs: unknown[] = [];
    const registration = registerWebMcpTools(
      [
        {
          ...tool(false),
          execute: (input) => {
            executedInputs.push(input);
            return { saved: true };
          },
        },
      ],
      {
        modelContext: context,
        confirmMutation: (request) => {
          confirmedInputs.push(request.input);
          return new Promise<boolean>((resolve) => {
            approve = resolve;
          });
        },
      },
    );
    await registration?.ready;

    const callerInput = { guidance: "Use the approved wording", nested: { grantId: "grant-1" } };
    const execution = tools.get("write_tool")?.execute(callerInput);
    await vi.waitFor(() => expect(approve).toBeTypeOf("function"));
    callerInput.guidance = "Mutated after the modal opened";
    callerInput.nested.grantId = "grant-2";
    approve?.(true);

    await expect(execution).resolves.toContain('"saved":true');
    expect(confirmedInputs).toEqual([
      { guidance: "Use the approved wording", nested: { grantId: "grant-1" } },
    ]);
    expect(executedInputs).toEqual(confirmedInputs);
    expect(Object.isFrozen(executedInputs[0])).toBe(true);
  });

  it("uses a server-prepared confirmation and forwards only its quote digest after approval", async () => {
    const { context, tools } = mockContext();
    const prepareMutation = vi.fn(() => ({
      confirmation: {
        title: "Create and save your personalized routine",
        description: "Review the exact sandbox purchase.",
        fields: [
          { label: "Product", value: "Adaptive Routine Pro" },
          { label: "Amount", value: "$4.99 test USD" },
        ],
        riskClass: "payment" as const,
        confirmLabel: "Approve agent payment",
      },
      quoteDigest: "quote_123",
    }));
    const execute = vi.fn(
      (_input: Record<string, unknown>, executionContext: WebMCPExecutionContext) => ({
        quoteDigest: executionContext.mutationApproval?.quoteDigest,
      }),
    );
    const preparedTool: WebMCPToolDefinition = {
      ...tool(false),
      prepareMutation,
      execute,
    };
    const confirmMutation = vi.fn(() => true);
    const registration = registerWebMcpTools([preparedTool], {
      modelContext: context,
      confirmMutation,
    });
    await registration?.ready;

    await expect(tools.get("write_tool")?.execute({ templateId: "template" })).resolves.toContain(
      '"quoteDigest":"quote_123"',
    );
    expect(prepareMutation).toHaveBeenCalledOnce();
    expect(confirmMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Create and save your personalized routine",
        fields: [
          { label: "Product", value: "Adaptive Routine Pro" },
          { label: "Amount", value: "$4.99 test USD" },
        ],
        riskClass: "payment",
        confirmLabel: "Approve agent payment",
      }),
    );
    expect((confirmMutation.mock.calls as unknown[][])[0]?.[0]).not.toHaveProperty("quoteDigest");
    expect(execute).toHaveBeenCalledWith(
      { templateId: "template" },
      expect.objectContaining({ mutationApproval: { quoteDigest: "quote_123" } }),
    );
  });

  it("accepts the complete bounded Gym-context disclosure", async () => {
    const { context, tools } = mockContext();
    const fields = Array.from({ length: 20 }, (_, index) => ({
      label: `Disclosure ${index + 1}`,
      value: `Exact value ${index + 1}`,
    }));
    const confirmMutation = vi.fn(() => true);
    const registration = registerWebMcpTools(
      [
        {
          ...tool(false),
          prepareMutation: () => ({
            confirmation: {
              title: "Share minimum context with Adaptive Gym",
              description: "Review every projected field and the explicit privacy boundary.",
              fields,
              riskClass: "account-write" as const,
            },
          }),
        },
      ],
      { modelContext: context, confirmMutation },
    );
    await registration?.ready;

    await expect(tools.get("write_tool")?.execute({})).resolves.toContain('"ok":true');
    expect(confirmMutation).toHaveBeenCalledWith(expect.objectContaining({ fields }));
  });

  it("prepares without executing when the person declines", async () => {
    const { context, tools } = mockContext();
    const prepareMutation = vi.fn(() => ({
      confirmation: {
        title: "Confirm write",
        description: "This changes account state.",
        fields: [{ label: "Effect", value: "Save routine" }],
        riskClass: "account-write" as const,
      },
    }));
    const execute = vi.fn(() => ({ saved: true }));
    const registration = registerWebMcpTools([{ ...tool(false), prepareMutation, execute }], {
      modelContext: context,
      confirmMutation: () => false,
    });
    await registration?.ready;

    await expect(tools.get("write_tool")?.execute({ value: 1 })).rejects.toThrow(
      "The action was declined.",
    );
    expect(prepareMutation).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
  });

  it("stops before execution when the browser aborts", async () => {
    const { context, tools } = mockContext();
    const execute = vi.fn(() => ({ saved: true }));
    const registration = registerWebMcpTools([{ ...tool(false), execute }], {
      modelContext: context,
      confirmMutation: () => true,
    });
    await registration?.ready;
    const controller = new AbortController();
    controller.abort();

    await expect(
      tools.get("write_tool")?.execute({ value: 1 }, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("cancels a pending confirmation without executing the write", async () => {
    const { context, tools } = mockContext();
    const execute = vi.fn(() => ({ saved: true }));
    const registration = registerWebMcpTools([{ ...tool(false), execute }], {
      modelContext: context,
      confirmMutation: () => new Promise<boolean>(() => undefined),
    });
    await registration?.ready;
    const controller = new AbortController();
    const execution = tools.get("write_tool")?.execute({ value: 1 }, { signal: controller.signal });
    controller.abort();

    await expect(execution).rejects.toMatchObject({ code: "ABORTED" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("fails closed on malformed server preparation", async () => {
    const { context, tools } = mockContext();
    const confirmMutation = vi.fn(() => true);
    const execute = vi.fn(() => ({ saved: true }));
    const registration = registerWebMcpTools(
      [
        {
          ...tool(false),
          prepareMutation: () => ({
            confirmation: {
              title: "Incomplete",
              description: "Missing exact fields and risk class.",
              fields: [],
              riskClass: "payment",
            },
            quoteDigest: "",
          }),
          execute,
        },
      ],
      { modelContext: context, confirmMutation },
    );
    await registration?.ready;

    await expect(tools.get("write_tool")?.execute({ value: 1 })).rejects.toMatchObject({
      code: "INVALID_PREPARATION",
    });
    expect(confirmMutation).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("redacts raw handler failures", async () => {
    const { context, tools } = mockContext();
    const registration = registerWebMcpTools(
      [
        {
          ...tool(true),
          execute: () => {
            throw new Error("DATABASE_URL=do-not-expose");
          },
        },
      ],
      { modelContext: context },
    );
    await registration?.ready;

    const execution = tools.get("read_tool")?.execute({});
    await expect(execution).rejects.toMatchObject({ code: "EXECUTION_FAILED" });
    await expect(execution).rejects.not.toThrow("do-not-expose");
  });
});

describe("limitToolOutput", () => {
  it("keeps short structured output intact", () => {
    expect(limitToolOutput({ accepted: true })).toBe('{"ok":true,"data":{"accepted":true}}');
  });

  it("returns a valid bounded error envelope instead of truncated JSON", () => {
    const result = limitToolOutput("x".repeat(2_000), 256);
    expect(result.length).toBeLessThanOrEqual(256);
    expect(JSON.parse(result)).toEqual({
      ok: false,
      error: { code: "OUTPUT_TOO_LARGE", message: "Narrow the request." },
    });
  });

  it("does not make a legacy error property look like success", () => {
    expect(JSON.parse(limitToolOutput({ error: "DATABASE_URL=do-not-expose" }))).toEqual({
      ok: false,
      error: {
        code: "EXECUTION_FAILED",
        message: "The WebMCP action could not be completed.",
      },
    });
  });
});
