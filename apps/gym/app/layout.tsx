import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { WebMcpBridge } from "@/components/webmcp-bridge";
import { GymExperienceProvider } from "@/components/gym-experience-context";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_GYM_URL ?? "https://gym.adaptiveworld.demo"),
  title: { default: "Adaptive Gym", template: "%s · Adaptive Gym" },
  description:
    "A WebMCP-enabled gym that matches consented context with equipment that actually exists.",
  applicationName: "Adaptive Gym",
  keywords: ["adaptive fitness", "WebMCP", "accessible gym", "Digital Passport"],
  openGraph: {
    title: "Adaptive Gym",
    description: "Real equipment. Minimum context. A session shaped around you.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#101e17",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <GymExperienceProvider>
          <AppShell>{children}</AppShell>
          <WebMcpBridge />
        </GymExperienceProvider>
      </body>
    </html>
  );
}
