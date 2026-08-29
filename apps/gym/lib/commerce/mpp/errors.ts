export type MppSafeErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_PAYMENT_SNAPSHOT"
  | "PAYMENT_FAILED"
  | "RECONCILIATION_REQUIRED";

const safeMessages: Record<MppSafeErrorCode, string> = {
  PROVIDER_UNAVAILABLE: "Agent payment is unavailable.",
  INVALID_PAYMENT_SNAPSHOT: "The payment request could not be validated.",
  PAYMENT_FAILED: "The agent payment was not completed.",
  RECONCILIATION_REQUIRED: "Payment status requires reconciliation.",
};

export class MppAdapterError extends Error {
  readonly safeCode: MppSafeErrorCode;
  readonly retryable: boolean;

  constructor(safeCode: MppSafeErrorCode, options: { retryable?: boolean } = {}) {
    super(safeMessages[safeCode]);
    this.name = "MppAdapterError";
    this.safeCode = safeCode;
    this.retryable = options.retryable ?? false;
  }
}

export type SafeMppError = Readonly<{
  code: MppSafeErrorCode;
  message: string;
  retryable: boolean;
}>;

export function toSafeMppError(error: unknown): SafeMppError {
  if (error instanceof MppAdapterError) {
    return {
      code: error.safeCode,
      message: error.message,
      retryable: error.retryable,
    };
  }

  return {
    code: "PROVIDER_UNAVAILABLE",
    message: safeMessages.PROVIDER_UNAVAILABLE,
    retryable: true,
  };
}
