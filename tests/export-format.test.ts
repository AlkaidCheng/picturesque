import assert from "node:assert/strict";

import { test } from "vitest";

import {
  canExportAnimatedGif,
  coerceExportLongEdge,
  defaultExportLongEdge,
  exportExtension,
  exportSizeOptions,
  uniqueExportFilename
} from "../src/export-format.js";

test("export formats use canonical filename extensions", () => {
  assert.equal(exportExtension("png"), "png");
  assert.equal(exportExtension("jpeg"), "jpg");
  assert.equal(exportExtension("gif"), "gif");
});

test("GIF export is available only for two-collection Blink comparisons", () => {
  assert.equal(canExportAnimatedGif("blink", true), true);
  assert.equal(canExportAnimatedGif("blink", false), false);
  assert.equal(canExportAnimatedGif("overlay", true), false);
});

test("GIF sizes are bounded independently from static export sizes", () => {
  assert.deepEqual(exportSizeOptions("gif").map(({ value }) => value), ["640", "960", "1280", "1600"]);
  assert.deepEqual(exportSizeOptions("png").map(({ value }) => value), ["1600", "2400", "3840", "original"]);
  assert.equal(defaultExportLongEdge("gif"), "960");
  assert.equal(defaultExportLongEdge("jpeg"), "2400");
  assert.equal(coerceExportLongEdge("gif", "3840"), "960");
  assert.equal(coerceExportLongEdge("gif", "1280"), "1280");
});

test("duplicate export names receive deterministic case-insensitive suffixes", () => {
  const used = new Set<string>();
  assert.equal(uniqueExportFilename("portrait-blink.gif", used), "portrait-blink.gif");
  assert.equal(uniqueExportFilename("portrait-blink.gif", used), "portrait-blink-2.gif");
  assert.equal(uniqueExportFilename("PORTRAIT-blink.gif", used), "PORTRAIT-blink-3.gif");
});
