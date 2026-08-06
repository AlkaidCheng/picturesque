import assert from "node:assert/strict";

import { test } from "vitest";

import {
  canExportAnimatedGif,
  coerceExportLongEdge,
  comparisonArchiveFilename,
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

test("comparison ZIP names identify the project, collections, and mode", () => {
  assert.equal(
    comparisonArchiveFilename({
      projectName: "Seahorse Girl P",
      leftCollectionName: "Raw",
      rightCollectionName: "Official Second Edit Clean",
      comparisonMode: "blink"
    }),
    "seahorse-girl-p_raw-vs-official-second-edit-clean_blink.zip"
  );

  const reversed = comparisonArchiveFilename({
    projectName: "Seahorse Girl P",
    leftCollectionName: "Official Second Edit Clean",
    rightCollectionName: "Raw",
    comparisonMode: "blink"
  });
  assert.equal(reversed, "seahorse-girl-p_official-second-edit-clean-vs-raw_blink.zip");
});

test("comparison ZIP names normalize unsafe separators without discarding non-Latin names", () => {
  assert.equal(
    comparisonArchiveFilename({
      projectName: " Étude / Summer ",
      leftCollectionName: "RAW_set",
      rightCollectionName: "Final: edit",
      comparisonMode: "difference"
    }),
    "étude-summer_raw-set-vs-final-edit_difference.zip"
  );
  assert.equal(
    comparisonArchiveFilename({
      projectName: "海马体 项目",
      leftCollectionName: "原图",
      rightCollectionName: "第一版",
      comparisonMode: "overlay"
    }),
    "海马体-项目_原图-vs-第一版_overlay.zip"
  );
  assert.equal(
    comparisonArchiveFilename({
      projectName: "चित्र तुलना",
      leftCollectionName: "मूल",
      rightCollectionName: "संपादित",
      comparisonMode: "overlay"
    }),
    "चित्र-तुलना_मूल-vs-संपादित_overlay.zip"
  );
  assert.equal(
    comparisonArchiveFilename({
      projectName: "Girl's $(Project)",
      leftCollectionName: "../Raw [A]",
      rightCollectionName: "Final & Clean",
      comparisonMode: "side"
    }),
    "girls-project_raw-a-vs-final-clean_side.zip"
  );
});

test("comparison ZIP names provide stable fallbacks and support one collection", () => {
  assert.equal(
    comparisonArchiveFilename({
      projectName: "***",
      leftCollectionName: "",
      rightCollectionName: "...",
      comparisonMode: ""
    }),
    "project_set-a-vs-set-b_comparison.zip"
  );
  assert.equal(
    comparisonArchiveFilename({
      projectName: "Contact Sheet",
      leftCollectionName: "Selections",
      rightCollectionName: null,
      comparisonMode: "side"
    }),
    "contact-sheet_selections_side.zip"
  );
});

test("comparison ZIP names stay below portable filename limits", () => {
  const filename = comparisonArchiveFilename({
    projectName: "海".repeat(100),
    leftCollectionName: "left".repeat(30),
    rightCollectionName: "right".repeat(30),
    comparisonMode: "difference".repeat(20)
  });
  assert.ok(new TextEncoder().encode(filename).byteLength <= 202);
  assert.match(filename, /_.+-vs-.+_.+\.zip$/u);
});

test("comparison ZIP names distinguish long components with matching prefixes", () => {
  const sharedPrefix = "Official Second Edit Clean Generated Upscaled Version ";
  const first = comparisonArchiveFilename({
    projectName: "Seahorse Girl P",
    leftCollectionName: `${sharedPrefix}${"A".repeat(80)}`,
    rightCollectionName: "Raw",
    comparisonMode: "overlay"
  });
  const second = comparisonArchiveFilename({
    projectName: "Seahorse Girl P",
    leftCollectionName: `${sharedPrefix}${"B".repeat(80)}`,
    rightCollectionName: "Raw",
    comparisonMode: "overlay"
  });

  assert.notEqual(first, second);
  assert.equal(
    first,
    comparisonArchiveFilename({
      projectName: "Seahorse Girl P",
      leftCollectionName: `${sharedPrefix}${"A".repeat(80)}`,
      rightCollectionName: "Raw",
      comparisonMode: "overlay"
    })
  );
  assert.match(first, /-[0-9a-f]{8}-vs-raw_overlay\.zip$/u);
  assert.match(second, /-[0-9a-f]{8}-vs-raw_overlay\.zip$/u);
});

test("duplicate export names receive deterministic case-insensitive suffixes", () => {
  const used = new Set<string>();
  assert.equal(uniqueExportFilename("portrait-blink.gif", used), "portrait-blink.gif");
  assert.equal(uniqueExportFilename("portrait-blink.gif", used), "portrait-blink-2.gif");
  assert.equal(uniqueExportFilename("PORTRAIT-blink.gif", used), "PORTRAIT-blink-3.gif");
});
