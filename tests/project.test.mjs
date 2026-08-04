import test from "node:test";
import assert from "node:assert/strict";

import {
  addCollection,
  addImages,
  autoPair,
  createImageRecord,
  createProject,
  getActiveCollection,
  getActivePairs,
  getComparisonMode,
  getImage,
  normalizeStem,
  parseProject,
  setActiveCollections,
  setComparisonMode,
  serializeProject
} from "../src/project.js";

function image(name, width = 800, height = 1200) {
  return createImageRecord({
    name,
    type: "image/jpeg",
    size: 100,
    width,
    height,
    dataUrl: `data:image/jpeg;base64,${Buffer.from(name).toString("base64")}`
  });
}

test("normalizeStem removes common edit qualifiers", () => {
  assert.equal(normalizeStem("DSC_07371-final.PNG"), "dsc07371");
  assert.equal(normalizeStem("Portrait edited copy.jpg"), "portrait");
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
  const byLeftName = new Map(pairs.map((pair) => [getImage(project, "left", pair.leftId)?.name, getImage(project, "right", pair.rightId)?.name]));
  assert.equal(byLeftName.get("portrait.jpg"), "portrait-clean.png");
  assert.equal(byLeftName.get("DSC_10.jpg"), "DSC_10-final.png");
  assert.equal(byLeftName.get("DSC_2.jpg"), "candidate.png");
  assert.equal(new Set(pairs.map((pair) => pair.rightId)).size, 3);
});

test("project files preserve image data, mappings, and settings", () => {
  const project = createProject("Round trip");
  addImages(project, "left", [image("A.jpg")]);
  addImages(project, "right", [image("A-clean.png")]);
  autoPair(project);
  getActivePairs(project)[0].settings.opacity = 37;
  setComparisonMode(project, "difference");

  const parsed = parseProject(serializeProject(project));

  assert.equal(parsed.name, "Round trip");
  assert.equal(getComparisonMode(parsed), "difference");
  assert.equal(getActivePairs(parsed)[0].settings.opacity, 37);
  assert.equal(getActiveCollection(parsed, "left").images[0].dataUrl, getActiveCollection(project, "left").images[0].dataUrl);
  assert.equal(getActivePairs(parsed)[0].rightId, getActiveCollection(parsed, "right").images[0].id);
});

test("collection combinations preserve independent mappings and tuning", () => {
  const project = createProject("Multiple collections");
  const raw = getActiveCollection(project, "left");
  const firstEdit = getActiveCollection(project, "right");
  const generated = addCollection(project, "Generated upscale");
  addImages(project, raw.id, [image("DSC_1.jpg")]);
  addImages(project, firstEdit.id, [image("DSC_1.png")]);
  addImages(project, generated.id, [image("DSC_1-final.png")]);

  setActiveCollections(project, raw.id, firstEdit.id);
  autoPair(project);
  getActivePairs(project)[0].settings.opacity = 31;

  setActiveCollections(project, raw.id, generated.id);
  getActivePairs(project)[0].settings.opacity = 72;
  setComparisonMode(project, "overlay");

  setActiveCollections(project, raw.id, firstEdit.id);
  assert.equal(getActivePairs(project)[0].settings.opacity, 31);
  setActiveCollections(project, raw.id, generated.id);
  assert.equal(getActivePairs(project)[0].settings.opacity, 72);
  assert.equal(getComparisonMode(project), "overlay");
  assert.equal(project.collections.length, 3);
  assert.equal(project.comparisons.length, 2);
});

test("version 1 projects migrate to dynamic collections", () => {
  const leftImage = image("legacy.jpg");
  const rightImage = image("legacy-clean.png");
  const legacy = {
    format: "frame-match-project",
    version: 1,
    id: "legacy-project",
    name: "Legacy",
    kind: "comparison",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    collections: {
      left: { name: "Raw", images: [leftImage] },
      right: { name: "Edit", images: [rightImage] }
    },
    pairs: [{ id: "legacy-pair", leftId: leftImage.id, rightId: rightImage.id, settings: { opacity: 44, mode: "wipe" } }],
    selectedPairId: "legacy-pair"
  };

  const migrated = parseProject(JSON.stringify(legacy));
  assert.equal(migrated.version, 2);
  assert.equal(migrated.collections.length, 2);
  assert.equal(getActivePairs(migrated)[0].settings.opacity, 44);
  assert.equal(getComparisonMode(migrated), "wipe");
});
