"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";
import { usePortal, type PortalRole } from "@/lib/portal-context";

export type ViewName = "dashboard" | "documents" | "sharing" | "access" | "doctor" | "tools";

const ownerNav: Array<{ href: string; label: string; icon: IconName; view: ViewName }> = [
  { href: "/", label: "Overview", icon: "home", view: "dashboard" },
  { href: "/documents", label: "Documents", icon: "file", view: "documents" },
  { href: "/sharing", label: "Sharing", icon: "share", view: "sharing" },
  { href: "/access-log", label: "Access log", icon: "clock", view: "access" },
  { href: "/tools", label: "WebMCP tools", icon: "tools", view: "tools" },
];

const doctorNav: Array<{ href: string; label: string; icon: IconName; view: ViewName }> = [
  { href: "/doctor", label: "My Patients", icon: "doctor", view: "doctor" },
  { href: "/tools", label: "WebMCP tools", icon: "tools", view: "tools" },
];

function Brand({ mobile = false }: { mobile?: boolean }) {
  return (
    <div className={mobile ? "mobile-brand" : "brand"}>
      <div className="brand-mark">A</div>
      {!mobile ? (
        <div className="brand-copy">
          <strong>Adaptive World</strong>
          <small>Digital Passport</small>
        </div>
      ) : (
        "Adaptive World"
      )}
    </div>
  );
}

function Nav({ view, mobile = false }: { view: ViewName; mobile?: boolean }) {
  const { role } = usePortal();
  const items = role === "doctor" ? doctorNav : ownerNav;
  return (
    <nav
      className={mobile ? "mobile-nav" : "nav-list"}
      aria-label={mobile ? "Mobile navigation" : "Primary navigation"}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`nav-item ${view === item.view ? "active" : ""}`}
        >
          <Icon name={item.icon} className="nav-icon" />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

function RoleSwitch() {
  const router = useRouter();
  const { role, setRole } = usePortal();
  const choose = (nextRole: PortalRole) => {
    setRole(nextRole);
    router.push(nextRole === "doctor" ? "/doctor" : "/");
  };
  return (
    <div className="role-switch" aria-label="Demo role">
      <button className={role === "owner" ? "active" : ""} onClick={() => choose("owner")}>
        My Passport
      </button>
      <button className={role === "doctor" ? "active" : ""} onClick={() => choose("doctor")}>
        Doctor
      </button>
    </div>
  );
}

export function PortalShell({
  view,
  title,
  children,
}: {
  view: ViewName;
  title: string;
  children: ReactNode;
}) {
  const { webmcp, toast } = usePortal();
  const statusLabel =
    webmcp.status === "active"
      ? "Active"
      : webmcp.status === "registering"
        ? "Registering"
        : webmcp.status === "error"
          ? "Error"
          : "Unavailable";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <p className="side-label">Workspace</p>
        <Nav view={view} />
        <div className="sidebar-footer">
          <div className="privacy-chip">
            <Icon name="shield" className="nav-icon" />
            <div>
              <strong>Private by default</strong>Only approved, purpose-bound context is shared.
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <Brand mobile />
          <div className="breadcrumb">
            Adaptive World &nbsp;/&nbsp; <strong>{title}</strong>
          </div>
          <div className="top-actions">
            <Link href="/tools" className="webmcp-status" title="Open the live WebMCP registry">
              <span className={`status-dot ${webmcp.status === "active" ? "live" : ""}`} />
              WebMCP · {statusLabel}
            </Link>
            <RoleSwitch />
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
      <Nav view={view} mobile />
      {toast ? (
        <div className="toast" role="status">
          <Icon name="check" width="17" />
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

export function PatientSelector() {
  const { patient, patientId, passports, setPatientId } = usePortal();
  const initials = patient.identity.displayName
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  return (
    <div className="demo-select">
      <div className="avatar">{initials}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <label htmlFor="demo-patient">Synthetic demo profile</label>
        <select
          id="demo-patient"
          value={patientId}
          onChange={(event) => setPatientId(event.target.value)}
        >
          {passports.map((item) => (
            <option key={item.id} value={item.id}>
              {item.identity.displayName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  selector = true,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  selector?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ?? (selector ? <PatientSelector /> : null)}
    </div>
  );
}
