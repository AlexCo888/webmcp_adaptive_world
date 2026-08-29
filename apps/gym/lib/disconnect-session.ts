export type GymDisconnectTarget = {
  grantId: string;
  sessionId: string;
  subjectId: string;
};

export type GymDisconnectStore = {
  revokeContextGrant: (target: GymDisconnectTarget, now: Date) => Promise<boolean>;
  cancelSession: (target: GymDisconnectTarget, now: Date) => Promise<void>;
};

export async function revokeGymSessionAuthority(
  target: GymDisconnectTarget,
  store: GymDisconnectStore,
  now = new Date(),
): Promise<boolean> {
  // Revoke authority first so every subsequent protected lookup fails, even if
  // recording the terminal session status is interrupted.
  const revoked = await store.revokeContextGrant(target, now);
  await store.cancelSession(target, now);
  return revoked;
}
