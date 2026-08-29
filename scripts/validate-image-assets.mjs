#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const ignoredDirectories = new Set([
  ".next",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

const textExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mdx",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

function relativePath(filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join("/");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function fail(message) {
  errors.push(message);
}

async function listFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      fail(`Required directory is missing: ${relativePath(directory)}`);
      return [];
    }
    throw error;
  }

  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function parsePngDimensions(buffer) {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error("not a valid PNG file (signature or IHDR is missing)");
  }
  if (buffer.toString("ascii", 12, 16) !== "IHDR" || buffer.readUInt32BE(8) !== 13) {
    throw new Error("not a valid PNG file (the first chunk is not a 13-byte IHDR)");
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width === 0 || height === 0) {
    throw new Error(`has invalid PNG dimensions ${width}x${height}`);
  }
  return { width, height };
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function parseWebpDimensions(buffer) {
  if (
    buffer.length < 20 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw new Error("not a valid WebP file (RIFF/WEBP header is missing)");
  }

  const declaredLength = buffer.readUInt32LE(4) + 8;
  if (declaredLength !== buffer.length) {
    throw new Error(
      `has a WebP RIFF length mismatch (header ${declaredLength} bytes, file ${buffer.length} bytes)`,
    );
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkLength = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + chunkLength;
    if (dataEnd > buffer.length) {
      throw new Error(`contains a truncated ${JSON.stringify(chunkType)} WebP chunk`);
    }

    if (chunkType === "VP8X") {
      if (chunkLength < 10) throw new Error("contains a truncated VP8X header");
      return {
        width: readUInt24LE(buffer, dataOffset + 4) + 1,
        height: readUInt24LE(buffer, dataOffset + 7) + 1,
      };
    }

    if (chunkType === "VP8 ") {
      if (chunkLength < 10) throw new Error("contains a truncated VP8 frame header");
      if (
        buffer[dataOffset + 3] !== 0x9d ||
        buffer[dataOffset + 4] !== 0x01 ||
        buffer[dataOffset + 5] !== 0x2a
      ) {
        throw new Error("contains an invalid VP8 key-frame signature");
      }
      return {
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }

    if (chunkType === "VP8L") {
      if (chunkLength < 5 || buffer[dataOffset] !== 0x2f) {
        throw new Error("contains an invalid or truncated VP8L frame header");
      }
      const dimensionBits = buffer.readUInt32LE(dataOffset + 1);
      return {
        width: (dimensionBits & 0x3fff) + 1,
        height: ((dimensionBits >>> 14) & 0x3fff) + 1,
      };
    }

    offset = dataEnd + (chunkLength % 2);
  }

  throw new Error("does not contain a VP8, VP8L, or VP8X image chunk");
}

async function validateImage({ filePath, format, width, height, maxBytes }) {
  let buffer;
  let fileStats;
  try {
    [buffer, fileStats] = await Promise.all([readFile(filePath), stat(filePath)]);
  } catch (error) {
    if (error?.code === "ENOENT") {
      fail(`Required ${format.toUpperCase()} asset is missing: ${relativePath(filePath)}`);
      return;
    }
    throw error;
  }

  if (!fileStats.isFile()) {
    fail(`Expected a file at ${relativePath(filePath)}`);
    return;
  }

  if (fileStats.size > maxBytes) {
    fail(
      `${relativePath(filePath)} is ${formatBytes(fileStats.size)}; maximum is ${formatBytes(maxBytes)}`,
    );
  }

  let dimensions;
  try {
    dimensions = format === "png" ? parsePngDimensions(buffer) : parseWebpDimensions(buffer);
  } catch (error) {
    fail(`${relativePath(filePath)} ${error.message}`);
    return;
  }

  if (dimensions.width !== width || dimensions.height !== height) {
    fail(
      `${relativePath(filePath)} is ${dimensions.width}x${dimensions.height}; expected ${width}x${height}`,
    );
  }
}

async function validateNoSvgAssets() {
  const appRoots = [
    path.join(repositoryRoot, "apps/gym"),
    path.join(repositoryRoot, "apps/passport"),
  ];
  const appFiles = (await Promise.all(appRoots.map((root) => listFiles(root)))).flat();
  const svgFiles = appFiles.filter((filePath) => path.extname(filePath).toLowerCase() === ".svg");
  for (const svgFile of svgFiles) {
    fail(`SVG source asset remains: ${relativePath(svgFile)}`);
  }

  const scanRoots = [path.join(repositoryRoot, "apps"), path.join(repositoryRoot, "packages")];
  const filesToScan = (await Promise.all(scanRoots.map((root) => listFiles(root)))).flat();
  filesToScan.push(path.join(repositoryRoot, "THIRD_PARTY_NOTICES.md"));

  for (const filePath of filesToScan) {
    if (!textExtensions.has(path.extname(filePath).toLowerCase())) continue;
    let content;
    try {
      content = await readFile(filePath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        fail(`Required reference file is missing: ${relativePath(filePath)}`);
        continue;
      }
      throw error;
    }

    content.split(/\r?\n/u).forEach((line, index) => {
      if (!/\.svg\b/iu.test(line)) return;
      const excerpt = line.trim().replaceAll(/\s+/gu, " ").slice(0, 180);
      fail(
        `SVG asset reference remains at ${relativePath(filePath)}:${index + 1}${excerpt ? ` (${excerpt})` : ""}`,
      );
    });
  }
}

async function validateHero() {
  await validateImage({
    filePath: path.join(repositoryRoot, "apps/gym/public/images/adaptive-gym-interior.webp"),
    format: "webp",
    width: 1600,
    height: 1000,
    maxBytes: 250 * 1024,
  });
}

async function readEquipmentSlugs() {
  const sourcePath = path.join(repositoryRoot, "packages/demo-data/src/equipment.ts");
  const source = await readFile(sourcePath, "utf8");
  const slugs = [...source.matchAll(/\bslug\s*:\s*["']([a-z0-9]+(?:-[a-z0-9]+)*)["']/gu)].map(
    (match) => match[1],
  );
  const uniqueSlugs = [...new Set(slugs)];

  if (slugs.length !== 12 || uniqueSlugs.length !== 12) {
    fail(
      `Expected 12 unique equipment slugs in ${relativePath(sourcePath)}, found ${slugs.length} entries and ${uniqueSlugs.length} unique values`,
    );
  }
  return uniqueSlugs;
}

async function validateEquipment() {
  const equipmentDirectory = path.join(repositoryRoot, "apps/gym/public/images/equipment");
  const expectedSlugs = await readEquipmentSlugs();
  let entries;
  try {
    entries = await readdir(equipmentDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      fail(`Required equipment image directory is missing: ${relativePath(equipmentDirectory)}`);
      return;
    }
    throw error;
  }

  const webpFiles = entries
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".webp")
    .map((entry) => entry.name)
    .sort();
  if (webpFiles.length !== 12) {
    fail(
      `${relativePath(equipmentDirectory)} must contain exactly 12 WebP files; found ${webpFiles.length}`,
    );
  }

  const actualSlugs = webpFiles.map((fileName) => path.basename(fileName, path.extname(fileName)));
  const missingSlugs = expectedSlugs.filter((slug) => !actualSlugs.includes(slug)).sort();
  const unexpectedSlugs = actualSlugs.filter((slug) => !expectedSlugs.includes(slug)).sort();
  if (missingSlugs.length > 0) {
    fail(`Equipment WebPs are missing for demo-data slugs: ${missingSlugs.join(", ")}`);
  }
  if (unexpectedSlugs.length > 0) {
    fail(`Unexpected equipment WebP basenames: ${unexpectedSlugs.join(", ")}`);
  }

  await Promise.all(
    webpFiles.map((fileName) =>
      validateImage({
        filePath: path.join(equipmentDirectory, fileName),
        format: "webp",
        width: 1536,
        height: 1024,
        maxBytes: 120 * 1024,
      }),
    ),
  );
}

async function validateAppIcons() {
  const specs = [
    { relative: "app/icon.png", width: 512, height: 512, maxBytes: 200 * 1024 },
    { relative: "app/apple-icon.png", width: 180, height: 180, maxBytes: 48 * 1024 },
    { relative: "public/icons/icon-192.png", width: 192, height: 192, maxBytes: 48 * 1024 },
    { relative: "public/icons/icon-512.png", width: 512, height: 512, maxBytes: 200 * 1024 },
    {
      relative: "public/icons/icon-maskable-512.png",
      width: 512,
      height: 512,
      maxBytes: 200 * 1024,
    },
  ];

  await Promise.all(
    ["gym", "passport"].flatMap((appName) =>
      specs.map((spec) =>
        validateImage({
          filePath: path.join(repositoryRoot, "apps", appName, spec.relative),
          format: "png",
          width: spec.width,
          height: spec.height,
          maxBytes: spec.maxBytes,
        }),
      ),
    ),
  );
}

await Promise.all([validateNoSvgAssets(), validateHero(), validateEquipment(), validateAppIcons()]);

if (errors.length > 0) {
  console.error(`Image asset validation failed with ${errors.length} issue(s):`);
  for (const message of errors.sort()) console.error(`- ${message}`);
  process.exit(1);
}

console.log(
  "Image asset validation passed: 1 Gym hero WebP, 12 equipment WebPs, 10 PNG app icons, and no SVG assets or references.",
);
