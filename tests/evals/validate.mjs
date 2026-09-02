import { readFile } from "node:fs/promises";

const fixtureUrl = new URL("./webmcp-evals.json", import.meta.url);
const data = JSON.parse(await readFile(fixtureUrl, "utf8"));
const catalogUrl = new URL("../../packages/webmcp/schemas/tool-schemas.json", import.meta.url);
const catalog = JSON.parse(await readFile(catalogUrl, "utf8"));

const failures = [];
const fail = (message) => failures.push(message);

if (data.syntheticOnly !== true) fail("Dataset must be syntheticOnly=true.");
if (!/^\d+\.\d+\.\d+$/.test(data.datasetVersion ?? "")) fail("datasetVersion must be semver.");
if (!Array.isArray(data.cases)) fail("cases must be an array.");
if (data.cases?.length !== 17) fail(`Expected exactly 17 cases; found ${data.cases?.length ?? 0}.`);

const ids = new Set();
const catalogSection = {
  "passport-owner": "passport",
  "passport-clinician": "doctor",
  gym: "gym",
};

const expectedCatalogs = {
  passport: [
    "get_my_passport_summary",
    "list_my_shares",
    "create_context_grant",
    "revoke_access_grant",
  ],
  doctor: [
    "search_my_patients",
    "get_patient_overview",
    "get_patient_section",
    "open_patient_source",
    "add_clinical_guidance",
  ],
  gym: [
    "get_gym_profile",
    "search_equipment",
    "get_equipment",
    "get_active_context",
    "get_routine_pro_offer",
    "get_routine_pro_status",
    "create_personalized_routine",
    "record_session_feedback",
  ],
};

const expectedRouteCatalogs = {
  "passport-owner": {
    "/": ["get_my_passport_summary", "list_my_shares"],
    "/sharing": ["list_my_shares", "create_context_grant", "revoke_access_grant"],
  },
  "passport-clinician": {
    "/doctor": expectedCatalogs.doctor,
  },
  gym: {
    "/equipment": ["get_gym_profile", "search_equipment", "get_equipment"],
    "/passport": ["get_gym_profile", "get_active_context", "get_routine_pro_status"],
    "/session": [
      "get_gym_profile",
      "search_equipment",
      "get_equipment",
      "get_active_context",
      "get_routine_pro_offer",
      "get_routine_pro_status",
      "create_personalized_routine",
    ],
  },
};

const retiredTools = [
  ["get", "patient", "changes"].join("_"),
  ["create", "session", "draft"].join("_"),
];
const serializedInputs = `${JSON.stringify(data)}\n${JSON.stringify(catalog)}`;
for (const retired of retiredTools) {
  if (serializedInputs.includes(retired))
    fail(`Retired tool remains in fixtures or schema: ${retired}.`);
}

for (const [sectionName, expectedNames] of Object.entries(expectedCatalogs)) {
  const registry = catalog.properties?.[sectionName]?.properties ?? {};
  const actualNames = Object.keys(registry);
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    fail(
      `${sectionName} catalog mismatch. Expected ${expectedNames.join(", ")}; found ${actualNames.join(", ")}.`,
    );
  }
}

function resolveSchema(schema) {
  if (!schema?.$ref?.startsWith("#/")) return schema;
  return schema.$ref
    .slice(2)
    .split("/")
    .reduce((value, key) => value?.[key.replaceAll("~1", "/").replaceAll("~0", "~")], catalog);
}

function validateValue(value, unresolvedSchema, at) {
  const schema = resolveSchema(unresolvedSchema);
  if (!schema) {
    fail(`${at} references a missing schema.`);
    return;
  }
  if ("const" in schema && value !== schema.const) fail(`${at} does not match its const value.`);
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    fail(`${at} is not one of the allowed enum values.`);
  }

  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      fail(`${at} must be an object.`);
      return;
    }
    for (const required of schema.required ?? []) {
      if (!(required in value)) fail(`${at}.${required} is required.`);
    }
    for (const [key, item] of Object.entries(value)) {
      const propertySchema = schema.properties?.[key];
      if (!propertySchema) {
        if (schema.additionalProperties === false) fail(`${at}.${key} is not allowed.`);
        continue;
      }
      validateValue(item, propertySchema, `${at}.${key}`);
    }
    return;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      fail(`${at} must be an array.`);
      return;
    }
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      fail(`${at} has fewer than ${schema.minItems} items.`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      fail(`${at} has more than ${schema.maxItems} items.`);
    }
    if (
      schema.uniqueItems &&
      new Set(value.map((item) => JSON.stringify(item))).size !== value.length
    ) {
      fail(`${at} must contain unique items.`);
    }
    for (const [index, item] of value.entries()) {
      validateValue(item, schema.items ?? {}, `${at}[${index}]`);
    }
    return;
  }

  if (schema.type === "string") {
    if (typeof value !== "string") {
      fail(`${at} must be a string.`);
      return;
    }
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      fail(`${at} is shorter than ${schema.minLength} characters.`);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      fail(`${at} is longer than ${schema.maxLength} characters.`);
    }
    if (schema.format === "date-time" && !Number.isFinite(Date.parse(value))) {
      fail(`${at} must be a valid date-time.`);
    }
    return;
  }

  if (schema.type === "boolean" && typeof value !== "boolean") fail(`${at} must be a boolean.`);
  if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail(`${at} must be a finite number.`);
      return;
    }
    if (schema.type === "integer" && !Number.isInteger(value)) fail(`${at} must be an integer.`);
    if (schema.minimum !== undefined && value < schema.minimum) {
      fail(`${at} must be at least ${schema.minimum}.`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      fail(`${at} must be at most ${schema.maximum}.`);
    }
  }
}

for (const [index, testCase] of (data.cases ?? []).entries()) {
  const at = `cases[${index}]`;
  if (!/^AW-EVAL-\d{3}$/.test(testCase.id ?? "")) fail(`${at}.id is invalid.`);
  if (ids.has(testCase.id)) fail(`${at}.id is duplicated: ${testCase.id}.`);
  ids.add(testCase.id);
  if (!testCase.title) fail(`${at}.title is required.`);
  if (!["passport-owner", "passport-clinician", "gym"].includes(testCase.surface)) {
    fail(`${at}.surface is invalid.`);
  }
  if (!Array.isArray(testCase.messages) || testCase.messages.length === 0) {
    fail(`${at}.messages must be non-empty.`);
  }
  if (!Array.isArray(testCase.availableTools) || testCase.availableTools.length === 0) {
    fail(`${at}.availableTools must be non-empty.`);
  }
  if (new Set(testCase.availableTools ?? []).size !== (testCase.availableTools ?? []).length) {
    fail(`${at}.availableTools contains duplicates.`);
  }
  if (!Array.isArray(testCase.expectedCalls)) fail(`${at}.expectedCalls must be an array.`);
  if (!testCase.assertions?.outcome) fail(`${at}.assertions.outcome is required.`);
  const max = testCase.assertions?.resultMaxChars;
  if (!Number.isInteger(max) || max < 1 || max > 1500) {
    fail(`${at}.assertions.resultMaxChars must be an integer from 1 to 1500.`);
  }
  const sectionName = catalogSection[testCase.surface];
  const registry = catalog.properties?.[sectionName]?.properties ?? {};
  const route = testCase.initialState?.route;
  const expectedRouteTools = expectedRouteCatalogs[testCase.surface]?.[route];
  if (!expectedRouteTools) {
    fail(`${at}.initialState.route is not a registered ${testCase.surface} eval route: ${route}.`);
  } else if (JSON.stringify(testCase.availableTools) !== JSON.stringify(expectedRouteTools)) {
    fail(`${at}.availableTools must equal the complete ${testCase.surface} registry for ${route}.`);
  }
  for (const name of testCase.availableTools ?? []) {
    if (!registry[name]) fail(`${at} exposes unknown ${testCase.surface} tool ${name}.`);
    if (name.length > 30) fail(`${at} tool name exceeds the 30-character budget: ${name}.`);
  }
  for (const expected of testCase.expectedCalls ?? []) {
    if (!testCase.availableTools.includes(expected.functionName)) {
      fail(`${at} expects unavailable tool ${expected.functionName}.`);
    }
    const inputSchema = resolveSchema(registry[expected.functionName]);
    const input = expected.arguments ?? {};
    validateValue(input, inputSchema, `${at}.${expected.functionName}.arguments`);
  }
  const orderedCalls = testCase.assertions?.mustCallInOrder;
  if (orderedCalls !== undefined) {
    if (!Array.isArray(orderedCalls)) {
      fail(`${at}.assertions.mustCallInOrder must be an array.`);
    } else {
      const expectedNames = (testCase.expectedCalls ?? []).map(({ functionName }) => functionName);
      if (JSON.stringify(orderedCalls) !== JSON.stringify(expectedNames)) {
        fail(`${at}.assertions.mustCallInOrder must match expectedCalls exactly.`);
      }
    }
  }
  for (const forbidden of testCase.assertions?.mustNotCall ?? []) {
    if (!testCase.availableTools.includes(forbidden)) {
      fail(`${at} forbids a tool not in the simulated registry: ${forbidden}.`);
    }
  }
  for (const forbidden of testCase.assertions?.mustNotExpose ?? []) {
    if (!registry[forbidden]) fail(`${at} references unknown hidden tool ${forbidden}.`);
    if (testCase.availableTools.includes(forbidden)) {
      fail(`${at} exposes route-forbidden tool ${forbidden}.`);
    }
  }
}

const gymRegistry = catalog.properties?.gym?.properties ?? {};
const personalizedSchema = resolveSchema(gymRegistry.create_personalized_routine);
if (personalizedSchema?.properties?.templateId) {
  fail("create_personalized_routine must not accept templateId.");
}
if (!personalizedSchema?.required?.includes("routine")) {
  fail("create_personalized_routine must require the exact structured routine.");
}
if (!gymRegistry.get_routine_pro_status) {
  fail("The read-only get_routine_pro_status input schema is required.");
}

const proCase = (data.cases ?? []).find(({ id }) => id === "AW-EVAL-017");
if (!proCase) {
  fail("AW-EVAL-017 is required.");
} else {
  const chain = proCase.assertions?.mustCallInOrder ?? [];
  const expectedChain = [
    "get_gym_profile",
    "get_active_context",
    "search_equipment",
    "get_equipment",
    "get_routine_pro_offer",
    "create_personalized_routine",
  ];
  if (JSON.stringify(chain) !== JSON.stringify(expectedChain)) {
    fail("AW-EVAL-017 must preserve the free-context-and-inventory-to-confirmed-Pro chain.");
  }
  if (proCase.assertions?.requiresHumanConfirmation !== true) {
    fail("AW-EVAL-017 must require first-party human confirmation.");
  }
  if (
    proCase.assertions?.expectedAmountMinor !== 499 ||
    proCase.assertions?.expectedCurrency !== "usd"
  ) {
    fail("AW-EVAL-017 must use the exact server-authoritative 499 usd sandbox offer.");
  }
  const personalizedCall = proCase.expectedCalls?.find(
    ({ functionName }) => functionName === "create_personalized_routine",
  );
  if (!personalizedCall?.arguments?.routine) {
    fail("AW-EVAL-017 must submit the complete agent-generated routine.");
  }
  if ("templateId" in (personalizedCall?.arguments ?? {})) {
    fail("AW-EVAL-017 must not submit a templateId.");
  }
}

if (failures.length) {
  console.error(`WebMCP eval fixture validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Structurally validated ${data.cases.length} synthetic WebMCP eval fixtures (${data.datasetVersion}); no model was executed.`,
  );
}
