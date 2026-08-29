import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Adaptive Gym",
    short_name: "Adaptive Gym",
    description: "Catalog-grounded adaptive fitness with WebMCP.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f3ec",
    theme_color: "#101e17",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
