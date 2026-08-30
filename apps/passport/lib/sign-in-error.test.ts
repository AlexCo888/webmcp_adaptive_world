import { describe, expect, it } from "vitest";

import { SIGN_IN_RATE_LIMIT_MESSAGE, signInErrorMessage } from "./sign-in-error";

describe("sign-in error messages", () => {
  it("distinguishes an intentional rate limit from rejected credentials", () => {
    expect(signInErrorMessage(429)).toBe(SIGN_IN_RATE_LIMIT_MESSAGE);
    expect(signInErrorMessage(401)).toBe("The email or password was not accepted.");
  });

  it("does not mislabel a server failure as a bad password", () => {
    expect(signInErrorMessage(503)).toBe("Sign-in is temporarily unavailable. Please try again.");
  });
});
