import type { ConfirmMutation, MutationConfirmationRequest } from "@adaptive-world/webmcp";

type PendingConfirmation = {
  request: MutationConfirmationRequest;
  resolve: (approved: boolean) => void;
  removeAbortListener: () => void;
};

export type MutationConfirmationGate = {
  confirm: ConfirmMutation;
  decide(approved: boolean): void;
  dispose(): void;
};

/**
 * Owns the one visible Passport confirmation. A concurrent mutation fails
 * closed instead of replacing the resolver behind an already-rendered modal.
 */
export function createMutationConfirmationGate(
  present: (request: MutationConfirmationRequest | null) => void,
): MutationConfirmationGate {
  let pending: PendingConfirmation | null = null;

  const release = (expected: PendingConfirmation, publish: boolean) => {
    if (pending !== expected) return false;
    pending = null;
    expected.removeAbortListener();
    if (publish) present(null);
    return true;
  };

  return {
    confirm(request) {
      if (request.signal?.aborted || pending) return false;

      return new Promise<boolean>((resolve) => {
        const abort = () => {
          if (!release(current, true)) return;
          resolve(false);
        };
        const current: PendingConfirmation = {
          request,
          resolve,
          removeAbortListener: () => request.signal?.removeEventListener("abort", abort),
        };
        pending = current;
        request.signal?.addEventListener("abort", abort, { once: true });
        if (request.signal?.aborted) {
          abort();
          return;
        }
        present(request);
      });
    },

    decide(approved) {
      const current = pending;
      if (!current || !release(current, true)) return;
      current.resolve(approved);
    },

    dispose() {
      const current = pending;
      if (!current || !release(current, false)) return;
      current.resolve(false);
    },
  };
}
