import type { Equipment } from "@adaptive-world/contracts";

/** Neutral labels used in the recorded UI; the underlying catalog remains unchanged. */
const neutralNames: Record<string, string> = {
  lf_integrity_plus_treadmill: "PaceDeck Treadmill",
  lf_integrity_plus_elliptical: "GlidePath Elliptical",
  lf_heat_row: "RailFlow Rower",
  lf_integrity_recumbent: "Step-Through Recumbent Cycle",
  scifit_pro2_total_body: "Inclusive Total-Body Ergometer",
  lf_insignia_chest_press: "Supported Chest Press",
  lf_insignia_row: "Supported Seated Row",
  lf_insignia_pec_rear_delt: "Dual-Action Fly Station",
  lf_insignia_back_extension: "Supported Back Extension",
  lf_dual_adjustable_pulley: "Dual Adjustable Cable Station",
  rogue_manta_ray_bench: "Adjustable Training Bench",
  eleiko_prestera_half_rack: "Half Rack",
  hs_linear_leg_press: "Linear Leg Press",
  hs_iso_lateral_high_row: "Independent-Arm High Row",
  rogue_sml_2c_squat_stand: "Commercial Squat Stand",
  torque_hex_dumbbell_rack: "5–50 lb Dumbbell Set and Rack",
  torque_f9_functional_trainer: "Fold-Away Functional Trainer",
  torque_tank_m1: "Magnetic-Resistance Push Sled",
  balanced_body_allegro_2: "Studio Reformer",
  balanced_body_combo_chair: "Split-Pedal Studio Chair",
  nustep_t6max: "Inclusive Recumbent Cross Trainer",
  scifit_stepone: "Accessible Recumbent Stepper",
};

export function uiEquipmentName(item: Equipment): string {
  return neutralNames[item.id] ?? "Catalog equipment";
}

export function uiEquipmentModel(item: Equipment): string {
  return `Catalog ${item.id.slice(0, 2).toUpperCase()}`;
}

export function uiEquipmentAlt(item: Equipment): string {
  return `Studio visualization of ${uiEquipmentName(item).toLowerCase()}`;
}

export const uiEquipmentManufacturer = "Demo catalog";
