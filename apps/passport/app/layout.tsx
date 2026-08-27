import type { Metadata, Viewport } from "next";
import { PortalProvider } from "@/lib/portal-context";
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <PortalProvider>{children}</PortalProvider>
      </body>
    </html>
  );
}
