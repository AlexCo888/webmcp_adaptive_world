"use client";

import { useEffect, useMemo, useState } from "react";

import { registerWebMcpTools } from "./adapter";
import type {
  UseWebMCPOptions,
  UseWebMCPResult,
  WebMCPAvailability,
  WebMCPToolDefinition,
} from "./types";

export function useWebMCPTools(
  tools: readonly WebMCPToolDefinition[],
  options: UseWebMCPOptions = {},
): UseWebMCPResult {
  const { enabled = true, modelContext, confirmMutation, maxOutputChars, onError } = options;
  const [status, setStatus] = useState<WebMCPAvailability>(enabled ? "registering" : "disabled");
  const [error, setError] = useState<unknown>(null);
  const toolNames = useMemo(() => tools.map(({ name }) => name), [tools]);

  useEffect(() => {
    if (!enabled) {
      setStatus("disabled");
      setError(null);
      return;
    }

    setStatus("registering");
    setError(null);
    const registration = registerWebMcpTools(tools, {
      ...(modelContext !== undefined ? { modelContext } : {}),
      ...(confirmMutation ? { confirmMutation } : {}),
      ...(maxOutputChars !== undefined ? { maxOutputChars } : {}),
      onError: (registrationError) => {
        onError?.(registrationError);
      },
    });

    if (!registration) {
      setStatus("unavailable");
      return;
    }

    let mounted = true;
    void registration.ready.then(
      () => {
        if (mounted) setStatus("active");
      },
      (registrationError: unknown) => {
        if (!mounted) return;
        setError(registrationError);
        setStatus("error");
      },
    );

    return () => {
      mounted = false;
      registration.unregister();
    };
  }, [confirmMutation, enabled, maxOutputChars, modelContext, onError, tools]);

  return { status, error, toolNames };
}
