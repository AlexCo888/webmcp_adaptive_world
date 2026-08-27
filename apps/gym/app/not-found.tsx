import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

export default function NotFoundPage() {
  return (
    <div className="page-wrap">
      <div className="error-page card">
        <SearchX size={34} />
        <p className="eyebrow">404</p>
        <h1>That equipment isn’t in this gym.</h1>
        <p>Adaptive sessions can only reference verified models in the current club catalog.</p>
        <Link className="button button--dark" href="/equipment">
          <ArrowLeft size={16} /> Explore the catalog
        </Link>
      </div>
    </div>
  );
}
