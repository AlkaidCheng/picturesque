export const PROJECT_FORMAT = "frame-match-project";
export const PROJECT_VERSION = 2;
export const COMPARISON_MODES = Object.freeze(["side", "overlay", "wipe", "difference", "blink"] as const);

export type ComparisonMode = (typeof COMPARISON_MODES)[number];
export type CollectionSide = "left" | "right";
export type ProjectKind = "comparison" | "single";

export interface LayerSettings {
  brightness: number;
  contrast: number;
  grayscale: number;
  saturation: number;
  warmth: number;
}

export interface PairSettings {
  background: string;
  blendMode: string;
  blinkInterval: number;
  fit: string;
  frameRatio: string;
  offsetX: number;
  offsetY: number;
  opacity: number;
  orientation: "horizontal" | "vertical";
  rotation: number;
  scale: number;
  showGrid: boolean;
  showLabels: boolean;
  wipe: number;
  layers: {
    left: LayerSettings;
    right: LayerSettings;
  };
}

export interface ImageRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  width: number;
  height: number;
  lastModified: number;
  relativePath: string;
  dataUrl: string;
}

export interface ImageRecordInput {
  name: string;
  type?: string;
  size?: number;
  width: number;
  height: number;
  dataUrl: string;
  lastModified?: number;
  relativePath?: string;
}

export interface Collection {
  id: string;
  name: string;
  images: ImageRecord[];
}

export interface Pair {
  id: string;
  leftId: string | null;
  rightId: string | null;
  notes: string;
  rating: number;
  settings: PairSettings;
}

export interface Comparison {
  id: string;
  leftCollectionId: string;
  rightCollectionId: string | null;
  pairs: Pair[];
  selectedPairId: string | null;
}

export interface Project {
  format: typeof PROJECT_FORMAT;
  version: typeof PROJECT_VERSION;
  id: string;
  name: string;
  kind: ProjectKind;
  comparisonMode: ComparisonMode;
  createdAt: string;
  updatedAt: string;
  collections: Collection[];
  comparisons: Comparison[];
  activeComparisonId: string;
}

export interface ActiveCollectionSelection {
  comparison: Comparison;
  created: boolean;
}

export interface ProjectSummary {
  collections: number;
  images: number;
  left: number;
  right: number;
  pairs: number;
  mapped: number;
  unmapped: number;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function stringField(
  source: UnknownRecord,
  key: string,
  fallback: string,
  context: string
): string {
  if (!Object.hasOwn(source, key) || source[key] === undefined) return fallback;
  const value = source[key];
  if (typeof value === "string") return value;
  throw new TypeError(`${context} contains an invalid ${key} value.`);
}

function numberField(
  source: UnknownRecord,
  key: string,
  fallback: number,
  context: string
): number {
  if (!Object.hasOwn(source, key) || source[key] === undefined) return fallback;
  const value = source[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new TypeError(`${context} contains an invalid ${key} value.`);
}

function booleanField(
  source: UnknownRecord,
  key: string,
  fallback: boolean,
  context: string
): boolean {
  if (!Object.hasOwn(source, key) || source[key] === undefined) return fallback;
  const value = source[key];
  if (typeof value === "boolean") return value;
  throw new TypeError(`${context} contains an invalid ${key} value.`);
}

function orientationField(source: UnknownRecord): PairSettings["orientation"] {
  if (!Object.hasOwn(source, "orientation") || source.orientation === undefined) {
    return DEFAULT_PAIR_SETTINGS.orientation;
  }
  if (source.orientation === "horizontal" || source.orientation === "vertical") {
    return source.orientation;
  }
  throw new TypeError("Pair settings contain an invalid orientation value.");
}

export const DEFAULT_LAYER_SETTINGS: Readonly<LayerSettings> = Object.freeze({
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  saturation: 100,
  warmth: 0
});

export const DEFAULT_PAIR_SETTINGS: Readonly<PairSettings> = Object.freeze({
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

function id(prefix: string): string {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeLayerSettings(value: unknown, side: CollectionSide): LayerSettings {
  if (value !== undefined && value !== null && !isRecord(value)) {
    throw new TypeError(`Pair settings contain invalid ${side} layer settings.`);
  }
  const source = isRecord(value) ? value : {};
  const context = `${side === "left" ? "Left" : "Right"} layer settings`;
  return {
    ...source,
    brightness: numberField(source, "brightness", DEFAULT_LAYER_SETTINGS.brightness, context),
    contrast: numberField(source, "contrast", DEFAULT_LAYER_SETTINGS.contrast, context),
    grayscale: numberField(source, "grayscale", DEFAULT_LAYER_SETTINGS.grayscale, context),
    saturation: numberField(source, "saturation", DEFAULT_LAYER_SETTINGS.saturation, context),
    warmth: numberField(source, "warmth", DEFAULT_LAYER_SETTINGS.warmth, context)
  };
}

export function clonePairSettings(settings: unknown = DEFAULT_PAIR_SETTINGS): PairSettings {
  if (settings !== undefined && settings !== null && !isRecord(settings)) {
    throw new TypeError("Pair settings must be an object.");
  }
  const source = isRecord(settings) ? settings : {};
  const { mode: _legacyMode, ...settingsWithoutLegacyMode } = source;
  if (
    Object.hasOwn(source, "layers")
    && source.layers !== undefined
    && source.layers !== null
    && !isRecord(source.layers)
  ) {
    throw new TypeError("Pair settings layers must be an object.");
  }
  const layers = isRecord(source.layers) ? source.layers : {};
  return {
    ...settingsWithoutLegacyMode,
    background: stringField(source, "background", DEFAULT_PAIR_SETTINGS.background, "Pair settings"),
    blendMode: stringField(source, "blendMode", DEFAULT_PAIR_SETTINGS.blendMode, "Pair settings"),
    blinkInterval: numberField(source, "blinkInterval", DEFAULT_PAIR_SETTINGS.blinkInterval, "Pair settings"),
    fit: stringField(source, "fit", DEFAULT_PAIR_SETTINGS.fit, "Pair settings"),
    frameRatio: stringField(source, "frameRatio", DEFAULT_PAIR_SETTINGS.frameRatio, "Pair settings"),
    offsetX: numberField(source, "offsetX", DEFAULT_PAIR_SETTINGS.offsetX, "Pair settings"),
    offsetY: numberField(source, "offsetY", DEFAULT_PAIR_SETTINGS.offsetY, "Pair settings"),
    opacity: numberField(source, "opacity", DEFAULT_PAIR_SETTINGS.opacity, "Pair settings"),
    orientation: orientationField(source),
    rotation: numberField(source, "rotation", DEFAULT_PAIR_SETTINGS.rotation, "Pair settings"),
    scale: numberField(source, "scale", DEFAULT_PAIR_SETTINGS.scale, "Pair settings"),
    showGrid: booleanField(source, "showGrid", DEFAULT_PAIR_SETTINGS.showGrid, "Pair settings"),
    showLabels: booleanField(source, "showLabels", DEFAULT_PAIR_SETTINGS.showLabels, "Pair settings"),
    wipe: numberField(source, "wipe", DEFAULT_PAIR_SETTINGS.wipe, "Pair settings"),
    layers: {
      ...layers,
      left: normalizeLayerSettings(layers.left, "left"),
      right: normalizeLayerSettings(layers.right, "right")
    }
  };
}

function createCollection(name: string): Collection {
  return { id: id("collection"), name: name.trim() || "Untitled collection", images: [] };
}

function createPair(leftId: string | null = null, rightId: string | null = null): Pair {
  return {
    id: id("pair"),
    leftId,
    rightId,
    notes: "",
    rating: 0,
    settings: clonePairSettings()
  };
}

function createComparison(leftCollectionId: string, rightCollectionId: string | null = null): Comparison {
  return {
    id: id("comparison"),
    leftCollectionId,
    rightCollectionId,
    pairs: [],
    selectedPairId: null
  };
}

export function createProject(
  name = "Untitled comparison",
  kind: ProjectKind = "comparison"
): Project {
  const now = new Date().toISOString();
  const left = createCollection("Raw / reference");
  const collections: Collection[] = [left];
  let right: Collection | null = null;
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

function isComparisonMode(value: unknown): value is ComparisonMode {
  return COMPARISON_MODES.some((mode) => mode === value);
}

export function getComparisonMode(project: Project): ComparisonMode {
  return isComparisonMode(project.comparisonMode) ? project.comparisonMode : "side";
}

export function setComparisonMode(project: Project, mode: string): boolean {
  if (!isComparisonMode(mode)) return false;
  project.comparisonMode = mode;
  touchProject(project);
  return true;
}

export function normalizeStem(filename: string): string {
  return filename
    .replace(/\.[^/.]+$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(?:^|[-_.\s])(edited?|final|clean|raw|original|copy|v\d+)(?=$|[-_.\s])/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^0+/, "");
}

export function naturalCompare(a: string, b: string): number {
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
}: ImageRecordInput): ImageRecord {
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

export function getCollection(
  project: Project,
  collectionId: string | null | undefined
): Collection | null {
  return project.collections.find((collection) => collection.id === collectionId) ?? null;
}

export function getActiveComparison(project: Project): Comparison | null {
  return project.comparisons.find((comparison) => comparison.id === project.activeComparisonId)
    ?? project.comparisons[0]
    ?? null;
}

export function getActiveCollection(project: Project, side: CollectionSide): Collection | null {
  const comparison = getActiveComparison(project);
  const collectionId = side === "right" ? comparison?.rightCollectionId : comparison?.leftCollectionId;
  return getCollection(project, collectionId);
}

export function getActivePairs(project: Project): Pair[] {
  return getActiveComparison(project)?.pairs ?? [];
}

export function getSelectedPairId(project: Project): string | null {
  return getActiveComparison(project)?.selectedPairId ?? null;
}

export function setSelectedPairId(project: Project, pairId: string): boolean {
  const comparison = getActiveComparison(project);
  if (!comparison || !comparison.pairs.some((pair) => pair.id === pairId)) return false;
  comparison.selectedPairId = pairId;
  touchProject(project);
  return true;
}

function resolveCollectionId(project: Project, collectionIdOrSide: string): string | null {
  if (collectionIdOrSide === "left" || collectionIdOrSide === "right") {
    return getActiveCollection(project, collectionIdOrSide)?.id ?? null;
  }
  return collectionIdOrSide;
}

export function addCollection(
  project: Project,
  name = `Collection ${project.collections.length + 1}`
): Collection {
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

export function renameCollection(project: Project, collectionId: string, name: string): boolean {
  const collection = getCollection(project, collectionId);
  const trimmed = name.trim();
  if (!collection || !trimmed) return false;
  collection.name = trimmed;
  touchProject(project);
  return true;
}

export function removeCollection(project: Project, collectionId: string): boolean {
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
    active = createComparison(left!.id, right?.id ?? null);
    project.comparisons.push(active);
  }
  project.activeComparisonId = active.id;
  synchronizeComparison(project, active);
  touchProject(project);
  return true;
}

/** Selects the collections compared in the active view. */
export function setActiveCollections(
  project: Project,
  leftCollectionId: string,
  rightCollectionId: string | null = null
): ActiveCollectionSelection {
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

export function addImages(
  project: Project,
  collectionIdOrSide: string,
  records: readonly ImageRecord[]
): ImageRecord[] {
  const collectionId = resolveCollectionId(project, collectionIdOrSide);
  const collection = getCollection(project, collectionId);
  if (!collection) throw new TypeError(`Unknown collection: ${collectionIdOrSide}`);

  const fingerprints = new Set(
    collection.images.map((image) => `${image.relativePath || image.name}\u0000${image.size}\u0000${image.lastModified}`)
  );
  const accepted: ImageRecord[] = [];
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

export function getImage(
  project: Project,
  side: CollectionSide,
  imageId: string | null | undefined
): ImageRecord | null {
  if (!imageId) return null;
  return getActiveCollection(project, side)?.images.find((image) => image.id === imageId) ?? null;
}

export function getPair(project: Project, pairId: string | null | undefined): Pair | null {
  return getActivePairs(project).find((pair) => pair.id === pairId) ?? null;
}

export function getSelectedPair(project: Project): Pair | null {
  const comparison = getActiveComparison(project);
  return getPair(project, comparison?.selectedPairId) ?? comparison?.pairs[0] ?? null;
}

export function synchronizeComparison(
  project: Project,
  comparison: Comparison | null = getActiveComparison(project)
): Pair[] {
  if (!comparison) return [];
  const left = getCollection(project, comparison.leftCollectionId);
  const right = getCollection(project, comparison.rightCollectionId);
  const leftIds = new Set(left?.images.map((image) => image.id) ?? []);
  const rightIds = new Set(right?.images.map((image) => image.id) ?? []);
  const retained: Pair[] = [];
  const usedLeft = new Set<string>();
  const usedRight = new Set<string>();

  for (const pair of comparison.pairs) {
    const leftId = pair.leftId && leftIds.has(pair.leftId) && !usedLeft.has(pair.leftId)
      ? pair.leftId
      : null;
    const rightId = pair.rightId && rightIds.has(pair.rightId) && !usedRight.has(pair.rightId)
      ? pair.rightId
      : null;
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

function autoPairComparison(project: Project, comparison: Comparison): Pair[] {
  const previousSettings = new Map<string, PairSettings>();
  for (const pair of comparison.pairs) {
    if (pair.leftId) previousSettings.set(pair.leftId, pair.settings);
  }

  const left = [...(getCollection(project, comparison.leftCollectionId)?.images ?? [])]
    .sort((a, b) => naturalCompare(a.name, b.name));
  const right = [...(getCollection(project, comparison.rightCollectionId)?.images ?? [])]
    .sort((a, b) => naturalCompare(a.name, b.name));
  const rightByStem = new Map<string, ImageRecord[]>();
  for (const image of right) {
    const stem = normalizeStem(image.relativePath || image.name);
    if (!rightByStem.has(stem)) rightByStem.set(stem, []);
    rightByStem.get(stem)?.push(image);
  }

  const usedRight = new Set<string>();
  const pairs: Pair[] = [];
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
    pair.rightId = unmatchedRight[rightIndex]!.id;
    rightIndex += 1;
  }
  for (; rightIndex < unmatchedRight.length; rightIndex += 1) {
    pairs.push(createPair(null, unmatchedRight[rightIndex]!.id));
  }

  comparison.pairs = pairs;
  if (!pairs.some((pair) => pair.id === comparison.selectedPairId)) {
    comparison.selectedPairId = pairs[0]?.id ?? null;
  }
  return pairs;
}

export function autoPair(project: Project): Pair[] {
  const comparison = getActiveComparison(project);
  if (!comparison) return [];
  const pairs = autoPairComparison(project, comparison);
  touchProject(project);
  return pairs;
}

export function mapPair(
  project: Project,
  pairId: string,
  rightId: string | null
): boolean {
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

export function removePair(project: Project, pairId: string): boolean {
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

export function resetPairSettings(pair: Pair): void {
  pair.settings = clonePairSettings();
}

export function touchProject(project: Project): void {
  project.updatedAt = new Date().toISOString();
}

function requiredStringField(source: UnknownRecord, key: string, message: string): string {
  const value = source[key];
  if (isNonEmptyString(value)) return value;
  throw new TypeError(message);
}

function timestampField(source: UnknownRecord, key: "createdAt" | "updatedAt", fallback: string): string {
  if (!Object.hasOwn(source, key) || source[key] === undefined) return fallback;
  if (isNonEmptyString(source[key])) return source[key];
  throw new TypeError(`Project contains an invalid ${key} value.`);
}

function generatedIdField(source: UnknownRecord, prefix: string, context: string): string {
  if (
    !Object.hasOwn(source, "id")
    || source.id === undefined
    || source.id === null
    || source.id === ""
  ) {
    return id(prefix);
  }
  if (isNonEmptyString(source.id)) return source.id;
  throw new TypeError(`${context} contains an invalid id value.`);
}

function nullableReferenceField(source: UnknownRecord, key: string, context: string): string | null {
  if (
    !Object.hasOwn(source, key)
    || source[key] === undefined
    || source[key] === null
    || source[key] === ""
  ) {
    return null;
  }
  const value = source[key];
  if (isNonEmptyString(value)) return value;
  throw new TypeError(`${context} contains an invalid ${key} value.`);
}

function requiredDimensionField(source: UnknownRecord, key: "width" | "height", label: string): number {
  const value = source[key];
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  throw new TypeError(`The ${label} collection contains an invalid image record.`);
}

function normalizeImageRecord(value: unknown, label: string): ImageRecord {
  if (!isRecord(value)) {
    throw new TypeError(`The ${label} collection contains an invalid image record.`);
  }
  const message = `The ${label} collection contains an invalid image record.`;
  return {
    ...value,
    id: requiredStringField(value, "id", message),
    name: requiredStringField(value, "name", message),
    type: stringField(value, "type", "image/unknown", "Image record"),
    size: numberField(value, "size", 0, "Image record"),
    width: requiredDimensionField(value, "width", label),
    height: requiredDimensionField(value, "height", label),
    lastModified: numberField(value, "lastModified", 0, "Image record"),
    relativePath: stringField(value, "relativePath", "", "Image record"),
    dataUrl: requiredStringField(value, "dataUrl", message)
  };
}

function normalizeCollection(value: unknown, label: string, generateId: boolean): Collection {
  if (!isRecord(value) || !isNonEmptyString(value.name) || !Array.isArray(value.images)) {
    throw new TypeError(`Project contains an invalid ${label} collection.`);
  }
  let collectionId: string;
  if (isNonEmptyString(value.id)) {
    collectionId = value.id;
  } else if (generateId && (!Object.hasOwn(value, "id") || value.id === null || value.id === "")) {
    collectionId = id("collection");
  } else {
    throw new TypeError(`Project contains an invalid ${label} collection.`);
  }
  return {
    ...value,
    id: collectionId,
    name: value.name,
    images: value.images.map((image) => normalizeImageRecord(image, label))
  };
}

function normalizePair(value: unknown): Pair {
  if (!isRecord(value)) throw new TypeError("Project contains an invalid image pair.");
  return {
    ...value,
    id: generatedIdField(value, "pair", "Image pair"),
    leftId: nullableReferenceField(value, "leftId", "Image pair"),
    rightId: nullableReferenceField(value, "rightId", "Image pair"),
    notes: stringField(value, "notes", "", "Image pair"),
    rating: numberField(value, "rating", 0, "Image pair"),
    settings: clonePairSettings(value.settings)
  };
}

function normalizeComparison(value: unknown, collectionIds: ReadonlySet<string>): Comparison | null {
  if (!isRecord(value)) throw new TypeError("Project contains an invalid comparison.");
  if (!Object.hasOwn(value, "leftCollectionId")) return null;
  if (!isNonEmptyString(value.leftCollectionId)) {
    throw new TypeError("Comparison contains an invalid leftCollectionId value.");
  }
  const leftCollectionId = value.leftCollectionId;
  if (!collectionIds.has(leftCollectionId)) return null;

  const rightCollectionId = nullableReferenceField(value, "rightCollectionId", "Comparison");
  if (
    (rightCollectionId && !collectionIds.has(rightCollectionId))
    || leftCollectionId === rightCollectionId
  ) {
    return null;
  }
  if (Object.hasOwn(value, "pairs") && !Array.isArray(value.pairs)) {
    throw new TypeError("Comparison pairs must be an array.");
  }
  const pairValues = Array.isArray(value.pairs) ? value.pairs : [];
  return {
    ...value,
    id: generatedIdField(value, "comparison", "Comparison"),
    leftCollectionId,
    rightCollectionId,
    pairs: pairValues.map(normalizePair),
    selectedPairId: nullableReferenceField(value, "selectedPairId", "Comparison")
  };
}

function legacyComparisonMode(pairs: readonly unknown[], selectedPairId: unknown): ComparisonMode {
  const selectedPair = pairs.find(
    (pair) => isRecord(pair) && pair.id === selectedPairId
  ) ?? pairs[0];
  if (!isRecord(selectedPair) || !isRecord(selectedPair.settings)) return "side";
  return isComparisonMode(selectedPair.settings.mode) ? selectedPair.settings.mode : "side";
}

function projectComparisonMode(
  project: UnknownRecord,
  comparisons: readonly unknown[]
): ComparisonMode {
  if (isComparisonMode(project.comparisonMode)) return project.comparisonMode;
  const active = comparisons.find(
    (comparison) => isRecord(comparison) && comparison.id === project.activeComparisonId
  ) ?? comparisons[0];
  if (!isRecord(active) || !Array.isArray(active.pairs)) return "side";
  return legacyComparisonMode(active.pairs, active.selectedPairId);
}

function projectVersion(project: UnknownRecord): number | undefined {
  if (!Object.hasOwn(project, "version")) return undefined;
  if (
    typeof project.version !== "number"
    || !Number.isInteger(project.version)
    || project.version < 1
  ) {
    throw new TypeError("Project contains an invalid version value.");
  }
  if (project.version > PROJECT_VERSION) {
    throw new TypeError(`Project version ${project.version} is newer than this app supports.`);
  }
  return project.version;
}

export function normalizeProject(value: unknown): Project {
  if (!isRecord(value) || value.format !== PROJECT_FORMAT) {
    throw new TypeError("This is not a Picturesque project file.");
  }
  const version = projectVersion(value);
  const projectId = requiredStringField(value, "id", "The project file is incomplete.");
  const projectName = requiredStringField(value, "name", "The project file is incomplete.");
  const legacy = version === 1 || !Array.isArray(value.collections);

  let collections: Collection[];
  let comparisonValues: unknown[];
  let requestedActiveComparisonId: string | null;
  let comparisonMode: ComparisonMode;

  if (legacy) {
    if (
      !isRecord(value.collections)
      || !value.collections.left
      || !value.collections.right
      || !Array.isArray(value.pairs)
    ) {
      throw new TypeError("The version 1 project file is incomplete.");
    }
    collections = [
      normalizeCollection(value.collections.left, "#1", true),
      normalizeCollection(value.collections.right, "#2", true)
    ];
    const comparisonId = id("comparison");
    comparisonValues = [{
      id: comparisonId,
      leftCollectionId: collections[0]?.id,
      rightCollectionId: collections[1]?.id,
      pairs: value.pairs,
      selectedPairId: value.selectedPairId ?? null
    }];
    requestedActiveComparisonId = comparisonId;
    comparisonMode = legacyComparisonMode(value.pairs, value.selectedPairId);
  } else {
    if (!Array.isArray(value.collections) || !Array.isArray(value.comparisons)) {
      throw new TypeError("The project file is incomplete.");
    }
    if (!value.collections.length) {
      throw new TypeError("A project must contain at least one collection.");
    }
    collections = value.collections.map(
      (collection, index) => normalizeCollection(collection, `#${index + 1}`, false)
    );
    comparisonValues = value.comparisons;
    requestedActiveComparisonId = nullableReferenceField(value, "activeComparisonId", "Project");
    comparisonMode = projectComparisonMode(value, comparisonValues);
  }

  const collectionIds = new Set(collections.map((collection) => collection.id));
  const comparisons = comparisonValues
    .map((comparison) => normalizeComparison(comparison, collectionIds))
    .filter((comparison): comparison is Comparison => comparison !== null);
  if (!comparisons.length) {
    const left = collections[0];
    if (!left) throw new TypeError("A project must contain at least one collection.");
    comparisons.push(createComparison(left.id, collections[1]?.id ?? null));
  }
  const activeComparisonId = requestedActiveComparisonId
    && comparisons.some((comparison) => comparison.id === requestedActiveComparisonId)
    ? requestedActiveComparisonId
    : comparisons[0]!.id;
  const now = new Date().toISOString();
  const normalizedProject: Project = {
    ...value,
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    id: projectId,
    name: projectName,
    kind: collections.length > 1 ? "comparison" : "single",
    comparisonMode,
    createdAt: timestampField(value, "createdAt", now),
    updatedAt: timestampField(value, "updatedAt", now),
    collections,
    comparisons,
    activeComparisonId
  };
  for (const comparison of normalizedProject.comparisons) {
    synchronizeComparison(normalizedProject, comparison);
  }
  const normalized = Object.assign(value, normalizedProject);
  if (legacy) {
    delete normalized.pairs;
    delete normalized.selectedPairId;
  }
  return normalized;
}

export function serializeProject(project: Project): string {
  return JSON.stringify({ ...project, format: PROJECT_FORMAT, version: PROJECT_VERSION });
}

export function parseProject(text: string): Project {
  return normalizeProject(JSON.parse(text));
}

export function pairDisplayName(project: Project, pair: Pair | null | undefined): string {
  const left = getImage(project, "left", pair?.leftId);
  const right = getImage(project, "right", pair?.rightId);
  return left?.name ?? right?.name ?? "Untitled pair";
}

export function projectSummary(project: Project): ProjectSummary {
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
