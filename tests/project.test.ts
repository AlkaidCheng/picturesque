import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { test } from "vitest";

import type { Pair, PairSettings } from "../src/project.js";
import {
  PROJECT_FORMAT,
  PROJECT_VERSION,
  addCollection,
  addImages,
  autoPair,
  clonePairSettings,
  createImageRecord,
  createProject,
  getActiveCollection,
  getActiveComparison,
  getActivePairs,
  getComparisonMode,
  getImage,
  mapPair,
  normalizeStem,
  parseProject,
  projectSummary,
  removeCollection,
  serializeProject,
  setActiveCollections,
  setComparisonMode,
  setSelectedPairId
} from "../src/project.js";

const versionOneFixture = readFileSync(
  new URL("./fixtures/project-v1.json", import.meta.url),
  "utf8"
);
const versionTwoFixture = readFileSync(
  new URL("./fixtures/project-v2.json", import.meta.url),
  "utf8"
);

const normalizedDefaultPairSettings = {
  background: "#11151b",
  blendMode: "source-over",
  blinkInterval: 700,
  fit: "contain",
  frameRatio: "auto",
  offsetX: 0,
  offsetY: 0,
  opacity: 50,
  orientation: "horizontal",
  rotation: 0,
  scale: 100,
  showGrid: false,
  showLabels: true,
  wipe: 50,
  layers: {
    left: {
      brightness: 100,
      contrast: 100,
      grayscale: 0,
      saturation: 100,
      warmth: 0
    },
    right: {
      brightness: 100,
      contrast: 100,
      grayscale: 0,
      saturation: 100,
      warmth: 0
    }
  }
} satisfies PairSettings;

function requireValue<T>(value: T | null | undefined): T {
  assert.ok(value);
  return value;
}

function pairData({ id, leftId, rightId, notes, rating }: Pair) {
  return { id, leftId, rightId, notes, rating };
}

function jsonRecord(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function arrayRecord(source: Record<string, unknown>, key: string, index = 0): Record<string, unknown> {
  const values = source[key];
  assert.ok(Array.isArray(values));
  return jsonRecord(values[index]);
}

function firstPairRecord(project: Record<string, unknown>): Record<string, unknown> {
  return arrayRecord(arrayRecord(project, "comparisons"), "pairs");
}

function image(name: string, width = 800, height = 1200) {
  return createImageRecord({
    name,
    type: "image/jpeg",
    size: 100,
    width,
    height,
    dataUrl: `data:image/jpeg;base64,${Buffer.from(name).toString("base64")}`
  });
}

test("project format identifiers remain stable", () => {
  assert.equal(PROJECT_FORMAT, "frame-match-project");
  assert.equal(PROJECT_VERSION, 2);
});

test("normalizeStem removes common edit qualifiers", () => {
  assert.equal(normalizeStem("DSC_07371-final.PNG"), "dsc07371");
  assert.equal(normalizeStem("Portrait edited copy.jpg"), "portrait");
});

test("pair settings clones do not share nested layer state", () => {
  const first = clonePairSettings();
  const second = clonePairSettings();

  first.layers.left.brightness = 42;

  assert.equal(second.layers.left.brightness, 100);
});

test("pair settings hydrate partial values and reject malformed fields", () => {
  assert.deepEqual(clonePairSettings({
    opacity: 63,
    layers: { left: { brightness: 82 } }
  }), {
    ...normalizedDefaultPairSettings,
    opacity: 63,
    layers: {
      left: {
        ...normalizedDefaultPairSettings.layers.left,
        brightness: 82
      },
      right: { ...normalizedDefaultPairSettings.layers.right }
    }
  });
  assert.deepEqual(clonePairSettings(null), normalizedDefaultPairSettings);

  for (const settings of [
    "invalid",
    { opacity: "63" },
    { orientation: "diagonal" },
    { layers: "invalid" },
    { layers: { left: { brightness: "82" } } }
  ]) {
    assert.throws(() => clonePairSettings(settings), TypeError);
  }
});

test("addImages rejects duplicates and sorts names naturally", () => {
  const project = createProject("Imports");
  const accepted = addImages(project, "left", [
    image("DSC_10.jpg"),
    image("DSC_2.jpg"),
    image("DSC_2.jpg")
  ]);

  assert.equal(accepted.length, 2);
  assert.deepEqual(
    requireValue(getActiveCollection(project, "left")).images.map((record) => record.name),
    ["DSC_2.jpg", "DSC_10.jpg"]
  );
});

test("autoPair prefers normalized filename matches before natural order", () => {
  const project = createProject("Test");
  const left = [image("DSC_2.jpg"), image("DSC_10.jpg"), image("portrait.jpg")];
  const right = [image("portrait-clean.png"), image("DSC_10-final.png"), image("candidate.png")];
  addImages(project, "left", left);
  addImages(project, "right", right);

  autoPair(project);

  const pairs = getActivePairs(project);
  assert.equal(pairs.length, 3);
  const byLeftName = new Map(pairs.map((pair) => [
    getImage(project, "left", pair.leftId)?.name,
    getImage(project, "right", pair.rightId)?.name
  ]));
  assert.equal(byLeftName.get("portrait.jpg"), "portrait-clean.png");
  assert.equal(byLeftName.get("DSC_10.jpg"), "DSC_10-final.png");
  assert.equal(byLeftName.get("DSC_2.jpg"), "candidate.png");
  assert.equal(new Set(pairs.map((pair) => pair.rightId)).size, 3);
});

test("manual mapping swaps an existing assignment and rejects foreign images", () => {
  const project = createProject("Mapping");
  addImages(project, "left", [image("left-1.jpg"), image("left-2.jpg")]);
  addImages(project, "right", [image("right-1.jpg"), image("right-2.jpg")]);
  autoPair(project);

  const [first, second] = getActivePairs(project);
  assert.ok(first?.rightId);
  assert.ok(second?.rightId);
  const firstRightId = first.rightId;
  const secondRightId = second.rightId;

  assert.equal(mapPair(project, first.id, secondRightId), true);
  assert.equal(first.rightId, secondRightId);
  assert.equal(second.rightId, firstRightId);
  assert.equal(mapPair(project, first.id, "image-from-another-collection"), false);
});

test("project files preserve image data, mappings, and settings", () => {
  const project = createProject("Round trip");
  addImages(project, "left", [image("A.jpg")]);
  addImages(project, "right", [image("A-clean.png")]);
  autoPair(project);
  requireValue(getActivePairs(project)[0]).settings.opacity = 37;
  setComparisonMode(project, "difference");

  const parsed = parseProject(serializeProject(project));

  assert.equal(parsed.name, "Round trip");
  assert.equal(getComparisonMode(parsed), "difference");
  assert.equal(requireValue(getActivePairs(parsed)[0]).settings.opacity, 37);
  assert.equal(
    requireValue(getActiveCollection(parsed, "left")).images[0]?.dataUrl,
    requireValue(getActiveCollection(project, "left")).images[0]?.dataUrl
  );
  assert.equal(
    requireValue(getActivePairs(parsed)[0]).rightId,
    requireValue(getActiveCollection(parsed, "right")).images[0]?.id
  );
});

test("collection combinations preserve independent mappings and tuning", () => {
  const project = createProject("Multiple collections");
  const raw = requireValue(getActiveCollection(project, "left"));
  const firstEdit = requireValue(getActiveCollection(project, "right"));
  const generated = addCollection(project, "Generated upscale");
  addImages(project, raw.id, [image("DSC_1.jpg")]);
  addImages(project, firstEdit.id, [image("DSC_1.png")]);
  addImages(project, generated.id, [image("DSC_1-final.png")]);

  setActiveCollections(project, raw.id, firstEdit.id);
  autoPair(project);
  requireValue(getActivePairs(project)[0]).settings.opacity = 31;

  setActiveCollections(project, raw.id, generated.id);
  requireValue(getActivePairs(project)[0]).settings.opacity = 72;
  setComparisonMode(project, "overlay");

  setActiveCollections(project, raw.id, firstEdit.id);
  assert.equal(requireValue(getActivePairs(project)[0]).settings.opacity, 31);
  setActiveCollections(project, raw.id, generated.id);
  assert.equal(requireValue(getActivePairs(project)[0]).settings.opacity, 72);
  assert.equal(getComparisonMode(project), "overlay");
  assert.equal(project.collections.length, 3);
  assert.equal(project.comparisons.length, 2);
});

test("version 1 projects migrate without losing project or image data", () => {
  const source = JSON.parse(versionOneFixture);
  const migrated = parseProject(versionOneFixture);
  const left = requireValue(migrated.collections[0]);
  const right = requireValue(migrated.collections[1]);
  const comparison = requireValue(getActiveComparison(migrated));
  const pair = requireValue(getActivePairs(migrated)[0]);

  assert.deepEqual(
    {
      format: migrated.format,
      version: migrated.version,
      id: migrated.id,
      name: migrated.name,
      kind: migrated.kind,
      createdAt: migrated.createdAt,
      updatedAt: migrated.updatedAt
    },
    {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      id: source.id,
      name: source.name,
      kind: source.kind,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt
    }
  );
  assert.ok(left.id);
  assert.ok(right.id);
  assert.notEqual(left.id, right.id);
  assert.deepEqual({ name: left.name, images: left.images }, source.collections.left);
  assert.deepEqual({ name: right.name, images: right.images }, source.collections.right);

  assert.ok(comparison.id);
  assert.notEqual(comparison.id, left.id);
  assert.notEqual(comparison.id, right.id);
  assert.equal(migrated.activeComparisonId, comparison.id);
  assert.equal(comparison.leftCollectionId, left.id);
  assert.equal(comparison.rightCollectionId, right.id);
  assert.equal(comparison.selectedPairId, pair.id);
  assert.equal(pair.id, source.pairs[0].id);
  assert.equal(pair.leftId, left.images[0]?.id);
  assert.equal(pair.rightId, right.images[0]?.id);
  assert.equal(pair.notes, source.pairs[0].notes);
  assert.equal(pair.rating, source.pairs[0].rating);
  assert.equal(getComparisonMode(migrated), "wipe");
  assert.deepEqual(pair.settings, {
    ...normalizedDefaultPairSettings,
    opacity: 44
  });
  assert.equal("mode" in pair.settings, false);
});

test("version 2 projects normalize defaults and round trip without drift", () => {
  const source = JSON.parse(versionTwoFixture);
  const normalized = parseProject(versionTwoFixture);
  const comparison = requireValue(getActiveComparison(normalized));
  const [mainPair, detailPair] = comparison.pairs;

  assert.deepEqual(
    {
      format: normalized.format,
      version: normalized.version,
      id: normalized.id,
      name: normalized.name,
      kind: normalized.kind,
      comparisonMode: normalized.comparisonMode,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
      activeComparisonId: normalized.activeComparisonId
    },
    {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      id: "fixture-project-v2",
      name: "Frozen version 2 project",
      kind: "comparison",
      comparisonMode: "difference",
      createdAt: "2025-02-03T04:05:06.000Z",
      updatedAt: "2025-02-04T05:06:07.000Z",
      activeComparisonId: "fixture-comparison-main"
    }
  );
  assert.equal(comparison.id, "fixture-comparison-main");
  assert.equal(comparison.leftCollectionId, "fixture-collection-source");
  assert.equal(comparison.rightCollectionId, "fixture-collection-candidate");
  assert.equal(comparison.selectedPairId, "fixture-pair-main");
  assert.deepEqual(normalized.collections, source.collections);
  assert.deepEqual(
    comparison.pairs.map(pairData),
    source.comparisons[0].pairs.map(pairData)
  );
  assert.deepEqual(requireValue(mainPair).settings, {
    ...normalizedDefaultPairSettings,
    fit: "cover",
    opacity: 63,
    showGrid: true,
    layers: {
      left: {
        ...normalizedDefaultPairSettings.layers.left,
        brightness: 82
      },
      right: {
        ...normalizedDefaultPairSettings.layers.right,
        saturation: 76,
        warmth: 12
      }
    }
  });
  assert.deepEqual(requireValue(detailPair).settings, {
    ...normalizedDefaultPairSettings,
    showLabels: false,
    layers: {
      left: { ...normalizedDefaultPairSettings.layers.left },
      right: {
        ...normalizedDefaultPairSettings.layers.right,
        grayscale: 20
      }
    }
  });

  const serialized = JSON.parse(serializeProject(normalized));
  assert.deepEqual(serialized, normalized);
  assert.deepEqual(parseProject(JSON.stringify(serialized)), normalized);
});

test("version 2 projects recover the comparison mode from legacy pair settings", () => {
  const project = JSON.parse(versionTwoFixture);
  project.comparisonMode = "obsolete";
  project.comparisons[0].pairs[0].settings.mode = "wipe";

  const normalized = parseProject(JSON.stringify(project));
  const selectedPair = requireValue(getActivePairs(normalized)[0]);

  assert.equal(getComparisonMode(normalized), "wipe");
  assert.equal("mode" in selectedPair.settings, false);
});

test("normalized pairs do not share nested default settings", () => {
  const normalized = parseProject(versionTwoFixture);
  const [mainPair, detailPair] = getActivePairs(normalized);

  requireValue(mainPair).settings.layers.right.contrast = 45;

  assert.equal(requireValue(detailPair).settings.layers.right.contrast, 100);
});

test("project parsing rejects wrong schema scalar types", () => {
  const cases = [
    ["project version", (project: Record<string, unknown>) => { project.version = "2"; }],
    ["project timestamp", (project: Record<string, unknown>) => { project.updatedAt = 42; }],
    ["collection ID", (project: Record<string, unknown>) => {
      arrayRecord(project, "collections").id = 42;
    }],
    ["image width", (project: Record<string, unknown>) => {
      arrayRecord(arrayRecord(project, "collections"), "images").width = "1200";
    }],
    ["pair notes", (project: Record<string, unknown>) => {
      firstPairRecord(project).notes = false;
    }],
    ["pair rating", (project: Record<string, unknown>) => {
      firstPairRecord(project).rating = "4";
    }],
    ["pair opacity", (project: Record<string, unknown>) => {
      jsonRecord(firstPairRecord(project).settings).opacity = "63";
    }],
    ["pair orientation", (project: Record<string, unknown>) => {
      jsonRecord(firstPairRecord(project).settings).orientation = "diagonal";
    }],
    ["layer brightness", (project: Record<string, unknown>) => {
      const settings = jsonRecord(firstPairRecord(project).settings);
      const layers = jsonRecord(settings.layers);
      jsonRecord(layers.left).brightness = "82";
    }]
  ] as const;

  for (const [label, mutate] of cases) {
    const project = jsonRecord(JSON.parse(versionTwoFixture));
    mutate(project);
    assert.throws(() => parseProject(JSON.stringify(project)), TypeError, label);
  }
});

test("project parsing supplies compatibility defaults for absent optional fields", () => {
  const project = JSON.parse(versionTwoFixture);
  const imageRecord = project.collections[0].images[0];
  delete imageRecord.type;
  delete imageRecord.size;
  delete imageRecord.lastModified;
  delete imageRecord.relativePath;
  const pair = project.comparisons[0].pairs[0];
  delete pair.notes;
  delete pair.rating;
  pair.settings = null;

  const normalized = parseProject(JSON.stringify(project));
  const normalizedImage = requireValue(normalized.collections[0]?.images[0]);
  const normalizedPair = requireValue(getActivePairs(normalized)[0]);

  assert.deepEqual({
    type: normalizedImage.type,
    size: normalizedImage.size,
    lastModified: normalizedImage.lastModified,
    relativePath: normalizedImage.relativePath
  }, {
    type: "image/unknown",
    size: 0,
    lastModified: 0,
    relativePath: ""
  });
  assert.equal(normalizedPair.notes, "");
  assert.equal(normalizedPair.rating, 0);
  assert.deepEqual(normalizedPair.settings, normalizedDefaultPairSettings);
});

test("project parsing rejects malformed, incompatible, and incomplete files", () => {
  assert.throws(() => parseProject("{"), SyntaxError);
  assert.throws(() => parseProject("{}"), /not a Picturesque project file/);
  assert.throws(
    () => parseProject(JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION + 1 })),
    /newer than this app supports/
  );
  assert.throws(
    () => parseProject(JSON.stringify({
      ...JSON.parse(versionTwoFixture),
      collections: []
    })),
    /at least one collection/
  );

  const invalid = JSON.parse(serializeProject(createProject("Invalid image")));
  invalid.collections[0].images.push({ id: "broken", name: "broken.jpg" });
  assert.throws(() => parseProject(JSON.stringify(invalid)), /invalid image record/);
});

test("project normalization repairs stale pair and selection references", () => {
  const damaged = JSON.parse(versionTwoFixture);
  const comparison = damaged.comparisons[0];
  comparison.selectedPairId = "missing-pair";
  damaged.activeComparisonId = "missing-comparison";
  comparison.pairs[0].rightId = "missing-image";
  comparison.pairs[1].leftId = "missing-image";
  comparison.pairs.push({
    id: "fully-missing-pair",
    leftId: "missing-left",
    rightId: "missing-right",
    settings: {}
  });

  const repaired = parseProject(JSON.stringify(damaged));
  const active = requireValue(getActiveComparison(repaired));
  const pairs = getActivePairs(repaired);

  assert.equal(repaired.activeComparisonId, active.id);
  assert.equal(active.id, "fixture-comparison-main");
  assert.equal(active.selectedPairId, "fixture-pair-main");
  assert.equal(pairs.length, 3);
  assert.equal(requireValue(pairs.find((pair) => pair.id === "fixture-pair-main")).rightId, null);
  assert.equal(pairs.some((pair) => pair.id === "fixture-pair-detail"), false);
  assert.equal(pairs.some((pair) => pair.id === "fully-missing-pair"), false);
  assert.deepEqual(
    pairs.map((pair) => pair.leftId).filter(Boolean).sort(),
    ["fixture-image-source-detail", "fixture-image-source-main"]
  );
  assert.deepEqual(
    pairs.map((pair) => pair.rightId).filter(Boolean),
    ["fixture-image-candidate-main"]
  );
});

test("collection selection rejects the same collection on both sides", () => {
  const project = createProject("Invalid selection");
  const left = requireValue(getActiveCollection(project, "left"));

  assert.throws(() => setActiveCollections(project, left.id, left.id), /must be different/);
});

test("single projects retain a null comparison side", () => {
  const project = createProject("Single collection", "single");
  const comparison = requireValue(getActiveComparison(project));

  assert.equal(project.kind, "single");
  assert.equal(project.collections.length, 1);
  assert.equal(comparison.leftCollectionId, project.collections[0]?.id);
  assert.equal(comparison.rightCollectionId, null);
  assert.deepEqual(comparison.pairs, []);
  assert.equal(comparison.selectedPairId, null);
  assert.equal(getActiveCollection(project, "right"), null);
});

test("removing an active collection creates a valid fallback comparison", () => {
  const project = createProject("Fallback");
  const raw = requireValue(getActiveCollection(project, "left"));
  const generated = addCollection(project, "Generated");
  setActiveCollections(project, raw.id, generated.id);

  assert.equal(removeCollection(project, generated.id), true);
  const active = requireValue(getActiveComparison(project));
  assert.notEqual(active.leftCollectionId, active.rightCollectionId);
  assert.ok(project.collections.some((collection) => collection.id === active.leftCollectionId));
});

test("selected pairs and project summaries reflect the active comparison", () => {
  const project = createProject("Summary");
  addImages(project, "left", [image("mapped.jpg"), image("left-only.jpg")]);
  addImages(project, "right", [image("mapped-clean.jpg")]);
  autoPair(project);
  const first = requireValue(getActivePairs(project)[0]);

  assert.equal(setSelectedPairId(project, first.id), true);
  assert.equal(setSelectedPairId(project, "missing-pair"), false);
  assert.deepEqual(projectSummary(project), {
    collections: 2,
    images: 3,
    left: 2,
    right: 1,
    pairs: 2,
    mapped: 1,
    unmapped: 1
  });
});
