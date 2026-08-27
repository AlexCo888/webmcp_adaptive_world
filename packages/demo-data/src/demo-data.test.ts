import assert from "node:assert/strict";
import test from "node:test";

import {
  DigitalPassportSchema,
  EquipmentCatalogSchema,
  GymContextProjectionSchema,
} from "@adaptive-world/contracts";

import { demoGymProfiles, demoPassports, equipmentCatalog } from "./index";

void test("contains six valid synthetic passports and gym projections", () => {
  assert.equal(demoPassports.length, 6);
  assert.equal(demoGymProfiles.length, 6);
  assert.equal(DigitalPassportSchema.array().safeParse(demoPassports).success, true);
  assert.equal(GymContextProjectionSchema.array().safeParse(demoGymProfiles).success, true);
});

void test("contains exactly 68 valid equipment records with unique ids and slugs", () => {
  assert.equal(equipmentCatalog.length, 68);
  assert.equal(EquipmentCatalogSchema.safeParse(equipmentCatalog).success, true);
  assert.equal(new Set(equipmentCatalog.map(({ id }) => id)).size, 68);
  assert.equal(new Set(equipmentCatalog.map(({ slug }) => slug)).size, 68);
});

void test("gym projection excludes restricted clinical data", () => {
  for (const profile of demoGymProfiles) {
    const serialized = JSON.stringify(profile);
    for (const forbidden of [
      "identity",
      "passportId",
      "displayName",
      "dateOfBirth",
      "medications",
      "allergies",
      "notableResults",
      "documents",
    ]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  }
});
