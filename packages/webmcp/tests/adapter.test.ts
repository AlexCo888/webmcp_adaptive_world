import { describe, expect, it, vi } from "vitest";

import {
  limitToolOutput,
  registerWebMcpTools,
  type ModelContext,
  type ModelContextTool,
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
      '{"ok":true,"input":{"value":1}}',
    );

    registration?.unregister();
    expect(signals[0]?.aborted).toBe(true);
  });

  it("fails closed when a mutation has no application-owned confirmation", async () => {
    const { context, tools } = mockContext();
    const registration = registerWebMcpTools([tool(false)], { modelContext: context });
    await registration?.ready;

    await expect(tools.get("write_tool")?.execute({ value: 1 })).rejects.toThrow(
      "WEBMCP_MUTATION_CONFIRMATION_REQUIRED",
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
      expect.objectContaining({ toolName: "write_tool", input: { value: 2 } }),
    );
  });
});

describe("limitToolOutput", () => {
  it("keeps short structured output intact", () => {
    expect(limitToolOutput({ ok: true })).toBe('{"ok":true}');
  });

  it("marks truncated output and never exceeds the requested budget", () => {
    const result = limitToolOutput("x".repeat(2_000), 256);
    expect(result.length).toBeLessThanOrEqual(256);
    expect(result).toContain("output truncated");
  });
});
