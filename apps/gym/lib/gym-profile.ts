import { equipmentCatalog } from "@adaptive-world/demo-data";

export const gymProfile = {
  name: "Adaptive Gym Lab",
  hours: "06:00–22:00 daily",
  services: ["Equipment orientation", "Accessible setup review", "Staff-authored walkthroughs"],
  catalogSize: equipmentCatalog.length,
  catalogIntegrity: "Manufacturer-verified product models; synthetic facility ownership",
  walkthroughs: [
    "first_visit_foundations@1.0",
    "low_impact_orientation@1.0",
    "accessible_equipment_tour@1.0",
  ],
  accessFeatures: [
    "Documented approach and setup features",
    "Supported and seated training options",
    "Staff setup review in every first-visit template",
  ],
  rules: [
    "Only published staff-authored walkthroughs are shown",
    "Every station resolves to the verified equipment catalog",
    "Ask staff to review first-use setup and keep stop signals visible",
    "Personalized routine creation is a confirmed Pro account write",
  ],
  constraints: [
    "Only published template IDs can create a walkthrough",
    "Every station resolves to the verified facility catalog",
    "Clinical records and identity are never requested or returned",
    "Personalized routine creation is a confirmed Pro account write",
  ],
  syntheticFacilityInventory: true,
} as const;
