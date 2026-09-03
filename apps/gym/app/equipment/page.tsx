import type { Metadata } from "next";
import { equipmentCatalog } from "@adaptive-world/demo-data";
import { CatalogExplorer } from "@/components/catalog-explorer";

export const metadata: Metadata = {
  title: "Equipment catalog",
  description: "Explore the fictional commercial equipment catalog in the Adaptive Gym demo.",
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
          Search the same 22-model inventory exposed through WebMCP. Product details are grounded in
          technical references; the club&apos;s ownership and availability are synthetic.
        </p>
      </header>
      <CatalogExplorer equipment={equipmentCatalog} />
    </div>
  );
}
