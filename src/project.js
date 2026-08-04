export const PROJECT_FORMAT = "frame-match-project";
export const PROJECT_VERSION = 2;
export const COMPARISON_MODES = Object.freeze(["side", "overlay", "wipe", "difference", "blink"]);

export const DEFAULT_LAYER_SETTINGS = Object.freeze({
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  saturation: 100,
  warmth: 0
});

export const DEFAULT_PAIR_SETTINGS = Object.freeze({
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
    left: { ...DEFAULT_LAYER_SETTINGS },
    right: { ...DEFAULT_LAYER_SETTINGS }
  }
});

function id(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function clonePairSettings(settings = DEFAULT_PAIR_SETTINGS) {
  const { mode: _legacyMode, ...pairSettings } = settings ?? {};
  return {
    ...DEFAULT_PAIR_SETTINGS,
    ...pairSettings,
    layers: {
      left: { ...DEFAULT_LAYER_SETTINGS, ...pairSettings.layers?.left },
      right: { ...DEFAULT_LAYER_SETTINGS, ...pairSettings.layers?.right }
    }
  };
}

function createCollection(name) {
  return { id: id("collection"), name: name.trim() || "Untitled collection", images: [] };
}

function createPair(leftId = null, rightId = null) {
  return {
    id: id("pair"),
    leftId,
    rightId,
    notes: "",
    rating: 0,
    settings: clonePairSettings()
  };
}

function createComparison(leftCollectionId, rightCollectionId = null) {
  return {
    id: id("comparison"),
    leftCollectionId,
    rightCollectionId,
    pairs: [],
    selectedPairId: null
  };
}

export function createProject(name = "Untitled comparison", kind = "comparison") {
  const now = new Date().toISOString();
  const left = createCollection("Raw / reference");
  const collections = [left];
  let right = null;
  if (kind !== "single") {
    right = createCollection("Edited / candidate");
    collections.push(right);
  }
  const comparison = createComparison(left.id, right?.id ?? null);
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    id: id("project"),
    name: name.trim() || "Untitled comparison",
    kind: right ? "comparison" : "single",
    comparisonMode: "side",
    createdAt: now,
    updatedAt: now,
    collections,
    comparisons: [comparison],
    activeComparisonId: comparison.id
  };
}

export function getComparisonMode(project) {
  return COMPARISON_MODES.includes(project.comparisonMode) ? project.comparisonMode : "side";
}

export function setComparisonMode(project, mode) {
  if (!COMPARISON_MODES.includes(mode)) return false;
  project.comparisonMode = mode;
  touchProject(project);
  return true;
}

export function normalizeStem(filename) {
  return filename
    .replace(/\.[^/.]+$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(?:^|[-_.\s])(edited?|final|clean|raw|original|copy|v\d+)(?=$|[-_.\s])/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^0+/, "");
}

export function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function createImageRecord({
  name,
  type,
  size,
  width,
  height,
  dataUrl,
  lastModified = 0,
  relativePath = ""
}) {
  if (!name || !dataUrl || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new TypeError("Image records require a name, data URL, width, and height.");
  }

  return {
    id: id("image"),
    name,
    type: type || "image/unknown",
    size: Number(size) || 0,
    width,
    height,
    lastModified: Number(lastModified) || 0,
    relativePath,
    dataUrl
  };
}

export function getCollection(project, collectionId) {
  return project.collections.find((collection) => collection.id === collectionId) ?? null;
}

export function getActiveComparison(project) {
  return project.comparisons.find((comparison) => comparison.id === project.activeComparisonId)
    ?? project.comparisons[0]
    ?? null;
}

export function getActiveCollection(project, side) {
  const comparison = getActiveComparison(project);
  const collectionId = side === "right" ? comparison?.rightCollectionId : comparison?.leftCollectionId;
  return getCollection(project, collectionId);
}

export function getActivePairs(project) {
  return getActiveComparison(project)?.pairs ?? [];
}

export function getSelectedPairId(project) {
  return getActiveComparison(project)?.selectedPairId ?? null;
}

export function setSelectedPairId(project, pairId) {
  const comparison = getActiveComparison(project);
  if (!comparison || !comparison.pairs.some((pair) => pair.id === pairId)) return false;
  comparison.selectedPairId = pairId;
  touchProject(project);
  return true;
}

function resolveCollectionId(project, collectionIdOrSide) {
  if (collectionIdOrSide === "left" || collectionIdOrSide === "right") {
    return getActiveCollection(project, collectionIdOrSide)?.id ?? null;
  }
  return collectionIdOrSide;
}

export function addCollection(project, name = `Collection ${project.collections.length + 1}`) {
  const collection = createCollection(name);
  project.collections.push(collection);
  project.kind = project.collections.length > 1 ? "comparison" : "single";
  const active = getActiveComparison(project);
  if (active && !active.rightCollectionId && active.leftCollectionId !== collection.id) {
    setActiveCollections(project, active.leftCollectionId, collection.id);
  }
  touchProject(project);
  return collection;
}

export function renameCollection(project, collectionId, name) {
  const collection = getCollection(project, collectionId);
  const trimmed = name.trim();
  if (!collection || !trimmed) return false;
  collection.name = trimmed;
  touchProject(project);
  return true;
}

export function removeCollection(project, collectionId) {
  if (project.collections.length <= 1) return false;
  const index = project.collections.findIndex((collection) => collection.id === collectionId);
  if (index < 0) return false;
  project.collections.splice(index, 1);
  project.comparisons = project.comparisons.filter((comparison) => (
    comparison.leftCollectionId !== collectionId && comparison.rightCollectionId !== collectionId
  ));
  project.kind = project.collections.length > 1 ? "comparison" : "single";

  let active = getActiveComparison(project);
  if (!active) {
    const left = project.collections[0];
    const right = project.collections[1] ?? null;
    active = createComparison(left.id, right?.id ?? null);
    project.comparisons.push(active);
  }
  project.activeComparisonId = active.id;
  synchronizeComparison(project, active);
  touchProject(project);
  return true;
}

/**
 * Selects the collections compared in the active view.
 *
 * @param {object} project
 * @param {string} leftCollectionId
 * @param {string | null} [rightCollectionId]
 */
export function setActiveCollections(project, leftCollectionId, rightCollectionId = null) {
  const left = getCollection(project, leftCollectionId);
  const right = rightCollectionId ? getCollection(project, rightCollectionId) : null;
  if (!left) throw new TypeError("Select a valid collection for A.");
  if (rightCollectionId && !right) throw new TypeError("Select a valid collection for B.");
  if (right && left.id === right.id) throw new TypeError("Collections A and B must be different.");

  let comparison = project.comparisons.find((candidate) => (
    candidate.leftCollectionId === left.id && candidate.rightCollectionId === (right?.id ?? null)
  ));
  const created = !comparison;
  if (!comparison) {
    comparison = createComparison(left.id, right?.id ?? null);
    project.comparisons.push(comparison);
    autoPairComparison(project, comparison);
  } else {
    synchronizeComparison(project, comparison);
  }
  project.activeComparisonId = comparison.id;
  project.kind = project.collections.length > 1 ? "comparison" : "single";
  touchProject(project);
  return { comparison, created };
}

export function addImages(project, collectionIdOrSide, records) {
  const collectionId = resolveCollectionId(project, collectionIdOrSide);
  const collection = getCollection(project, collectionId);
  if (!collection) throw new TypeError(`Unknown collection: ${collectionIdOrSide}`);

  const fingerprints = new Set(
    collection.images.map((image) => `${image.relativePath || image.name}\u0000${image.size}\u0000${image.lastModified}`)
  );
  const accepted = [];
  for (const record of records) {
    const fingerprint = `${record.relativePath || record.name}\u0000${record.size}\u0000${record.lastModified}`;
    if (fingerprints.has(fingerprint)) continue;
    fingerprints.add(fingerprint);
    collection.images.push(record);
    accepted.push(record);
  }

  collection.images.sort((a, b) => naturalCompare(a.relativePath || a.name, b.relativePath || b.name));
  for (const comparison of project.comparisons) {
    if (comparison.leftCollectionId === collection.id || comparison.rightCollectionId === collection.id) {
      synchronizeComparison(project, comparison);
    }
  }
  touchProject(project);
  return accepted;
}

export function getImage(project, side, imageId) {
  if (!imageId) return null;
  return getActiveCollection(project, side)?.images.find((image) => image.id === imageId) ?? null;
}

export function getPair(project, pairId) {
  return getActivePairs(project).find((pair) => pair.id === pairId) ?? null;
}

export function getSelectedPair(project) {
  const comparison = getActiveComparison(project);
  return getPair(project, comparison?.selectedPairId) ?? comparison?.pairs[0] ?? null;
}

export function synchronizeComparison(project, comparison = getActiveComparison(project)) {
  if (!comparison) return [];
  const left = getCollection(project, comparison.leftCollectionId);
  const right = getCollection(project, comparison.rightCollectionId);
  const leftIds = new Set(left?.images.map((image) => image.id) ?? []);
  const rightIds = new Set(right?.images.map((image) => image.id) ?? []);
  const retained = [];
  const usedLeft = new Set();
  const usedRight = new Set();

  for (const pair of comparison.pairs) {
    const leftId = leftIds.has(pair.leftId) && !usedLeft.has(pair.leftId) ? pair.leftId : null;
    const rightId = rightIds.has(pair.rightId) && !usedRight.has(pair.rightId) ? pair.rightId : null;
    if (!leftId && !rightId) continue;
    pair.leftId = leftId;
    pair.rightId = rightId;
    pair.settings = clonePairSettings(pair.settings);
    retained.push(pair);
    if (leftId) usedLeft.add(leftId);
    if (rightId) usedRight.add(rightId);
  }

  for (const image of left?.images ?? []) {
    if (!usedLeft.has(image.id)) retained.push(createPair(image.id, null));
  }
  for (const image of right?.images ?? []) {
    if (!usedRight.has(image.id)) retained.push(createPair(null, image.id));
  }

  comparison.pairs = retained;
  if (!retained.some((pair) => pair.id === comparison.selectedPairId)) {
    comparison.selectedPairId = retained[0]?.id ?? null;
  }
  return comparison.pairs;
}

function autoPairComparison(project, comparison) {
  const previousSettings = new Map();
  for (const pair of comparison.pairs) {
    if (pair.leftId) previousSettings.set(pair.leftId, pair.settings);
  }

  const left = [...(getCollection(project, comparison.leftCollectionId)?.images ?? [])]
    .sort((a, b) => naturalCompare(a.name, b.name));
  const right = [...(getCollection(project, comparison.rightCollectionId)?.images ?? [])]
    .sort((a, b) => naturalCompare(a.name, b.name));
  const rightByStem = new Map();
  for (const image of right) {
    const stem = normalizeStem(image.relativePath || image.name);
    if (!rightByStem.has(stem)) rightByStem.set(stem, []);
    rightByStem.get(stem).push(image);
  }

  const usedRight = new Set();
  const pairs = [];
  for (const leftImage of left) {
    const stem = normalizeStem(leftImage.relativePath || leftImage.name);
    const exact = rightByStem.get(stem)?.find((image) => !usedRight.has(image.id)) ?? null;
    if (exact) usedRight.add(exact.id);
    pairs.push({
      ...createPair(leftImage.id, exact?.id ?? null),
      settings: clonePairSettings(previousSettings.get(leftImage.id))
    });
  }

  const unmatchedRight = right.filter((image) => !usedRight.has(image.id));
  let rightIndex = 0;
  for (const pair of pairs) {
    if (pair.rightId || rightIndex >= unmatchedRight.length) continue;
    pair.rightId = unmatchedRight[rightIndex].id;
    rightIndex += 1;
  }
  for (; rightIndex < unmatchedRight.length; rightIndex += 1) {
    pairs.push(createPair(null, unmatchedRight[rightIndex].id));
  }

  comparison.pairs = pairs;
  if (!pairs.some((pair) => pair.id === comparison.selectedPairId)) {
    comparison.selectedPairId = pairs[0]?.id ?? null;
  }
  return pairs;
}

export function autoPair(project) {
  const comparison = getActiveComparison(project);
  if (!comparison) return [];
  const pairs = autoPairComparison(project, comparison);
  touchProject(project);
  return pairs;
}

export function mapPair(project, pairId, rightId) {
  const comparison = getActiveComparison(project);
  const pair = getPair(project, pairId);
  if (!comparison || !pair) return false;
  const requestedRightId = rightId || null;
  const rightCollection = getActiveCollection(project, "right");
  if (requestedRightId && !rightCollection?.images.some((image) => image.id === requestedRightId)) return false;

  const other = requestedRightId
    ? comparison.pairs.find((candidate) => candidate.id !== pairId && candidate.rightId === requestedRightId)
    : null;
  if (other) other.rightId = pair.rightId;
  pair.rightId = requestedRightId;
  touchProject(project);
  return true;
}

export function removePair(project, pairId) {
  const comparison = getActiveComparison(project);
  if (!comparison) return false;
  const index = comparison.pairs.findIndex((pair) => pair.id === pairId);
  if (index < 0) return false;
  comparison.pairs.splice(index, 1);
  if (comparison.selectedPairId === pairId) {
    comparison.selectedPairId = comparison.pairs[Math.min(index, comparison.pairs.length - 1)]?.id ?? null;
  }
  touchProject(project);
  return true;
}

export function resetPairSettings(pair) {
  pair.settings = clonePairSettings();
}

export function touchProject(project) {
  project.updatedAt = new Date().toISOString();
}

function validateCollection(collection, label) {
  if (!collection?.id || !collection.name || !Array.isArray(collection.images)) {
    throw new TypeError(`Project contains an invalid ${label} collection.`);
  }
  for (const image of collection.images) {
    if (!image.id || !image.name || !image.dataUrl || !image.width || !image.height) {
      throw new TypeError(`The ${label} collection contains an invalid image record.`);
    }
  }
}

function migrateVersionOne(project) {
  const legacyLeft = project.collections?.left;
  const legacyRight = project.collections?.right;
  if (!legacyLeft || !legacyRight || !Array.isArray(project.pairs)) {
    throw new TypeError("The version 1 project file is incomplete.");
  }
  const left = { ...legacyLeft, id: legacyLeft.id || id("collection") };
  const right = { ...legacyRight, id: legacyRight.id || id("collection") };
  const comparison = {
    id: id("comparison"),
    leftCollectionId: left.id,
    rightCollectionId: right.id,
    pairs: project.pairs,
    selectedPairId: project.selectedPairId ?? null
  };
  const selectedPair = project.pairs.find((pair) => pair.id === project.selectedPairId) ?? project.pairs[0];
  project.comparisonMode = COMPARISON_MODES.includes(selectedPair?.settings?.mode) ? selectedPair.settings.mode : "side";
  project.collections = [left, right];
  project.comparisons = [comparison];
  project.activeComparisonId = comparison.id;
  delete project.pairs;
  delete project.selectedPairId;
  project.version = PROJECT_VERSION;
  return project;
}

export function normalizeProject(project) {
  if (!project || project.format !== PROJECT_FORMAT) throw new TypeError("This is not a Picturesque project file.");
  if (project.version > PROJECT_VERSION) {
    throw new TypeError(`Project version ${project.version} is newer than this app supports.`);
  }
  if (project.version === 1 || !Array.isArray(project.collections)) migrateVersionOne(project);
  if (!project.id || !project.name || !Array.isArray(project.collections) || !Array.isArray(project.comparisons)) {
    throw new TypeError("The project file is incomplete.");
  }
  if (!project.collections.length) throw new TypeError("A project must contain at least one collection.");

  project.version = PROJECT_VERSION;
  if (!COMPARISON_MODES.includes(project.comparisonMode)) {
    const active = project.comparisons.find((comparison) => comparison.id === project.activeComparisonId) ?? project.comparisons[0];
    const selectedPair = active?.pairs?.find((pair) => pair.id === active.selectedPairId) ?? active?.pairs?.[0];
    project.comparisonMode = COMPARISON_MODES.includes(selectedPair?.settings?.mode) ? selectedPair.settings.mode : "side";
  }
  project.collections.forEach((collection, index) => validateCollection(collection, `#${index + 1}`));
  const collectionIds = new Set(project.collections.map((collection) => collection.id));
  project.comparisons = project.comparisons
    .filter((comparison) => (
      collectionIds.has(comparison.leftCollectionId)
      && (!comparison.rightCollectionId || collectionIds.has(comparison.rightCollectionId))
      && comparison.leftCollectionId !== comparison.rightCollectionId
    ))
    .map((comparison) => ({
      ...comparison,
      id: comparison.id || id("comparison"),
      pairs: Array.isArray(comparison.pairs) ? comparison.pairs.map((pair) => ({
        ...pair,
        id: pair.id || id("pair"),
        leftId: pair.leftId || null,
        rightId: pair.rightId || null,
        settings: clonePairSettings(pair.settings)
      })) : [],
      selectedPairId: comparison.selectedPairId || null
    }));

  if (!project.comparisons.length) {
    project.comparisons.push(createComparison(project.collections[0].id, project.collections[1]?.id ?? null));
  }
  if (!project.comparisons.some((comparison) => comparison.id === project.activeComparisonId)) {
    project.activeComparisonId = project.comparisons[0].id;
  }
  for (const comparison of project.comparisons) synchronizeComparison(project, comparison);
  project.kind = project.collections.length > 1 ? "comparison" : "single";
  return project;
}

export function serializeProject(project) {
  return JSON.stringify({ ...project, format: PROJECT_FORMAT, version: PROJECT_VERSION });
}

export function parseProject(text) {
  return normalizeProject(JSON.parse(text));
}

export function pairDisplayName(project, pair) {
  const left = getImage(project, "left", pair?.leftId);
  const right = getImage(project, "right", pair?.rightId);
  return left?.name ?? right?.name ?? "Untitled pair";
}

export function projectSummary(project) {
  const comparison = getActiveComparison(project);
  const pairs = comparison?.pairs ?? [];
  const mapped = pairs.filter((pair) => pair.leftId && pair.rightId).length;
  return {
    collections: project.collections.length,
    images: project.collections.reduce((total, collection) => total + collection.images.length, 0),
    left: getActiveCollection(project, "left")?.images.length ?? 0,
    right: getActiveCollection(project, "right")?.images.length ?? 0,
    pairs: pairs.length,
    mapped,
    unmapped: pairs.length - mapped
  };
}
