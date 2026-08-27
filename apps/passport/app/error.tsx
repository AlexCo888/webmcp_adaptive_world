"use client";

import { Icon } from "@/components/icon";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section className="card empty-state" style={{ maxWidth: 520 }}>
        <div className="empty-icon">
          <Icon name="alert" width="24" />
        </div>
        <p className="eyebrow">Adaptive World</p>
        <h1 style={{ fontSize: 32 }}>This view could not load</h1>
        <p>Your data was not changed. Retry the view or return to the Passport overview.</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 9 }}>
          <a className="button" href="/">
            Go home
          </a>
          <button className="button primary" onClick={reset}>
            Try again
          </button>
        </div>
      </section>
    </main>
  );
}
