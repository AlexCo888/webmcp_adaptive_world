import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const userRoleEnum = pgEnum("user_role", ["patient", "doctor", "admin"]);
export const relationshipStatusEnum = pgEnum("relationship_status", [
  "pending",
  "active",
  "revoked",
  "expired",
]);
export const grantStatusEnum = pgEnum("grant_status", ["active", "revoked", "expired"]);
export const documentStatusEnum = pgEnum("document_status", [
  "processing",
  "ready",
  "failed",
  "archived",
]);
export const labStatusEnum = pgEnum("lab_status", ["preliminary", "final", "corrected"]);
export const equipmentStatusEnum = pgEnum("equipment_status", [
  "available",
  "maintenance",
  "unavailable",
]);
export const sessionStatusEnum = pgEnum("session_status", [
  "draft",
  "confirmed",
  "completed",
  "cancelled",
]);
export const auditOutcomeEnum = pgEnum("audit_outcome", ["success", "denied", "error"]);
export const commercePayerKindEnum = pgEnum("commerce_payer_kind", ["human", "agent"]);
export const commerceProviderEnum = pgEnum("commerce_provider", ["stripe_checkout", "mpp_tempo"]);
export const commerceOrderStatusEnum = pgEnum("commerce_order_status", [
  "created",
  "provider_pending",
  "payment_submitted",
  "reconciliation_required",
  "paid_unfulfilled",
  "fulfilled",
  "failed",
  "expired",
  "voided",
  "duplicate_paid",
  "refund_pending",
  "refunded",
]);
export const providerSetupStatusEnum = pgEnum("provider_setup_status", [
  "prepared",
  "requesting",
  "attached",
  "reconciliation_required",
  "failed_terminal",
]);
export const entitlementGrantStatusEnum = pgEnum("entitlement_grant_status", ["active", "revoked"]);
export const agentBudgetReservationStatusEnum = pgEnum("agent_budget_reservation_status", [
  "reserved",
  "submitted",
  "reconciliation_required",
  "settled",
  "released",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authSubject: text("auth_subject").notNull(),
    email: text("email").notNull(),
    role: userRoleEnum("role").notNull(),
    displayName: text("display_name").notNull(),
    locale: varchar("locale", { length: 16 }).notNull().default("en"),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_auth_subject_uidx").on(table.authSubject),
    uniqueIndex("users_email_lower_uidx").on(sql`lower(${table.email})`),
    index("users_role_idx").on(table.role),
  ],
);

export const patients = pgTable(
  "patients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    syntheticDemo: boolean("synthetic_demo").notNull().default(false),
    passportVersion: integer("passport_version").notNull().default(1),
    dateOfBirth: date("date_of_birth", { mode: "string" }),
    sexAtBirth: varchar("sex_at_birth", { length: 32 }),
    profile: jsonb("profile")
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("patients_owner_uidx").on(table.ownerUserId),
    check("patients_passport_version_check", sql`${table.passportVersion} > 0`),
  ],
);

export const doctorProfiles = pgTable(
  "doctor_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    licenseCountry: varchar("license_country", { length: 2 }),
    licenseRegion: varchar("license_region", { length: 64 }),
    licenseNumber: text("license_number"),
    specialty: text("specialty"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("doctor_license_uidx").on(
      table.licenseCountry,
      table.licenseRegion,
      table.licenseNumber,
    ),
  ],
);

export const doctorPatientRelationships = pgTable(
  "doctor_patient_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    doctorUserId: uuid("doctor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: relationshipStatusEnum("status").notNull().default("pending"),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("doctor_patient_relationship_uidx").on(table.patientId, table.doctorUserId),
    index("doctor_relationship_doctor_status_idx").on(table.doctorUserId, table.status),
    index("doctor_relationship_patient_status_idx").on(table.patientId, table.status),
  ],
);

export const accessGrants = pgTable(
  "access_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    granteeUserId: uuid("grantee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    relationshipId: uuid("relationship_id").references(() => doctorPatientRelationships.id, {
      onDelete: "cascade",
    }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    purpose: text("purpose").notNull(),
    status: grantStatusEnum("status").notNull().default("active"),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("access_grants_grantee_active_idx").on(
      table.granteeUserId,
      table.status,
      table.expiresAt,
    ),
    uniqueIndex("access_grants_one_live_authority_uidx")
      .on(table.patientId, table.granteeUserId)
      .where(sql`${table.status} = 'active' AND ${table.revokedAt} IS NULL`),
    index("access_grants_patient_idx").on(table.patientId),
    check("access_grants_scopes_array_check", sql`jsonb_typeof(${table.scopes}) = 'array'`),
    check("access_grants_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id),
    status: documentStatusEnum("status").notNull().default("processing"),
    category: varchar("category", { length: 80 }).notNull(),
    title: text("title").notNull(),
    mimeType: varchar("mime_type", { length: 128 }).notNull(),
    byteSize: bigint("byte_size", { mode: "number" }).notNull(),
    blobKey: text("blob_key").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    sourceDate: date("source_date", { mode: "string" }),
    untrustedContent: boolean("untrusted_content").notNull().default(true),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("documents_blob_key_uidx").on(table.blobKey),
    index("documents_patient_category_idx").on(table.patientId, table.category),
    check("documents_byte_size_check", sql`${table.byteSize} > 0`),
    check("documents_sha256_check", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const labReports = pgTable(
  "lab_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    status: labStatusEnum("status").notNull().default("final"),
    panelCode: varchar("panel_code", { length: 80 }),
    panelName: text("panel_name").notNull(),
    performerName: text("performer_name"),
    collectedAt: timestamp("collected_at", { withTimezone: true }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    syntheticDemo: boolean("synthetic_demo").notNull().default(false),
    ...timestamps,
  },
  (table) => [index("lab_reports_patient_issued_idx").on(table.patientId, table.issuedAt)],
);

export const labResults = pgTable(
  "lab_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => labReports.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    loincCode: varchar("loinc_code", { length: 32 }),
    name: text("name").notNull(),
    valueNumber: numeric("value_number"),
    valueText: text("value_text"),
    unit: varchar("unit", { length: 64 }),
    referenceLow: numeric("reference_low"),
    referenceHigh: numeric("reference_high"),
    interpretation: varchar("interpretation", { length: 32 }),
    measuredAt: timestamp("measured_at", { withTimezone: true }),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    index("lab_results_patient_name_idx").on(table.patientId, table.name),
    index("lab_results_report_idx").on(table.reportId),
    check(
      "lab_results_value_check",
      sql`(${table.valueNumber} IS NOT NULL)::int + (${table.valueText} IS NOT NULL)::int = 1`,
    ),
  ],
);

export const clinicalGuidance = pgTable(
  "clinical_guidance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    doctorUserId: uuid("doctor_user_id")
      .notNull()
      .references(() => users.id),
    relationshipId: uuid("relationship_id")
      .notNull()
      .references(() => doctorPatientRelationships.id),
    accessGrantId: uuid("access_grant_id")
      .notNull()
      .references(() => accessGrants.id),
    guidance: text("guidance").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("clinical_guidance_patient_time_idx").on(table.patientId, table.createdAt),
    index("clinical_guidance_doctor_time_idx").on(table.doctorUserId, table.createdAt),
    check("clinical_guidance_length_check", sql`length(${table.guidance}) BETWEEN 1 AND 2000`),
    check("clinical_guidance_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const contextGrants = pgTable(
  "context_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    audience: varchar("audience", { length: 128 }).notNull(),
    purpose: text("purpose").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    projection: jsonb("projection").$type<Record<string, unknown>>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    redeemedBySessionId: uuid("redeemed_by_session_id"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("context_grants_token_hash_uidx").on(table.tokenHash),
    index("context_grants_patient_idx").on(table.patientId, table.createdAt),
    index("context_grants_expiry_idx").on(table.expiresAt),
    check("context_grants_hash_check", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check("context_grants_scopes_array_check", sql`jsonb_typeof(${table.scopes}) = 'array'`),
    check("context_grants_expiry_check", sql`${table.expiresAt} > ${table.createdAt}`),
  ],
);

export const equipment = pgTable(
  "equipment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalId: varchar("external_id", { length: 128 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull(),
    manufacturer: text("manufacturer").notNull(),
    model: text("model").notNull(),
    category: varchar("category", { length: 80 }).notNull(),
    description: text("description").notNull(),
    status: equipmentStatusEnum("status").notNull().default("available"),
    stationCount: integer("station_count").notNull().default(1),
    widthCm: real("width_cm"),
    depthCm: real("depth_cm"),
    heightCm: real("height_cm"),
    maxUserWeightKg: real("max_user_weight_kg"),
    accessibility: jsonb("accessibility")
      .notNull()
      .default(sql`'{}'::jsonb`),
    capabilities: jsonb("capabilities")
      .notNull()
      .default(sql`'[]'::jsonb`),
    contraindicationNotes: jsonb("contraindication_notes")
      .notNull()
      .default(sql`'[]'::jsonb`),
    media: jsonb("media")
      .notNull()
      .default(sql`'{}'::jsonb`),
    sourceUrl: text("source_url"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("equipment_external_id_uidx").on(table.externalId),
    uniqueIndex("equipment_slug_uidx").on(table.slug),
    index("equipment_category_status_idx").on(table.category, table.status),
    check("equipment_station_count_check", sql`${table.stationCount} > 0`),
  ],
);

export const gymSessions = pgTable(
  "gym_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    anonymousSubjectId: uuid("anonymous_subject_id").notNull(),
    patientId: uuid("patient_id").references(() => patients.id, { onDelete: "set null" }),
    contextGrantId: uuid("context_grant_id").references(() => contextGrants.id, {
      onDelete: "set null",
    }),
    status: sessionStatusEnum("status").notNull().default("draft"),
    contextProjection: jsonb("context_projection").$type<Record<string, unknown>>().notNull(),
    plan: jsonb("plan").$type<Record<string, unknown>>().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("gym_sessions_subject_created_idx").on(table.anonymousSubjectId, table.createdAt),
    index("gym_sessions_patient_idx").on(table.patientId),
  ],
);

export const gymSessionEquipment = pgTable(
  "gym_session_equipment",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => gymSessions.id, { onDelete: "cascade" }),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id),
    sequence: integer("sequence").notNull(),
    prescription: jsonb("prescription")
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.equipmentId] }),
    uniqueIndex("gym_session_equipment_sequence_uidx").on(table.sessionId, table.sequence),
  ],
);

export const sessionFeedback = pgTable(
  "session_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => gymSessions.id, { onDelete: "cascade" }),
    anonymousSubjectId: uuid("anonymous_subject_id").notNull(),
    rating: integer("rating"),
    perceivedExertion: integer("perceived_exertion"),
    painBefore: integer("pain_before"),
    painAfter: integer("pain_after"),
    completed: boolean("completed").notNull(),
    notes: text("notes"),
    exerciseFeedback: jsonb("exercise_feedback")
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("session_feedback_session_subject_uidx").on(
      table.sessionId,
      table.anonymousSubjectId,
    ),
    check(
      "session_feedback_rating_check",
      sql`${table.rating} IS NULL OR ${table.rating} BETWEEN 1 AND 5`,
    ),
    check(
      "session_feedback_rpe_check",
      sql`${table.perceivedExertion} IS NULL OR ${table.perceivedExertion} BETWEEN 0 AND 10`,
    ),
    check(
      "session_feedback_pain_before_check",
      sql`${table.painBefore} IS NULL OR ${table.painBefore} BETWEEN 0 AND 10`,
    ),
    check(
      "session_feedback_pain_after_check",
      sql`${table.painAfter} IS NULL OR ${table.painAfter} BETWEEN 0 AND 10`,
    ),
  ],
);

export const commerceOrders = pgTable(
  "commerce_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicRef: varchar("public_ref", { length: 64 }).notNull(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "restrict" }),
    originatingGymSessionId: uuid("originating_gym_session_id").references(() => gymSessions.id, {
      onDelete: "set null",
    }),
    productKey: varchar("product_key", { length: 128 }).notNull(),
    payerKind: commercePayerKindEnum("payer_kind").notNull(),
    provider: commerceProviderEnum("provider"),
    initiatedVia: varchar("initiated_via", { length: 24 }).notNull(),
    initialTemplateId: varchar("initial_template_id", { length: 96 }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: varchar("currency", { length: 12 }).notNull(),
    status: commerceOrderStatusEnum("status").notNull().default("created"),
    providerPaymentRef: text("provider_payment_ref"),
    receiptDigest: varchar("receipt_digest", { length: 64 }),
    activeProviderSetupId: uuid("active_provider_setup_id").references(
      (): AnyPgColumn => paymentProviderSetups.id,
      { onDelete: "restrict" },
    ),
    capabilityVersion: integer("capability_version"),
    capabilityDigest: varchar("capability_digest", { length: 64 }),
    capabilityExpiresAt: timestamp("capability_expires_at", { withTimezone: true }),
    budgetReservationId: uuid("budget_reservation_id").references(
      (): AnyPgColumn => agentBudgetReservations.id,
      { onDelete: "restrict" },
    ),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    failureCode: varchar("failure_code", { length: 96 }),
    duplicateOfOrderId: uuid("duplicate_of_order_id").references(
      (): AnyPgColumn => commerceOrders.id,
      { onDelete: "restrict" },
    ),
    refundReference: text("refund_reference"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("commerce_orders_public_ref_uidx").on(table.publicRef),
    unique("commerce_orders_id_amount_unique").on(table.id, table.amountMinor),
    uniqueIndex("commerce_orders_provider_payment_uidx")
      .on(table.provider, table.providerPaymentRef)
      .where(sql`${table.providerPaymentRef} IS NOT NULL`),
    uniqueIndex("commerce_orders_one_payable_entitlement_idx")
      .on(table.patientId, table.productKey)
      .where(
        sql`${table.status} IN ('created', 'provider_pending', 'payment_submitted', 'reconciliation_required', 'paid_unfulfilled')`,
      ),
    index("commerce_orders_patient_created_idx").on(table.patientId, table.createdAt),
    check("commerce_orders_amount_positive_check", sql`${table.amountMinor} > 0`),
    check(
      "commerce_orders_initiated_via_check",
      sql`${table.initiatedVia} IN ('site-ui', 'webmcp')`,
    ),
    check(
      "commerce_orders_currency_lower_check",
      sql`${table.currency} = lower(${table.currency})`,
    ),
    check(
      "commerce_orders_capability_pair_check",
      sql`(
        (${table.capabilityVersion} IS NULL)::int
        + (${table.capabilityDigest} IS NULL)::int
        + (${table.capabilityExpiresAt} IS NULL)::int
      ) IN (0, 3)`,
    ),
    check(
      "commerce_orders_receipt_digest_check",
      sql`${table.receiptDigest} IS NULL OR ${table.receiptDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "commerce_orders_capability_version_check",
      sql`${table.capabilityVersion} IS NULL OR ${table.capabilityVersion} > 0`,
    ),
    check(
      "commerce_orders_capability_digest_check",
      sql`${table.capabilityDigest} IS NULL OR ${table.capabilityDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "commerce_orders_capability_provider_check",
      sql`${table.capabilityDigest} IS NULL OR (${table.provider} IS NOT NULL AND ${table.provider} = 'mpp_tempo')`,
    ),
  ],
);

export const paymentProviderSetups = pgTable(
  "payment_provider_setups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => commerceOrders.id, { onDelete: "restrict" }),
    provider: commerceProviderEnum("provider").notNull(),
    version: integer("version").notNull().default(1),
    status: providerSetupStatusEnum("status").notNull().default("prepared"),
    idempotencyKey: varchar("idempotency_key", { length: 255 }).notNull(),
    requestParams: jsonb("request_params").$type<Record<string, unknown>>().notNull(),
    requestParamsCanonical: text("request_params_canonical").notNull(),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
    requestedExpiresAt: timestamp("requested_expires_at", { withTimezone: true }).notNull(),
    preparedAt: timestamp("prepared_at", { withTimezone: true }).notNull().defaultNow(),
    firstRequestStartedAt: timestamp("first_request_started_at", { withTimezone: true }),
    idempotencyReplayUntil: timestamp("idempotency_replay_until", { withTimezone: true }).notNull(),
    requestStartedAt: timestamp("request_started_at", { withTimezone: true }),
    leaseOwnerHash: varchar("lease_owner_hash", { length: 64 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    providerResourceId: text("provider_resource_id"),
    providerCreatedAt: timestamp("provider_created_at", { withTimezone: true }),
    providerExpiresAt: timestamp("provider_expires_at", { withTimezone: true }),
    attachedAt: timestamp("attached_at", { withTimezone: true }),
    lastErrorCode: varchar("last_error_code", { length: 96 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("payment_provider_setups_order_provider_version_uidx").on(
      table.orderId,
      table.provider,
      table.version,
    ),
    uniqueIndex("payment_provider_setups_idempotency_uidx").on(table.idempotencyKey),
    uniqueIndex("payment_provider_setups_resource_uidx")
      .on(table.providerResourceId)
      .where(sql`${table.providerResourceId} IS NOT NULL`),
    uniqueIndex("payment_provider_setups_one_nonterminal_idx")
      .on(table.orderId)
      .where(
        sql`${table.status} IN ('prepared', 'requesting', 'attached', 'reconciliation_required')`,
      ),
    check("payment_provider_setups_version_check", sql`${table.version} > 0`),
    check(
      "payment_provider_setups_fingerprint_check",
      sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "payment_provider_setups_snapshot_json_check",
      sql`${table.requestParams} = ${table.requestParamsCanonical}::jsonb`,
    ),
    check(
      "payment_provider_setups_snapshot_digest_check",
      sql`${table.requestFingerprint} = encode(digest(${table.requestParamsCanonical}, 'sha256'), 'hex')`,
    ),
    check(
      "payment_provider_setups_lease_owner_hash_check",
      sql`${table.leaseOwnerHash} IS NULL OR ${table.leaseOwnerHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "payment_provider_setups_attached_check",
      sql`(
        ${table.status} = 'attached'
        AND ${table.providerResourceId} IS NOT NULL
        AND ${table.attachedAt} IS NOT NULL
      ) OR ${table.status} <> 'attached'`,
    ),
    check(
      "payment_provider_setups_replay_window_check",
      sql`${table.idempotencyReplayUntil} > ${table.preparedAt}`,
    ),
  ],
);

export const entitlementGrants = pgTable(
  "entitlement_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "restrict" }),
    entitlementKey: varchar("entitlement_key", { length: 128 }).notNull(),
    sourceOrderId: uuid("source_order_id")
      .notNull()
      .references(() => commerceOrders.id, { onDelete: "restrict" }),
    status: entitlementGrantStatusEnum("status").notNull().default("active"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("entitlement_grants_active_patient_key_uidx")
      .on(table.patientId, table.entitlementKey)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex("entitlement_grants_source_order_uidx").on(table.sourceOrderId),
    check(
      "entitlement_grants_revoked_check",
      sql`(${table.status} = 'revoked') = (${table.revokedAt} IS NOT NULL)`,
    ),
  ],
);

export const savedRoutines = pgTable(
  "saved_routines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "restrict" }),
    sourceGymSessionId: uuid("source_gym_session_id")
      .notNull()
      .references(() => gymSessions.id, { onDelete: "restrict" }),
    entitlementGrantId: uuid("entitlement_grant_id")
      .notNull()
      .references(() => entitlementGrants.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    plan: jsonb("plan").$type<Record<string, unknown>>().notNull(),
    planHash: varchar("plan_hash", { length: 64 }).notNull(),
    templateId: varchar("template_id", { length: 96 }).notNull(),
    templateVersion: varchar("template_version", { length: 24 }).notNull(),
    catalogVersion: varchar("catalog_version", { length: 64 }).notNull(),
    createdVia: varchar("created_via", { length: 24 }).notNull(),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("saved_routines_session_template_uidx").on(
      table.patientId,
      table.sourceGymSessionId,
      table.templateId,
    ),
    index("saved_routines_patient_saved_idx").on(table.patientId, table.savedAt),
    check("saved_routines_plan_hash_check", sql`${table.planHash} ~ '^[0-9a-f]{64}$'`),
    check("saved_routines_created_via_check", sql`${table.createdVia} IN ('site-ui', 'webmcp')`),
  ],
);

export const agentBudgetBuckets = pgTable(
  "agent_budget_buckets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentSubject: varchar("agent_subject", { length: 128 }).notNull(),
    budgetDate: date("budget_date", { mode: "string" }).notNull(),
    currency: varchar("currency", { length: 12 }).notNull(),
    limitMinor: integer("limit_minor").notNull(),
    reservedMinor: integer("reserved_minor").notNull().default(0),
    settledMinor: integer("settled_minor").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("agent_budget_buckets_subject_date_currency_uidx").on(
      table.agentSubject,
      table.budgetDate,
      table.currency,
    ),
    check(
      "agent_budget_buckets_nonnegative_check",
      sql`${table.limitMinor} >= 0 AND ${table.reservedMinor} >= 0 AND ${table.settledMinor} >= 0`,
    ),
    check(
      "agent_budget_buckets_currency_lower_check",
      sql`${table.currency} = lower(${table.currency})`,
    ),
    check(
      "agent_budget_buckets_cap_check",
      sql`${table.reservedMinor} + ${table.settledMinor} <= ${table.limitMinor}`,
    ),
  ],
);

export const agentBudgetReservations = pgTable(
  "agent_budget_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bucketId: uuid("bucket_id")
      .notNull()
      .references(() => agentBudgetBuckets.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => commerceOrders.id, { onDelete: "restrict" }),
    amountMinor: integer("amount_minor").notNull(),
    status: agentBudgetReservationStatusEnum("status").notNull().default("reserved"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releaseReason: varchar("release_reason", { length: 128 }),
    lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("agent_budget_reservations_order_uidx").on(table.orderId),
    index("agent_budget_reservations_bucket_status_idx").on(table.bucketId, table.status),
    foreignKey({
      columns: [table.orderId, table.amountMinor],
      foreignColumns: [commerceOrders.id, commerceOrders.amountMinor],
      name: "agent_budget_reservations_order_amount_fk",
    }).onDelete("restrict"),
    check("agent_budget_reservations_amount_check", sql`${table.amountMinor} > 0`),
  ],
);

export const paymentProviderEvents = pgTable(
  "payment_provider_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: commerceProviderEnum("provider").notNull(),
    providerEventId: varchar("provider_event_id", { length: 255 }).notNull(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => commerceOrders.id, { onDelete: "restrict" }),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    payloadDigest: varchar("payload_digest", { length: 64 }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    outcome: varchar("outcome", { length: 96 }),
  },
  (table) => [
    uniqueIndex("payment_provider_events_provider_event_uidx").on(
      table.provider,
      table.providerEventId,
    ),
    index("payment_provider_events_order_received_idx").on(table.orderId, table.receivedAt),
    check("payment_provider_events_digest_check", sql`${table.payloadDigest} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const mppReplayStore = pgTable(
  "mpp_replay_store",
  {
    key: varchar("key", { length: 512 }).primaryKey(),
    value: jsonb("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("mpp_replay_store_expiry_idx").on(table.expiresAt)],
);

export const commerceRateLimits = pgTable(
  "commerce_rate_limits",
  {
    keyHash: varchar("key_hash", { length: 64 }).primaryKey(),
    dimension: varchar("dimension", { length: 16 }).notNull(),
    hitCount: integer("hit_count").notNull().default(1),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    index("commerce_rate_limits_expiry_idx").on(table.expiresAt),
    check("commerce_rate_limits_hash_check", sql`${table.keyHash} ~ '^[0-9a-f]{64}$'`),
    check(
      "commerce_rate_limits_dimension_check",
      sql`${table.dimension} IN ('session', 'order', 'ip', 'agent')`,
    ),
    check("commerce_rate_limits_hit_count_check", sql`${table.hitCount} > 0`),
    check("commerce_rate_limits_window_check", sql`${table.expiresAt} > ${table.windowStartedAt}`),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    patientId: uuid("patient_id").references(() => patients.id, { onDelete: "set null" }),
    action: varchar("action", { length: 96 }).notNull(),
    resourceType: varchar("resource_type", { length: 80 }).notNull(),
    resourceId: uuid("resource_id"),
    outcome: auditOutcomeEnum("outcome").notNull(),
    requestId: varchar("request_id", { length: 128 }),
    ipHash: varchar("ip_hash", { length: 64 }),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [
    index("audit_events_patient_time_idx").on(table.patientId, table.occurredAt),
    index("audit_events_actor_time_idx").on(table.actorUserId, table.occurredAt),
    index("audit_events_action_time_idx").on(table.action, table.occurredAt),
    check(
      "audit_events_ip_hash_check",
      sql`${table.ipHash} IS NULL OR ${table.ipHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type AccessGrant = typeof accessGrants.$inferSelect;
export type ContextGrant = typeof contextGrants.$inferSelect;
export type Equipment = typeof equipment.$inferSelect;
export type CommerceOrder = typeof commerceOrders.$inferSelect;
export type PaymentProviderSetup = typeof paymentProviderSetups.$inferSelect;
export type EntitlementGrant = typeof entitlementGrants.$inferSelect;
export type SavedRoutine = typeof savedRoutines.$inferSelect;
