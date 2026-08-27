import type { Metadata, Viewport } from "next";
import { PortalProvider } from "@/lib/portal-context";
import { getOptionalActor, loadPortalBootstrap } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_PASSPORT_URL ?? "https://passport.adaptiveworld.demo",
  ),
  title: {
    default: "Digital Passport | Adaptive World",
    template: "%s | Adaptive World",
  },
  description:
    "A private, permissioned digital passport that shares only the context each environment needs.",
  applicationName: "Adaptive World Passport",
  keywords: ["digital passport", "progressive disclosure", "WebMCP", "health data"],
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101713",
  colorScheme: "light",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const actor = await getOptionalActor();
  const bootstrap = actor ? await loadPortalBootstrap(actor) : null;
  return (
    <html lang="en">
      <body>
        {bootstrap ? <PortalProvider bootstrap={bootstrap}>{children}</PortalProvider> : children}
      </body>
    </html>
  );
}
