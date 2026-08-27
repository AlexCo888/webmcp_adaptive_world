import type { Metadata } from "next";
import { equipmentCatalog } from "@adaptive-world/demo-data";
import { CatalogExplorer } from "@/components/catalog-explorer";

export const metadata: Metadata = {
  title: "Equipment catalog",
  description: "Explore 68 structured equipment records available in Adaptive Gym.",
};

export default function EquipmentPage() {
  return (
    <div className="page-wrap">
      <header className="catalog-header">
        <div>
          <p className="eyebrow">The real environment</p>
          <h1 className="page-title">Equipment, made legible.</h1>
        </div>
        <p className="page-intro">
          Search the same structured inventory exposed to agents through WebMCP. A session can only
          use equipment listed here.
        </p>
      </header>
      <CatalogExplorer equipment={equipmentCatalog} />
    </div>
  );
}
