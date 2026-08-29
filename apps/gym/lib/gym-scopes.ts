export const GYM_CONTEXT_READ_SCOPE = "gym.context.read";
export const GYM_FEEDBACK_WRITE_SCOPE = "gym.feedback.write";

export function hasRequiredGymScopes(
  grantedScopes: readonly string[],
  requiredScopes: readonly string[],
): boolean {
  return requiredScopes.every((scope) => grantedScopes.includes(scope));
}
