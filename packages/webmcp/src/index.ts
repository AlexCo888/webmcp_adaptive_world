import type {} from "./webmcp-globals";

export {
  getModelContext,
  registerWebMCPTools,
  registerWebMcpTools,
  unregisterWebMCPTools,
  unregisterWebMcpTools,
} from "./adapter";
export { useWebMCPTools } from "./hooks";
export {
  DEFAULT_TOOL_OUTPUT_LIMIT,
  MIN_TOOL_OUTPUT_LIMIT,
  WEBMCP_ERROR_CODES,
  WebMCPToolError,
  limitToolOutput,
  toSafeWebMCPError,
  webMcpFailure,
  webMcpSuccess,
} from "./output";
export type {
  WebMCPEnvelope,
  WebMCPErrorCode,
  WebMCPErrorEnvelope,
  WebMCPSuccessEnvelope,
} from "./output";
export * from "./types";
export * from "./catalog/passport";
export * from "./catalog/doctor";
export * from "./catalog/gym";
