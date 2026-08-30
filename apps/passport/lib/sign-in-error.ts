export const SIGN_IN_RATE_LIMIT_MESSAGE =
  "Too many sign-in attempts. Please wait a few seconds and try again.";

export function signInErrorMessage(status: number): string {
  if (status === 429) return SIGN_IN_RATE_LIMIT_MESSAGE;
  if (status >= 500) return "Sign-in is temporarily unavailable. Please try again.";
  return "The email or password was not accepted.";
}
