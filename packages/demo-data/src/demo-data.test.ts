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

void test("contains 22 verified product records with unique ids, slugs, and sources", () => {
  assert.equal(equipmentCatalog.length, 22);
  assert.equal(EquipmentCatalogSchema.safeParse(equipmentCatalog).success, true);
  assert.equal(new Set(equipmentCatalog.map(({ id }) => id)).size, 22);
  assert.equal(new Set(equipmentCatalog.map(({ slug }) => slug)).size, 22);
  assert.equal(new Set(equipmentCatalog.map(({ imageUrl }) => imageUrl)).size, 22);
  for (const item of equipmentCatalog) {
    assert.equal(item.verifiedProduct, true);
    assert.match(item.sourceUrl, /^https:\/\//u);
    assert.equal(item.imageUrl, `/images/equipment/${item.slug}.webp`);
    assert.match(item.imageUrl, /^\/images\/equipment\/[a-z0-9-]+\.webp$/u);
    assert.doesNotMatch(item.imageUrl, /^https?:\/\//u);
    assert.equal(item.syntheticFacilityInventory, true);
  }
});

void test("fills every previously sparse equipment category", () => {
  const count = (category: (typeof equipmentCatalog)[number]["category"]) =>
    equipmentCatalog.filter((item) => item.category === category).length;

  assert.equal(count("plate-loaded-strength"), 2);
  assert.equal(count("free-weights"), 4);
  assert.equal(count("functional-training"), 3);
  assert.equal(count("pilates-mobility"), 2);
  assert.equal(count("rehabilitation"), 3);
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
