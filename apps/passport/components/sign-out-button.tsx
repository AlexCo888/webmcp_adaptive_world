"use client";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  return (
    <button
      className="account-signout"
      type="button"
      onClick={async () => {
        await authClient.signOut();
        window.location.assign("/sign-in");
      }}
    >
      Sign out
    </button>
  );
}
