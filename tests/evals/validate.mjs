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

function resolveSchema(schema) {
  if (!schema?.$ref?.startsWith("#/")) return schema;
  return schema.$ref
    .slice(2)
    .split("/")
    .reduce((value, key) => value?.[key.replaceAll("~1", "/").replaceAll("~0", "~")], catalog);
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
  if (!Array.isArray(testCase.expectedCalls)) fail(`${at}.expectedCalls must be an array.`);
  if (!testCase.assertions?.outcome) fail(`${at}.assertions.outcome is required.`);
  const max = testCase.assertions?.resultMaxChars;
  if (!Number.isInteger(max) || max < 1 || max > 1500) {
    fail(`${at}.assertions.resultMaxChars must be an integer from 1 to 1500.`);
  }
  const sectionName = catalogSection[testCase.surface];
  const registry = catalog.properties?.[sectionName]?.properties ?? {};
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
    for (const required of inputSchema?.required ?? []) {
      if (!(required in input)) fail(`${at} omits required ${expected.functionName}.${required}.`);
    }
    if (inputSchema?.additionalProperties === false) {
      for (const key of Object.keys(input)) {
        if (!(key in (inputSchema.properties ?? {}))) {
          fail(`${at} passes unknown ${expected.functionName} argument ${key}.`);
        }
      }
    }
  }
  for (const forbidden of testCase.assertions?.mustNotCall ?? []) {
    if (!testCase.availableTools.includes(forbidden)) {
      fail(`${at} forbids a tool not in the simulated registry: ${forbidden}.`);
    }
  }
}

if (failures.length) {
  console.error(`WebMCP eval fixture validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Validated ${data.cases.length} synthetic WebMCP eval fixtures (${data.datasetVersion}).`,
  );
}
