import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { test } from "vitest";

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

function requireValue<T>(value: T | null | undefined): T {
  assert.ok(value);
  return value;
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

  (first.layers.left as { brightness: number }).brightness = 42;

  assert.equal(second.layers.left.brightness, 100);
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
    requireValue(getActiveCollection(project, "left")).images.map((record: { name: string }) => record.name),
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
  const byLeftName = new Map(pairs.map((pair: { leftId: string | null; rightId: string | null }) => [
    getImage(project, "left", pair.leftId)?.name,
    getImage(project, "right", pair.rightId)?.name
  ]));
  assert.equal(byLeftName.get("portrait.jpg"), "portrait-clean.png");
  assert.equal(byLeftName.get("DSC_10.jpg"), "DSC_10-final.png");
  assert.equal(byLeftName.get("DSC_2.jpg"), "candidate.png");
  assert.equal(new Set(pairs.map((pair: { rightId: string | null }) => pair.rightId)).size, 3);
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

test("version 1 projects migrate mappings and the global comparison mode", () => {
  const migrated = parseProject(versionOneFixture);
  const pair = requireValue(getActivePairs(migrated)[0]);

  assert.equal(migrated.version, PROJECT_VERSION);
  assert.equal(migrated.collections.length, 2);
  assert.equal(pair.settings.opacity, 44);
  assert.equal(getComparisonMode(migrated), "wipe");
  assert.equal("mode" in pair.settings, false);
});

test("project parsing rejects incompatible and incomplete files", () => {
  assert.throws(() => parseProject("{}"), /not a Picturesque project file/);
  assert.throws(
    () => parseProject(JSON.stringify({ format: PROJECT_FORMAT, version: PROJECT_VERSION + 1 })),
    /newer than this app supports/
  );

  const invalid = createProject("Invalid image");
  requireValue(getActiveCollection(invalid, "left")).images.push({ id: "broken", name: "broken.jpg" });
  assert.throws(() => parseProject(JSON.stringify(invalid)), /invalid image record/);
});

test("collection selection rejects the same collection on both sides", () => {
  const project = createProject("Invalid selection");
  const left = requireValue(getActiveCollection(project, "left"));

  assert.throws(() => setActiveCollections(project, left.id, left.id), /must be different/);
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
