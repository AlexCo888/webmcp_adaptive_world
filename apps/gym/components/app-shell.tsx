import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, Dumbbell, Fingerprint, Sparkles } from "lucide-react";

const navigation = [
  { href: "/equipment", label: "Equipment" },
  { href: "/passport", label: "Passport context" },
  { href: "/session", label: "Staff walkthroughs" },
];

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-mark" aria-label="Adaptive Gym">
      <span className="brand-mark__glyph" aria-hidden="true">
        <Image src="/icons/icon-192.png" alt="" width={38} height={38} sizes="38px" />
      </span>
      {!compact && (
        <span>
          <strong>Adaptive</strong>
          <span>Gym</span>
        </span>
      )}
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="site-shell">
      <header className="topbar">
        <div className="topbar__inner">
          <Link href="/" className="brand-link">
            <BrandMark />
          </Link>
          <nav className="desktop-nav" aria-label="Primary navigation">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="topbar__actions">
            <span className="webmcp-pill" title="This site can expose structured WebMCP tools">
              <Sparkles size={13} /> WebMCP surface
            </span>
            <Link className="button button--dark button--small" href="/session">
              Member visit <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer className="footer">
        <div className="footer__brand">
          <BrandMark />
          <p>
            Consent-first context matched to verified products and published staff walkthroughs.
          </p>
        </div>
        <div className="footer__principles" aria-label="Product principles">
          <span>
            <Fingerprint size={16} /> Consent-first context
          </span>
          <span>
            <Dumbbell size={16} /> Reference-grounded products
          </span>
        </div>
        <p className="footer__legal">
          Synthetic club inventory and member data. Catalog labels and visuals are fictional. Not
          medical advice.
        </p>
      </footer>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <Link href="/equipment">
          <Dumbbell size={18} />
          <span>Equipment</span>
        </Link>
        <Link href="/passport">
          <Fingerprint size={18} />
          <span>Context</span>
        </Link>
        <Link href="/session">
          <Sparkles size={18} />
          <span>Session</span>
        </Link>
      </nav>
    </div>
  );
}
