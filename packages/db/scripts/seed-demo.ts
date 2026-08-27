import { hashPassword } from "better-auth/crypto";
import { eq, sql } from "drizzle-orm";
import { demoPassports, equipmentCatalog } from "@adaptive-world/demo-data";
import {
  accessGrants,
  clinicalGuidance,
  doctorPatientRelationships,
  doctorProfiles,
  equipment,
  patients,
  users,
} from "../src/schema";
import { createDatabase } from "../src/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to seed the demo");
if (process.env.CONFIRM_SYNTHETIC_DEMO_SEED !== "true") {
  throw new Error("Set CONFIRM_SYNTHETIC_DEMO_SEED=true to confirm synthetic demo seeding");
}

const db = createDatabase(databaseUrl);
const password = process.env.DEMO_ACCOUNT_PASSWORD ?? "AdaptiveWorld2026!";
const passwordHash = await hashPassword(password);
const now = new Date();
const grantExpiry = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1_000);

const identities = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    authSubject: "auth_mateo_demo",
    email: "mateo.demo@adaptiveworld.test",
    role: "patient" as const,
    displayName: "Mateo Rivera Demo",
    passportId: "passport_mateo",
    patientId: "10000000-0000-4000-8000-000000000001",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    authSubject: "auth_elena_demo",
    email: "elena.vargas@adaptiveworld.test",
    role: "doctor" as const,
    displayName: "Dra. Elena Vargas",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    authSubject: "synthetic:passport_daniel",
    email: "daniel.demo@adaptiveworld.test",
    role: "patient" as const,
    displayName: "Daniel Martínez Demo",
    passportId: "passport_daniel",
    patientId: "10000000-0000-4000-8000-000000000003",
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    authSubject: "synthetic:passport_maya",
    email: "maya.demo@adaptiveworld.test",
    role: "patient" as const,
    displayName: "Maya Chen Demo",
    passportId: "passport_maya",
    patientId: "10000000-0000-4000-8000-000000000004",
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    authSubject: "synthetic:passport_evelyn",
    email: "evelyn.demo@adaptiveworld.test",
    role: "patient" as const,
    displayName: "Evelyn Brooks Demo",
    passportId: "passport_evelyn",
    patientId: "10000000-0000-4000-8000-000000000005",
  },
  {
    id: "00000000-0000-4000-8000-000000000006",
    authSubject: "synthetic:passport_michael",
    email: "michael.demo@adaptiveworld.test",
    role: "patient" as const,
    displayName: "Michael Roberts Demo",
    passportId: "passport_michael",
    patientId: "10000000-0000-4000-8000-000000000006",
  },
  {
    id: "00000000-0000-4000-8000-000000000007",
    authSubject: "synthetic:passport_amina",
    email: "amina.demo@adaptiveworld.test",
    role: "patient" as const,
    displayName: "Amina Okafor Demo",
    passportId: "passport_amina",
    patientId: "10000000-0000-4000-8000-000000000007",
  },
] as const;

for (const identity of identities) {
  await db
    .insert(users)
    .values({
      id: identity.id,
      authSubject: identity.authSubject,
      email: identity.email,
      role: identity.role,
      displayName: identity.displayName,
      locale: "en-US",
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        authSubject: identity.authSubject,
        email: identity.email,
        role: identity.role,
        displayName: identity.displayName,
        disabledAt: null,
      },
    });
}

for (const identity of identities) {
  if (!("passportId" in identity)) continue;
  const passport = demoPassports.find((candidate) => candidate.id === identity.passportId);
  if (!passport) throw new Error(`Missing synthetic Passport fixture ${identity.passportId}`);
  await db
    .insert(patients)
    .values({
      id: identity.patientId,
      ownerUserId: identity.id,
      syntheticDemo: true,
      passportVersion: 1,
      dateOfBirth: passport.identity.dateOfBirth,
      sexAtBirth: passport.identity.biologicalSex,
      profile: passport,
    })
    .onConflictDoUpdate({
      target: patients.id,
      set: {
        ownerUserId: identity.id,
        syntheticDemo: true,
        dateOfBirth: passport.identity.dateOfBirth,
        sexAtBirth: passport.identity.biologicalSex,
        profile: passport,
      },
    });
}

const authAccounts = identities.filter(
  (identity) =>
    identity.authSubject === "auth_mateo_demo" || identity.authSubject === "auth_elena_demo",
);
for (const identity of authAccounts) {
  await db.execute(sql`
    INSERT INTO "user" ("id", "name", "email", "emailVerified")
    VALUES (${identity.authSubject}, ${identity.displayName}, ${identity.email}, true)
    ON CONFLICT ("id") DO UPDATE SET
      "name" = EXCLUDED."name",
      "email" = EXCLUDED."email",
      "emailVerified" = true,
      "updatedAt" = CURRENT_TIMESTAMP
  `);
  const accountId = `account_${identity.authSubject.replace("auth_", "").replace("_demo", "")}_demo`;
  await db.execute(sql`
    INSERT INTO "account" (
      "id", "issuer", "accountId", "providerId", "userId", "password"
    ) VALUES (
      ${accountId}, 'local:credential', ${identity.authSubject}, 'credential',
      ${identity.authSubject}, ${passwordHash}
    )
    ON CONFLICT ("id") DO UPDATE SET
      "password" = EXCLUDED."password",
      "updatedAt" = CURRENT_TIMESTAMP
  `);
}

const doctorId = "00000000-0000-4000-8000-000000000002";
await db
  .insert(doctorProfiles)
  .values({
    userId: doctorId,
    licenseCountry: "MX",
    licenseRegion: "CDMX",
    licenseNumber: "SYNTHETIC-DEMO-001",
    specialty: "Family Medicine · synthetic demo",
    verifiedAt: now,
  })
  .onConflictDoUpdate({
    target: doctorProfiles.userId,
    set: { specialty: "Family Medicine · synthetic demo", verifiedAt: now },
  });

const relationships = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    patientId: "10000000-0000-4000-8000-000000000001",
    grantId: "30000000-0000-4000-8000-000000000001",
    scopes: [
      "passport.summary.read",
      "passport.clinical.read",
      "passport.documents.read",
      "passport.guidance.write",
    ],
  },
  {
    id: "20000000-0000-4000-8000-000000000004",
    patientId: "10000000-0000-4000-8000-000000000004",
    grantId: "30000000-0000-4000-8000-000000000004",
    scopes: ["passport.summary.read", "passport.clinical.read", "passport.guidance.write"],
  },
] as const;

function ownerIdFor(patientId: string): string {
  const owner = identities.find(
    (identity) => "patientId" in identity && identity.patientId === patientId,
  );
  if (!owner) throw new Error(`Missing synthetic owner for patient ${patientId}`);
  return owner.id;
}

for (const relationship of relationships) {
  await db
    .insert(doctorPatientRelationships)
    .values({
      id: relationship.id,
      patientId: relationship.patientId,
      doctorUserId: doctorId,
      status: "active",
      invitedByUserId: ownerIdFor(relationship.patientId),
      activatedAt: now,
      expiresAt: grantExpiry,
    })
    .onConflictDoUpdate({
      target: doctorPatientRelationships.id,
      set: { status: "active", revokedAt: null, expiresAt: grantExpiry },
    });
  const ownerId = ownerIdFor(relationship.patientId);
  await db
    .insert(accessGrants)
    .values({
      id: relationship.grantId,
      patientId: relationship.patientId,
      granteeUserId: doctorId,
      relationshipId: relationship.id,
      createdByUserId: ownerId,
      purpose: "Synthetic continuity-of-care demonstration",
      status: "active",
      scopes: [...relationship.scopes],
      expiresAt: grantExpiry,
    })
    .onConflictDoUpdate({
      target: accessGrants.id,
      set: {
        status: "active",
        scopes: [...relationship.scopes],
        expiresAt: grantExpiry,
        revokedAt: null,
        revokedByUserId: null,
      },
    });
}

await db
  .insert(clinicalGuidance)
  .values({
    id: "40000000-0000-4000-8000-000000000001",
    patientId: "10000000-0000-4000-8000-000000000001",
    doctorUserId: doctorId,
    relationshipId: "20000000-0000-4000-8000-000000000001",
    accessGrantId: "30000000-0000-4000-8000-000000000001",
    guidance:
      "Favor gradual progression during the first visits and stop the activity if any listed warning signal appears.",
    expiresAt: grantExpiry,
  })
  .onConflictDoUpdate({
    target: clinicalGuidance.id,
    set: { expiresAt: grantExpiry, revokedAt: null },
  });

for (const item of equipmentCatalog) {
  await db
    .insert(equipment)
    .values({
      externalId: item.id,
      slug: item.slug,
      manufacturer: item.manufacturer,
      model: item.model,
      category: item.category,
      description: item.summary,
      status: item.available ? "available" : "unavailable",
      stationCount: item.stations,
      widthCm: item.dimensionsCm.width,
      depthCm: item.dimensionsCm.length,
      heightCm: item.dimensionsCm.height,
      maxUserWeightKg: item.maxUserWeightKg,
      accessibility: item.accessibility,
      capabilities: item.capabilities,
      contraindicationNotes: [],
      media: {
        imageUrl: item.imageUrl,
        imageAlt: item.imageAlt,
        productVerified: true,
        facilityInventorySynthetic: true,
        sourceCheckedAt: item.sourceCheckedAt,
      },
      sourceUrl: item.sourceUrl,
    })
    .onConflictDoUpdate({
      target: equipment.externalId,
      set: {
        slug: item.slug,
        manufacturer: item.manufacturer,
        model: item.model,
        category: item.category,
        description: item.summary,
        status: item.available ? "available" : "unavailable",
        stationCount: item.stations,
        widthCm: item.dimensionsCm.width,
        depthCm: item.dimensionsCm.length,
        heightCm: item.dimensionsCm.height,
        maxUserWeightKg: item.maxUserWeightKg,
        accessibility: item.accessibility,
        capabilities: item.capabilities,
        media: {
          imageUrl: item.imageUrl,
          imageAlt: item.imageAlt,
          productVerified: true,
          facilityInventorySynthetic: true,
          sourceCheckedAt: item.sourceCheckedAt,
        },
        sourceUrl: item.sourceUrl,
      },
    });
}

await db.execute(sql`
  INSERT INTO audit_events (
    actor_user_id, patient_id, action, resource_type, resource_id, outcome, metadata
  )
  SELECT p.owner_user_id, p.id, 'passport.demo.seeded', 'passport', p.id, 'success',
    '{"syntheticDemo":true,"source":"versioned-seed"}'::jsonb
  FROM patients p
  WHERE p.synthetic_demo = true
    AND NOT EXISTS (
      SELECT 1 FROM audit_events a
      WHERE a.patient_id = p.id AND a.action = 'passport.demo.seeded'
    )
`);

await db.execute(sql`
  INSERT INTO audit_events (
    actor_user_id, patient_id, action, resource_type, resource_id, outcome, metadata
  )
  SELECT ${doctorId}::uuid, '10000000-0000-4000-8000-000000000001'::uuid,
    'clinical_guidance.confirmed', 'clinical_guidance',
    '40000000-0000-4000-8000-000000000001'::uuid, 'success',
    '{"syntheticDemo":true,"source":"versioned-seed"}'::jsonb
  WHERE NOT EXISTS (
    SELECT 1 FROM audit_events
    WHERE resource_id = '40000000-0000-4000-8000-000000000001'::uuid
      AND action = 'clinical_guidance.confirmed'
  )
`);

const seededPatients = await db
  .select({ id: patients.id })
  .from(patients)
  .where(eq(patients.syntheticDemo, true));
console.log(
  `Seeded ${seededPatients.length} synthetic Passports, ${equipmentCatalog.length} verified product models, and ${authAccounts.length} Better Auth demo accounts.`,
);
