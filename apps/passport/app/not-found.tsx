import Link from "next/link";
import { Icon } from "@/components/icon";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section className="card empty-state" style={{ maxWidth: 520 }}>
        <div className="empty-icon">
          <Icon name="search" width="24" />
        </div>
        <p className="eyebrow">404 · Not found</p>
        <h1 style={{ fontSize: 34 }}>This Passport view does not exist</h1>
        <p>
          The link may be outdated, or the resource may no longer be available to your current role.
        </p>
        <Link className="button primary" href="/">
          Return to overview
        </Link>
      </section>
    </main>
  );
}
