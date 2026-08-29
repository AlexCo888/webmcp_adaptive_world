import { describe, expect, it, vi } from "vitest";
import { revokeGymSessionAuthority } from "./disconnect-session";

describe("Gym disconnect", () => {
  it("revokes the live grant before cancelling the matching server session", async () => {
    const calls: string[] = [];
    const revokeContextGrant = vi.fn(() => {
      calls.push("grant");
      return Promise.resolve(true);
    });
    const cancelSession = vi.fn(() => {
      calls.push("session");
      return Promise.resolve();
    });
    const target = { grantId: "grant-1", sessionId: "session-1", subjectId: "subject-1" };

    await expect(
      revokeGymSessionAuthority(target, { revokeContextGrant, cancelSession }, new Date(0)),
    ).resolves.toBe(true);
    expect(calls).toEqual(["grant", "session"]);
    expect(revokeContextGrant).toHaveBeenCalledWith(target, new Date(0));
    expect(cancelSession).toHaveBeenCalledWith(target, new Date(0));
  });
});
