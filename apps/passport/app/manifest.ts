import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Adaptive World Digital Passport",
    short_name: "AW Passport",
    description: "Private, permissioned context for adaptive environments.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f4ef",
    theme_color: "#101713",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
