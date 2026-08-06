import {
  DEFAULT_LAYER_SETTINGS,
  addCollection,
  addImages,
  autoPair,
  clonePairSettings,
  createImageRecord,
  createProject,
  getActiveCollection,
  getActiveComparison,
  getActivePairs,
  getCollection,
  getComparisonMode,
  getImage,
  getPair,
  getSelectedPair,
  getSelectedPairId,
  mapPair,
  normalizeProject,
  pairDisplayName,
  parseProject,
  projectSummary,
  removeCollection,
  renameCollection,
  resetPairSettings,
  serializeProject,
  setActiveCollections,
  setComparisonMode,
  setSelectedPairId,
  touchProject
} from "./project.js";
import { renderComparisonExport } from "./comparison-export.js";
import {
  canExportAnimatedGif,
  coerceExportLongEdge,
  exportExtension,
  exportSizeOptions,
  uniqueExportFilename
} from "./export-format.js";
import { ComparisonRenderer, computeExportSize } from "./renderer.js";
import {
  deleteBrowserProject,
  listBrowserProjects,
  loadProjectFromBrowser,
  saveProjectToBrowser
} from "./storage.js";
import { buildZip } from "./zip.js";

const LAST_PROJECT_KEY = "frame-match:last-project";
const THEME_KEY = "frame-match:theme";
const AUTOSAVE_DELAY = 1400;
const RENDER_LABEL_HEIGHT = 34;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const elements = {
  canvas: $("#comparisonCanvas"),
  canvasStage: $("#canvasStage"),
  canvasEmpty: $("#canvasEmpty"),
  dropOverlay: $("#dropOverlay"),
  pairList: $("#pairList"),
  pairListEmpty: $("#pairListEmpty"),
  collectionList: $("#collectionList"),
  leftCollectionSelect: $("#leftCollectionSelect"),
  rightCollectionSelect: $("#rightCollectionSelect"),
  mappingSelect: $("#mappingSelect"),
  toastRegion: $("#toastRegion"),
  exportDialog: $("#exportDialog"),
  exportPreviewCanvas: $("#exportPreviewCanvas"),
  recentProjectsDialog: $("#recentProjectsDialog"),
  newProjectDialog: $("#newProjectDialog"),
  collectionDialog: $("#collectionDialog"),
  shortcutsDialog: $("#shortcutsDialog")
};

const state = {
  project: createProject(),
  renderer: new ComparisonRenderer(elements.canvas),
  view: { zoom: 1, panX: 0, panY: 0 },
  appearanceLayer: "left",
  renderToken: 0,
  blinkPhase: 0,
  blinkTimer: null,
  autosaveTimer: null,
  dirty: false,
  dragDepth: 0,
  pointer: null,
  exportBusy: false,
  exportPreviewToken: 0,
  exportFormat: "png",
  exportLongEdges: { static: "2400", gif: "960" },
  importTargetCollectionId: null
};

state.renderer.onResize = () => renderCanvas();

function selectedPair() {
  return getSelectedPair(state.project);
}

function activeComparison() {
  return getActiveComparison(state.project);
}

function activePairs() {
  return getActivePairs(state.project);
}

function activeCollection(side) {
  return getActiveCollection(state.project, side);
}

function setSaveStatus(status) {
  const indicator = $("#saveIndicator");
  indicator.classList.toggle("dirty", status === "dirty");
  indicator.classList.toggle("saving", status === "saving");
  indicator.title = status === "saved" ? "Saved in this browser" : status === "saving" ? "Saving…" : "Unsaved changes";
}

function markDirty({ render = true, controls = false, pairs = false } = {}) {
  touchProject(state.project);
  state.dirty = true;
  setSaveStatus("dirty");
  if (render) renderCanvas();
  if (controls) syncInspector();
  if (pairs) renderPairList();
  scheduleAutosave();
}

function scheduleAutosave() {
  clearTimeout(state.autosaveTimer);
  state.autosaveTimer = setTimeout(async () => {
    setSaveStatus("saving");
    try {
      await saveProjectToBrowser(state.project);
      localStorage.setItem(LAST_PROJECT_KEY, state.project.id);
      state.dirty = false;
      setSaveStatus("saved");
    } catch (error) {
      setSaveStatus("dirty");
      showToast(`Browser save failed: ${error.message}`, "error", 6000);
    }
  }, AUTOSAVE_DELAY);
}

function showToast(message, kind = "success", duration = 3600) {
  const toast = document.createElement("div");
  toast.className = `toast ${kind}`;
  const copy = document.createElement("span");
  copy.textContent = message;
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.addEventListener("click", () => toast.remove());
  toast.append(copy, close);
  elements.toastRegion.append(toast);
  setTimeout(() => toast.remove(), duration);
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatDate(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function safeFilename(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "comparison";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function rangeProgress(input) {
  const minimum = Number(input.min || 0);
  const maximum = Number(input.max || 100);
  const value = Number(input.value);
  const progress = maximum === minimum ? 0 : ((value - minimum) / (maximum - minimum)) * 100;
  input.style.setProperty("--range-progress", `${progress}%`);
}

function updateRangeOutputs() {
  $$('input[type="range"]').forEach(rangeProgress);
  const pair = selectedPair();
  if (!pair) return;
  const settings = pair.settings;
  const formats = {
    opacity: (value) => `${value}%`,
    wipe: (value) => `${value}%`,
    blinkInterval: (value) => `${value} ms`,
    offsetX: (value) => `${Number(value).toFixed(1)}%`,
    offsetY: (value) => `${Number(value).toFixed(1)}%`,
    scale: (value) => `${Number(value).toFixed(1)}%`,
    rotation: (value) => `${Number(value).toFixed(1)}°`
  };
  for (const [key, formatter] of Object.entries(formats)) {
    const output = $(`[data-output-for="${key}"]`);
    if (output) output.textContent = formatter(settings[key]);
  }
  $("#quickOpacityValue").textContent = `${settings.opacity}%`;

  const layer = settings.layers[state.appearanceLayer];
  const layerFormats = {
    brightness: (value) => `${value}%`,
    contrast: (value) => `${value}%`,
    saturation: (value) => `${value}%`,
    warmth: (value) => `${value > 0 ? "+" : ""}${value}`,
    grayscale: (value) => `${value}%`
  };
  for (const [key, formatter] of Object.entries(layerFormats)) {
    const output = $(`[data-layer-output="${key}"]`);
    if (output) output.textContent = formatter(layer[key]);
  }
}

function setControlValue(input, value) {
  if (input.type === "checkbox") input.checked = Boolean(value);
  else input.value = value;
  if (input.type === "range") rangeProgress(input);
}

function syncInspector() {
  const pair = selectedPair();
  $("#inspectorPairTitle").textContent = pair ? pairDisplayName(state.project, pair) : "No pair selected";
  $("#resetAllButton").disabled = !pair;
  elements.mappingSelect.disabled = !pair;

  $$('[data-setting]').forEach((input) => {
    input.disabled = !pair;
    if (pair) setControlValue(input, pair.settings[input.dataset.setting]);
  });
  if (pair) {
    $$('[data-layer-setting]').forEach((input) => {
      setControlValue(input, pair.settings.layers[state.appearanceLayer][input.dataset.layerSetting]);
    });
    $("#quickOpacity").value = pair.settings.opacity;
    rangeProgress($("#quickOpacity"));
  }
  $$('.layer-tabs button').forEach((button) => button.classList.toggle("active", button.dataset.layer === state.appearanceLayer));

  const mode = getComparisonMode(state.project);
  $$('[data-modes]').forEach((field) => {
    field.hidden = !field.dataset.modes.split(" ").includes(mode);
  });
  elements.quickOpacityControl = $("#quickOpacityControl");
  elements.quickOpacityControl.hidden = !pair || !["overlay", "difference"].includes(mode);
  $("#gridButton").classList.toggle("active", Boolean(pair?.settings.showGrid));
  $$('.mode-button').forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));

  renderMappingSelect();
  renderMetadata();
  updateRangeOutputs();
  ensureBlinkTimer();
}

function renderMappingSelect() {
  const pair = selectedPair();
  elements.mappingSelect.replaceChildren();
  const empty = new Option("Unmapped", "");
  elements.mappingSelect.add(empty);
  const used = new Map(activePairs().filter((candidate) => candidate.rightId).map((candidate) => [candidate.rightId, candidate.id]));
  for (const image of activeCollection("right")?.images ?? []) {
    const owner = used.get(image.id);
    const suffix = owner && owner !== pair?.id ? " · currently paired" : "";
    elements.mappingSelect.add(new Option(`${image.name}${suffix}`, image.id));
  }
  elements.mappingSelect.value = pair?.rightId ?? "";
}

function renderMetadata() {
  const pair = selectedPair();
  const left = pair ? getImage(state.project, "left", pair.leftId) : null;
  const right = pair ? getImage(state.project, "right", pair.rightId) : null;
  const metadata = $("#imageMetadata");
  metadata.replaceChildren();
  for (const [label, image] of [["Collection A", left], ["Collection B", right]]) {
    const row = document.createElement("div");
    const name = document.createElement("span");
    const value = document.createElement("strong");
    name.textContent = label;
    value.textContent = image ? `${image.name} · ${image.width}×${image.height} · ${formatBytes(image.size)}` : "Unmapped";
    row.append(name, value);
    metadata.append(row);
  }
}

function collectionSummary(collection) {
  const images = collection?.images ?? [];
  const bytes = images.reduce((sum, image) => sum + image.size, 0);
  return images.length ? `${images.length} image${images.length === 1 ? "" : "s"} · ${formatBytes(bytes)}` : "No images";
}

function createCollectionCard(collection, index) {
  const left = activeCollection("left");
  const right = activeCollection("right");
  const card = document.createElement("section");
  card.className = "collection-card";
  card.dataset.collectionId = collection.id;

  const heading = document.createElement("div");
  heading.className = "collection-card-heading";
  const marker = document.createElement("div");
  marker.className = "collection-index";
  marker.textContent = String(index + 1);
  const copy = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = collection.name;
  const summary = document.createElement("span");
  summary.textContent = collectionSummary(collection);
  copy.append(name, summary);
  const roles = document.createElement("div");
  roles.className = "collection-role-badges";
  if (collection.id === left?.id) {
    const badge = document.createElement("span");
    badge.className = "collection-role left";
    badge.textContent = "A";
    roles.append(badge);
  }
  if (collection.id === right?.id) {
    const badge = document.createElement("span");
    badge.className = "collection-role right";
    badge.textContent = "B";
    roles.append(badge);
  }
  heading.append(marker, copy, roles);

  const actions = document.createElement("div");
  actions.className = "collection-actions";
  const files = document.createElement("button");
  files.type = "button";
  files.className = "button secondary small";
  files.dataset.collectionAction = "files";
  files.textContent = "Add files";
  const folder = document.createElement("button");
  folder.type = "button";
  folder.className = "icon-button small";
  folder.dataset.collectionAction = "folder";
  folder.title = "Add folder";
  folder.ariaLabel = `Add folder to ${collection.name}`;
  folder.innerHTML = '<svg><use href="#icon-folder"></use></svg>';
  const rename = document.createElement("button");
  rename.type = "button";
  rename.className = "icon-button small collection-more";
  rename.dataset.collectionAction = "rename";
  rename.title = "Rename collection";
  rename.ariaLabel = `Rename ${collection.name}`;
  rename.innerHTML = '<svg><use href="#icon-more"></use></svg>';
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "icon-button small collection-more";
  remove.dataset.collectionAction = "delete";
  remove.title = "Delete collection";
  remove.ariaLabel = `Delete ${collection.name}`;
  remove.disabled = state.project.collections.length <= 1;
  remove.innerHTML = '<svg><use href="#icon-trash"></use></svg>';
  actions.append(files, folder, rename, remove);
  card.append(heading, actions);
  return card;
}

function renderCollectionSelectors() {
  const left = activeCollection("left");
  const right = activeCollection("right");
  const buildOptions = (select, selectedId, blockedId, placeholder) => {
    select.replaceChildren();
    if (placeholder) select.add(new Option(placeholder, ""));
    for (const collection of state.project.collections) {
      const option = new Option(collection.name, collection.id);
      option.disabled = collection.id === blockedId;
      select.add(option);
    }
    select.value = selectedId ?? "";
  };
  buildOptions(elements.leftCollectionSelect, left?.id, right?.id, null);
  buildOptions(elements.rightCollectionSelect, right?.id, left?.id, state.project.collections.length < 2 ? "Add another collection" : "Choose collection B");
  elements.rightCollectionSelect.disabled = state.project.collections.length < 2;
  $("#swapCollectionsButton").disabled = !right;
  $("#comparisonPicker").hidden = state.project.collections.length < 2;
  const saved = state.project.comparisons.filter((comparison) => comparison.rightCollectionId).length;
  $("#savedComparisonCount").textContent = `${saved} view${saved === 1 ? "" : "s"}`;
}

function renderCollections() {
  elements.collectionList.replaceChildren(...state.project.collections.map(createCollectionCard));
  renderCollectionSelectors();
}

function renderProjectChrome() {
  const summary = projectSummary(state.project);
  const comparison = activeComparison();
  const pairs = activePairs();
  $("#projectNameButton").textContent = state.project.name;
  $("#projectKindLabel").textContent = `${summary.collections} collection${summary.collections === 1 ? "" : "s"}`;
  renderCollections();
  $("#pairCount").textContent = summary.pairs;
  $("#autoPairButton").hidden = !comparison?.rightCollectionId;
  $("#totalPairNumber").textContent = summary.pairs;
  const index = pairs.findIndex((pair) => pair.id === comparison?.selectedPairId);
  $("#currentPairNumber").textContent = index >= 0 ? index + 1 : 0;
  $("#previousPairButton").disabled = index <= 0;
  $("#nextPairButton").disabled = index < 0 || index >= pairs.length - 1;
}

function createThumbnail(image) {
  if (!image) {
    const placeholder = document.createElement("span");
    placeholder.className = "pair-thumbnail-placeholder";
    return placeholder;
  }
  const thumbnail = document.createElement("img");
  thumbnail.src = image.dataUrl;
  thumbnail.alt = "";
  thumbnail.loading = "lazy";
  return thumbnail;
}

function createPairRow(pair) {
  const left = getImage(state.project, "left", pair.leftId);
  const right = getImage(state.project, "right", pair.rightId);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pair-row";
  button.dataset.pairId = pair.id;
  button.role = "option";
  button.ariaSelected = String(pair.id === getSelectedPairId(state.project));
  button.classList.toggle("active", pair.id === getSelectedPairId(state.project));

  const thumbnails = document.createElement("span");
  thumbnails.className = "pair-thumbnails";
  thumbnails.append(createThumbnail(left), createThumbnail(right));

  const copy = document.createElement("span");
  copy.className = "pair-row-copy";
  const title = document.createElement("strong");
  title.textContent = left?.name ?? right?.name ?? "Untitled pair";
  const subtitle = document.createElement("span");
  subtitle.textContent = right ? right.name : activeCollection("right") ? "Waiting for match" : "Single image";
  copy.append(title, subtitle);

  const status = document.createElement("span");
  status.className = `pair-status ${pair.leftId && pair.rightId ? "" : "unmapped"}`;
  status.title = pair.leftId && pair.rightId ? "Mapped pair" : "Unmapped image";
  button.append(thumbnails, copy, status);
  return button;
}

function renderPairList() {
  const query = $("#pairSearch").value.trim().toLowerCase();
  const allPairs = activePairs();
  const pairs = allPairs.filter((pair) => {
    if (!query) return true;
    const left = getImage(state.project, "left", pair.leftId)?.name ?? "";
    const right = getImage(state.project, "right", pair.rightId)?.name ?? "";
    return `${left} ${right}`.toLowerCase().includes(query);
  });
  elements.pairList.replaceChildren(...pairs.map(createPairRow));
  elements.pairListEmpty.hidden = allPairs.length > 0;
  if (allPairs.length && !pairs.length) {
    elements.pairListEmpty.hidden = false;
    $("#pairListEmpty strong").textContent = "No matching filenames";
    $("#pairListEmpty span").textContent = "Try a different filter.";
  } else if (!allPairs.length) {
    $("#pairListEmpty strong").textContent = "Add a collection to begin";
    $("#pairListEmpty span").textContent = "Drop image files here or use the buttons above.";
  }
}

async function renderCanvas() {
  const pair = selectedPair();
  const token = ++state.renderToken;
  elements.canvasEmpty.hidden = Boolean(pair);
  if (!pair) {
    await state.renderer.render(state.project, null, state.view);
    $("#renderDimensions").textContent = "—";
    $("#renderStatus").textContent = "Ready";
    return;
  }
  $("#renderStatus").textContent = "Rendering";
  try {
    const result = await state.renderer.render(state.project, pair, state.view, state.blinkPhase);
    if (token !== state.renderToken) return;
    $("#renderDimensions").textContent = result?.width && result?.height ? `${result.width} × ${result.height}` : "Unmapped";
    $("#renderStatus").textContent = getComparisonMode(state.project) === "blink" ? "Blinking" : "Ready";
  } catch (error) {
    if (token !== state.renderToken) return;
    $("#renderStatus").textContent = "Render failed";
    showToast(error.message, "error", 6000);
  }
}

function refresh({ pairs = true, controls = true } = {}) {
  renderProjectChrome();
  if (pairs) renderPairList();
  if (controls) syncInspector();
  renderCanvas();
}

function activateProject(project, { save = false } = {}) {
  clearInterval(state.blinkTimer);
  state.blinkTimer = null;
  state.project = normalizeProject(project);
  state.view = { zoom: 1, panX: 0, panY: 0 };
  state.appearanceLayer = "left";
  state.dirty = false;
  localStorage.setItem(LAST_PROJECT_KEY, state.project.id);
  setSaveStatus(save ? "dirty" : "saved");
  refresh();
  if (save) scheduleAutosave();
}

async function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result), { once: true });
    reader.addEventListener("error", () => reject(reader.error), { once: true });
    reader.readAsDataURL(file);
  });
}

async function dimensionsFromDataUrl(dataUrl) {
  const image = await new Promise((resolve, reject) => {
    const value = new Image();
    value.addEventListener("load", () => resolve(value), { once: true });
    value.addEventListener("error", () => reject(new Error("Unsupported or damaged image.")), { once: true });
    value.src = dataUrl;
  });
  return { width: image.naturalWidth, height: image.naturalHeight };
}

async function fileToImageRecord(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const dimensions = await dimensionsFromDataUrl(dataUrl);
  return createImageRecord({
    name: file.name,
    type: file.type,
    size: file.size,
    width: dimensions.width,
    height: dimensions.height,
    dataUrl,
    lastModified: file.lastModified,
    relativePath: file.webkitRelativePath || ""
  });
}

function isImageFile(file) {
  return file.type.startsWith("image/") || /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i.test(file.name);
}

async function importFiles(fileList, collectionId) {
  const files = [...fileList].filter(isImageFile);
  if (!files.length) {
    showToast("No supported image files were selected.", "error");
    return;
  }
  $("#renderStatus").textContent = `Importing ${files.length}…`;
  const records = [];
  const failures = [];
  for (let index = 0; index < files.length; index += 4) {
    const batch = files.slice(index, index + 4);
    const results = await Promise.allSettled(batch.map(fileToImageRecord));
    results.forEach((result, batchIndex) => {
      if (result.status === "fulfilled") records.push(result.value);
      else failures.push(`${batch[batchIndex].name}: ${result.reason.message}`);
    });
    $("#renderStatus").textContent = `Importing ${Math.min(index + 4, files.length)} / ${files.length}`;
  }

  const collection = getCollection(state.project, collectionId);
  if (!collection) {
    showToast("Choose a collection before importing images.", "error");
    return;
  }
  const accepted = addImages(state.project, collection.id, records);
  const comparison = activeComparison();
  if (comparison && [comparison.leftCollectionId, comparison.rightCollectionId].includes(collection.id)) {
    autoPair(state.project);
  }
  resetView();
  markDirty({ render: false });
  refresh();
  showToast(`${accepted.length} image${accepted.length === 1 ? "" : "s"} added to ${collection.name}.`);
  if (failures.length) showToast(`${failures.length} file${failures.length === 1 ? " was" : "s were"} skipped.`, "error", 6000);
}

function confirmDiscard() {
  return !state.dirty || window.confirm("This project has unsaved changes. Continue and discard them?");
}

function openNewProjectDialog() {
  if (!confirmDiscard()) return;
  $("#newProjectName").value = "Untitled comparison";
  elements.newProjectDialog.showModal();
  requestAnimationFrame(() => $("#newProjectName").select());
}

async function openProjectFile(file) {
  try {
    const project = parseProject(await file.text());
    activateProject(project);
    await saveProjectToBrowser(project);
    showToast(`Opened ${project.name}.`);
  } catch (error) {
    showToast(`Could not open project: ${error.message}`, "error", 7000);
  }
}

async function openProjectUrl(projectPath) {
  const url = new URL(projectPath, `${window.location.origin}${window.location.pathname}`);
  if (url.origin !== window.location.origin) {
    throw new TypeError("Project links must use this app's origin.");
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Project request failed (${response.status}).`);
  const project = parseProject(await response.text());
  activateProject(project);
  await saveProjectToBrowser(project);
  showToast(`Opened ${project.name}.`);
}

function saveProjectFile() {
  const blob = new Blob([serializeProject(state.project)], { type: "application/json" });
  downloadBlob(blob, `${safeFilename(state.project.name)}.framematch.json`);
  showToast("Project file downloaded.");
}

function setSelectedPair(pairId) {
  if (!getPair(state.project, pairId)) return;
  setSelectedPairId(state.project, pairId);
  resetView();
  markDirty({ render: false });
  refresh();
}

function navigatePair(direction) {
  const pairs = activePairs();
  const index = pairs.findIndex((pair) => pair.id === getSelectedPairId(state.project));
  const target = pairs[index + direction];
  if (target) setSelectedPair(target.id);
}

function resetView() {
  state.view = { zoom: 1, panX: 0, panY: 0 };
  updateZoomLabel();
}

function setZoom(zoom, pointer = null) {
  const previous = state.view.zoom;
  const next = Math.min(8, Math.max(0.1, zoom));
  if (pointer) {
    const bounds = elements.canvasStage.getBoundingClientRect();
    const x = pointer.x - bounds.left - bounds.width / 2;
    const y = pointer.y - bounds.top - bounds.height / 2;
    const ratio = next / previous;
    state.view.panX = x - (x - state.view.panX) * ratio;
    state.view.panY = y - (y - state.view.panY) * ratio;
  }
  state.view.zoom = next;
  updateZoomLabel();
  renderCanvas();
}

function updateZoomLabel() {
  $("#zoomValueButton").textContent = `${Math.round(state.view.zoom * 100)}%`;
}

function isInteractivePointerTarget(target) {
  return Boolean(target.closest("button, input, select, textarea, a, label, .quick-control"));
}

function wipePointerPosition(event) {
  const pair = selectedPair();
  const frame = state.renderer.lastFrame?.frame;
  if (!pair || getComparisonMode(state.project) !== "wipe" || !frame) return null;
  const bounds = elements.canvasStage.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  const horizontal = pair.settings.orientation !== "vertical";
  const fraction = pair.settings.wipe / 100;
  const usableHeight = Math.max(1, frame.height - (pair.settings.showLabels ? RENDER_LABEL_HEIGHT : 0));
  const divider = horizontal ? frame.x + frame.width * fraction : frame.y + usableHeight * fraction;
  const pointerAxis = horizontal ? x : y;
  const insideFrame = x >= frame.x && x <= frame.x + frame.width && y >= frame.y && y <= frame.y + frame.height;
  return {
    frame,
    horizontal,
    insideFrame,
    nearDivider: insideFrame && Math.abs(pointerAxis - divider) <= 18,
    x,
    y
  };
}

function updateWipeFromPointer(event) {
  const pair = selectedPair();
  const position = wipePointerPosition(event);
  if (!pair || !position) return;
  const raw = position.horizontal
    ? (position.x - position.frame.x) / position.frame.width
    : (position.y - position.frame.y) / Math.max(1, position.frame.height - (pair.settings.showLabels ? RENDER_LABEL_HEIGHT : 0));
  pair.settings.wipe = Math.round(Math.max(0, Math.min(1, raw)) * 100);
  const input = $('[data-setting="wipe"]');
  input.value = pair.settings.wipe;
  rangeProgress(input);
  updateRangeOutputs();
  markDirty();
}

function ensureBlinkTimer() {
  clearInterval(state.blinkTimer);
  state.blinkTimer = null;
  const pair = selectedPair();
  if (!pair || getComparisonMode(state.project) !== "blink") return;
  state.blinkTimer = setInterval(() => {
    state.blinkPhase += 1;
    renderCanvas();
  }, pair.settings.blinkInterval);
}

function setMode(mode) {
  if (!setComparisonMode(state.project, mode)) return;
  state.blinkPhase = 0;
  markDirty({ controls: true });
  if (elements.exportDialog.open) {
    syncGifFormatAvailability({ notify: true });
    updateExportPreview();
  }
}

function updateSetting(input) {
  const pair = selectedPair();
  if (!pair) return;
  const key = input.dataset.setting;
  const value = input.type === "checkbox" ? input.checked : input.type === "range" ? Number(input.value) : input.value;
  pair.settings[key] = value;
  if (key === "showGrid") $("#gridButton").classList.toggle("active", value);
  if (key === "blinkInterval") ensureBlinkTimer();
  if (key === "opacity") {
    $("#quickOpacity").value = value;
    rangeProgress($("#quickOpacity"));
  }
  updateRangeOutputs();
  markDirty();
}

function updateLayerSetting(input) {
  const pair = selectedPair();
  if (!pair) return;
  pair.settings.layers[state.appearanceLayer][input.dataset.layerSetting] = Number(input.value);
  updateRangeOutputs();
  markDirty();
}

function exportOptions() {
  return {
    format: $("#exportFormat").value,
    longEdge: $("#exportLongEdge").value,
    quality: Number($("#exportQuality").value) / 100,
    includeLabels: $("#exportLabels").checked
  };
}

function exportLongEdgeKind(format) {
  return format === "gif" ? "gif" : "static";
}

function syncExportLongEdgeOptions(format) {
  const select = $("#exportLongEdge");
  const kind = exportLongEdgeKind(format);
  select.replaceChildren(...exportSizeOptions(format).map(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }));
  select.value = coerceExportLongEdge(format, state.exportLongEdges[kind]);
  state.exportLongEdges[kind] = select.value;
  $("#exportLongEdgeHelp").textContent = format === "gif"
    ? "GIF is limited to 1600 px to keep browser memory use predictable."
    : "The aspect ratio is preserved.";
}

function setExportFormat(format) {
  const previousKind = exportLongEdgeKind(state.exportFormat);
  state.exportLongEdges[previousKind] = $("#exportLongEdge").value;
  state.exportFormat = format;
  $("#exportFormat").value = format;
  syncExportLongEdgeOptions(format);
}

function syncGifFormatAvailability({ notify = false } = {}) {
  const formatSelect = $("#exportFormat");
  const gifOption = formatSelect.querySelector('option[value="gif"]');
  const available = canExportAnimatedGif(
    getComparisonMode(state.project),
    Boolean(activeCollection("right"))
  );
  gifOption.disabled = !available;
  gifOption.textContent = available ? "GIF (animated)" : "GIF (Blink mode only)";
  $("#exportFormatHelp").textContent = available
    ? "GIF alternates the mapped A and B images using each pair’s Blink interval."
    : "Animated GIF becomes available when two collections are compared in Blink mode.";
  if (!available && formatSelect.value === "gif") {
    setExportFormat("png");
    if (notify) showToast("GIF is available only in Blink mode; format changed to PNG.");
  }
  return available;
}

function comparisonFilename(pair, options, mode = getComparisonMode(state.project)) {
  const base = safeFilename(pairDisplayName(state.project, pair).replace(/\.[^/.]+$/, ""));
  return `${base}-${mode}.${exportExtension(options.format)}`;
}

async function openExportDialog() {
  if (!selectedPair()) {
    showToast("Add at least one image before exporting.", "error");
    return;
  }
  syncGifFormatAvailability({ notify: true });
  elements.exportDialog.showModal();
  $("#exportFormat").focus();
  await updateExportPreview();
}

async function updateExportPreview() {
  const pair = selectedPair();
  if (!pair || !elements.exportDialog.open) return;
  const previewToken = ++state.exportPreviewToken;
  syncGifFormatAvailability();
  const options = exportOptions();
  rangeProgress($("#exportQuality"));
  $("#exportQualityField").hidden = options.format !== "jpeg";
  $("#exportQualityOutput").textContent = `${Math.round(options.quality * 100)}%`;
  const size = computeExportSize(state.project, pair, options.longEdge === "original" ? Number.NaN : options.longEdge, options.includeLabels);
  const isGif = options.format === "gif";
  const formatLabel = options.format === "jpeg" ? "JPEG" : options.format.toUpperCase();
  const filename = comparisonFilename(pair, options);
  $("#exportPreviewName").textContent = filename;
  $("#exportPreviewDimensions").textContent = isGif
    ? `${size.width} × ${size.height} · 2 frames · ${pair.settings.blinkInterval} ms/frame`
    : `${size.width} × ${size.height} · ${formatLabel}`;
  elements.exportPreviewCanvas.setAttribute(
    "aria-label",
    isGif
      ? `Scaled preview of frame A for ${filename}; the exported GIF alternates frames A and B.`
      : `Scaled preview of ${filename}.`
  );
  const currentGifAvailable = Boolean(pair.leftId && pair.rightId);
  $("#exportCurrentButton").disabled = isGif && !currentGifAvailable;
  $("#exportCurrentButton").title = isGif && !currentGifAvailable
    ? "Map an image from both collections to export this GIF."
    : "";
  $("#exportCurrentButtonLabel").textContent = isGif ? "Export current GIF" : "Export current";
  const batchCount = exportablePairs().length;
  $("#exportZipButton").disabled = batchCount === 0;
  $("#exportAllIndividualButton").disabled = batchCount === 0;
  const batchSummary = batchCount
    ? `${batchCount} mapped pair${batchCount === 1 ? " is" : "s are"} ready for batch export.`
    : "No mapped pairs are ready for batch export.";
  const currentSummary = isGif && !currentGifAvailable
    ? " The current pair needs both an A and B image before it can be exported."
    : "";
  const fastPairCount = isGif
    ? exportablePairs().filter((exportPair) => exportPair.settings.blinkInterval < 400).length
    : 0;
  const fastAnimationWarning = fastPairCount
    ? ` Fast animation warning: ${fastPairCount} mapped pair${fastPairCount === 1 ? " uses" : "s use"} an interval below 400 ms${currentGifAvailable && pair.settings.blinkInterval < 400 ? ", including the current pair" : ""}.`
    : "";
  const batchMemoryWarning = isGif && batchCount > 10
    ? " Large GIF batches can use significant browser memory while the ZIP is assembled."
    : "";
  $("#exportNoteText").textContent = isGif
    ? `GIF exports two continuously looping frames using each pair’s saved Blink interval and tuning. ${batchSummary}${currentSummary}${fastAnimationWarning}${batchMemoryWarning}`
    : `ZIP creates one ${formatLabel} per mapped pair with the current comparison mode and each pair’s saved tuning. ${batchSummary}`;
  await state.renderer.renderPreview(
    elements.exportPreviewCanvas,
    state.project,
    pair,
    options,
    () => previewToken === state.exportPreviewToken && elements.exportDialog.open
  );
}

function setExportIndeterminate(message) {
  const progress = $("#exportProgress");
  progress.hidden = false;
  progress.classList.add("indeterminate");
  progress.style.removeProperty("--export-progress");
  progress.removeAttribute("aria-valuenow");
  progress.removeAttribute("aria-valuemax");
  progress.setAttribute("aria-valuetext", message);
  progress.querySelector("strong").textContent = message;
  $("#exportProgressText").textContent = "Please wait";
}

function setExportInteractionBusy(busy, message = "Preparing export…") {
  state.exportBusy = busy;
  if (busy) state.exportPreviewToken += 1;
  elements.exportDialog.setAttribute("aria-busy", String(busy));
  elements.exportDialog.querySelectorAll("button, input, select").forEach((control) => {
    control.disabled = busy;
  });
  if (busy) {
    setExportIndeterminate(message);
  } else {
    elements.exportDialog.removeAttribute("aria-busy");
    $("#exportProgress").hidden = true;
    $("#exportProgress").classList.remove("indeterminate");
    updateExportPreview();
  }
}

async function exportCurrent() {
  if (state.exportBusy) return;
  const pair = selectedPair();
  if (!pair) return;
  const options = exportOptions();
  if (options.format === "gif" && (!pair.leftId || !pair.rightId)) {
    showToast("Map an image from both collections before exporting this GIF.", "error");
    return;
  }
  const mode = getComparisonMode(state.project);
  setExportInteractionBusy(true, options.format === "gif" ? "Encoding GIF…" : "Rendering comparison…");
  try {
    const { blob } = await renderComparisonExport(
      state.renderer,
      state.project,
      pair,
      mode,
      options
    );
    downloadBlob(blob, comparisonFilename(pair, options, mode));
    showToast("Comparison exported.");
  } catch (error) {
    showToast(`Export failed: ${error.message}`, "error", 6000);
  } finally {
    setExportInteractionBusy(false);
  }
}

function exportablePairs() {
  if (!activeCollection("right")) return activePairs().filter((pair) => pair.leftId || pair.rightId);
  return activePairs().filter((pair) => pair.leftId && pair.rightId);
}

function setExportProgress(index, total, format) {
  const progress = $("#exportProgress");
  progress.hidden = false;
  progress.classList.remove("indeterminate");
  progress.style.setProperty("--export-progress", `${total ? index / total * 100 : 0}%`);
  progress.setAttribute("aria-valuenow", String(index));
  progress.setAttribute("aria-valuemax", String(total));
  progress.setAttribute("aria-valuetext", `${index} of ${total}`);
  progress.querySelector("strong").textContent = format === "gif" ? "Encoding GIFs…" : "Rendering comparisons…";
  $("#exportProgressText").textContent = `${index} / ${total}`;
}

async function exportAll(asZip) {
  if (state.exportBusy) return;
  const pairs = exportablePairs();
  if (!pairs.length) {
    showToast("There are no mapped pairs to export.", "error");
    return;
  }
  const options = exportOptions();
  const mode = getComparisonMode(state.project);
  const files = [];
  const usedNames = new Set();
  setExportInteractionBusy(true, options.format === "gif" ? "Preparing GIF export…" : "Preparing export…");
  try {
    setExportProgress(0, pairs.length, options.format);
    for (let index = 0; index < pairs.length; index += 1) {
      const pair = pairs[index];
      const { blob } = await renderComparisonExport(
        state.renderer,
        state.project,
        pair,
        mode,
        options
      );
      const name = uniqueExportFilename(comparisonFilename(pair, options, mode), usedNames);
      if (asZip) files.push({ name, data: blob });
      else downloadBlob(blob, name);
      setExportProgress(index + 1, pairs.length, options.format);
      if (!asZip) await new Promise((resolve) => setTimeout(resolve, 80));
    }
    if (asZip) {
      setExportIndeterminate("Creating ZIP…");
      const zip = await buildZip(files);
      downloadBlob(zip, `${safeFilename(state.project.name)}-comparisons.zip`);
    }
    showToast(`${pairs.length} comparison${pairs.length === 1 ? "" : "s"} exported${asZip ? " as ZIP" : ""}.`);
  } catch (error) {
    showToast(`Export failed: ${error.message}`, "error", 7000);
  } finally {
    setExportInteractionBusy(false);
  }
}

async function renderRecentProjects() {
  const list = $("#recentProjectList");
  list.replaceChildren();
  try {
    const projects = await listBrowserProjects();
    if (!projects.length) {
      const empty = document.createElement("div");
      empty.className = "recent-empty";
      empty.textContent = "No browser-saved projects yet.";
      list.append(empty);
      return;
    }
    for (const project of projects) {
      const item = document.createElement("div");
      item.className = "recent-project-item";
      const copy = document.createElement("div");
      const name = document.createElement("strong");
      const meta = document.createElement("span");
      name.textContent = project.name;
      const collectionCount = project.collectionCount ?? 2;
      meta.textContent = `${collectionCount} collection${collectionCount === 1 ? "" : "s"} · ${project.pairCount} current pair${project.pairCount === 1 ? "" : "s"} · ${formatDate(project.updatedAt)}`;
      copy.append(name, meta);
      const open = document.createElement("button");
      open.type = "button";
      open.className = "button secondary small";
      open.textContent = "Open";
      open.addEventListener("click", async () => {
        const loaded = await loadProjectFromBrowser(project.id);
        if (!loaded) return;
        elements.recentProjectsDialog.close();
        activateProject(loaded);
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button small";
      remove.title = "Delete browser copy";
      remove.innerHTML = '<svg><use href="#icon-trash"></use></svg>';
      remove.addEventListener("click", async () => {
        if (!window.confirm(`Delete the browser-saved copy of “${project.name}”?`)) return;
        await deleteBrowserProject(project.id);
        await renderRecentProjects();
      });
      item.append(copy, open, remove);
      list.append(item);
    }
  } catch (error) {
    const empty = document.createElement("div");
    empty.className = "recent-empty";
    empty.textContent = `Browser storage unavailable: ${error.message}`;
    list.append(empty);
  }
}

function closeOwningDialog(event) {
  event.currentTarget.closest("dialog")?.close();
}

function openCollectionDialog() {
  $("#collectionName").value = `Collection ${state.project.collections.length + 1}`;
  elements.collectionDialog.showModal();
  requestAnimationFrame(() => $("#collectionName").select());
}

function triggerCollectionImport(collectionId, folder = false) {
  if (!getCollection(state.project, collectionId)) return;
  state.importTargetCollectionId = collectionId;
  $(folder ? "#collectionFolderInput" : "#collectionFilesInput").click();
}

function activateCollectionPair(leftCollectionId, rightCollectionId) {
  if (!leftCollectionId || !rightCollectionId || leftCollectionId === rightCollectionId) return;
  const { created } = setActiveCollections(state.project, leftCollectionId, rightCollectionId);
  resetView();
  markDirty({ render: false });
  refresh();
  if (created) showToast("Created a saved comparison view for these collections.");
}

function bindFileInput(inputSelector) {
  const input = $(inputSelector);
  input.addEventListener("change", async () => {
    if (state.importTargetCollectionId) await importFiles(input.files, state.importTargetCollectionId);
    input.value = "";
  });
}

function bindEvents() {
  $("#newProjectButton").addEventListener("click", openNewProjectDialog);
  $("#newProjectForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    activateProject(createProject(String(data.get("name")), String(data.get("kind"))), { save: true });
    elements.newProjectDialog.close();
  });
  $("#addCollectionButton").addEventListener("click", openCollectionDialog);
  $("#collectionForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const collection = addCollection(state.project, String(data.get("name")));
    elements.collectionDialog.close();
    markDirty({ render: false });
    refresh();
    showToast(`Added ${collection.name}.`);
  });
  $("#openProjectButton").addEventListener("click", () => $("#projectFileInput").click());
  $("#emptyOpenProjectButton").addEventListener("click", () => $("#projectFileInput").click());
  $("#openProjectFileFromRecent").addEventListener("click", () => {
    elements.recentProjectsDialog.close();
    $("#projectFileInput").click();
  });
  $("#projectFileInput").addEventListener("change", async (event) => {
    if (event.target.files[0] && confirmDiscard()) await openProjectFile(event.target.files[0]);
    event.target.value = "";
  });
  $("#saveProjectButton").addEventListener("click", saveProjectFile);
  $("#projectNameButton").addEventListener("click", () => {
    const name = window.prompt("Project name", state.project.name)?.trim();
    if (!name || name === state.project.name) return;
    state.project.name = name;
    markDirty({ render: false });
    renderProjectChrome();
  });
  $("#localProjectsButton").addEventListener("click", async () => {
    elements.recentProjectsDialog.showModal();
    await renderRecentProjects();
  });
  $("#shortcutsButton").addEventListener("click", () => elements.shortcutsDialog.showModal());
  $$('[data-close-dialog]').forEach((button) => button.addEventListener("click", closeOwningDialog));

  $("#emptyAddLeftButton").addEventListener("click", () => triggerCollectionImport(activeCollection("left")?.id));
  bindFileInput("#collectionFilesInput");
  bindFileInput("#collectionFolderInput");

  elements.collectionList.addEventListener("click", (event) => {
    const action = event.target.closest("[data-collection-action]");
    const card = event.target.closest("[data-collection-id]");
    if (!action || !card) return;
    const collection = getCollection(state.project, card.dataset.collectionId);
    if (!collection) return;
    if (action.dataset.collectionAction === "files") triggerCollectionImport(collection.id);
    else if (action.dataset.collectionAction === "folder") triggerCollectionImport(collection.id, true);
    else if (action.dataset.collectionAction === "rename") {
      const name = window.prompt("Collection name", collection.name)?.trim();
      if (!name || name === collection.name) return;
      renameCollection(state.project, collection.id, name);
      markDirty({ render: false });
      refresh();
    } else if (action.dataset.collectionAction === "delete") {
      if (!window.confirm(`Delete “${collection.name}” and its saved comparison views?`)) return;
      if (!removeCollection(state.project, collection.id)) {
        showToast("A project must keep at least one collection.", "error");
        return;
      }
      markDirty({ render: false });
      refresh();
      showToast(`Deleted ${collection.name}.`);
    }
  });

  elements.leftCollectionSelect.addEventListener("change", () => {
    activateCollectionPair(elements.leftCollectionSelect.value, elements.rightCollectionSelect.value);
  });
  elements.rightCollectionSelect.addEventListener("change", () => {
    activateCollectionPair(elements.leftCollectionSelect.value, elements.rightCollectionSelect.value);
  });
  $("#swapCollectionsButton").addEventListener("click", () => {
    const left = activeCollection("left");
    const right = activeCollection("right");
    if (left && right) activateCollectionPair(right.id, left.id);
  });

  $("#autoPairButton").addEventListener("click", () => {
    autoPair(state.project);
    markDirty({ render: false });
    refresh();
    showToast(`${activeCollection("left")?.name} and ${activeCollection("right")?.name} paired by filename.`);
  });
  $("#pairSearch").addEventListener("input", renderPairList);
  elements.pairList.addEventListener("click", (event) => {
    const row = event.target.closest(".pair-row");
    if (row) setSelectedPair(row.dataset.pairId);
  });
  $("#previousPairButton").addEventListener("click", () => navigatePair(-1));
  $("#nextPairButton").addEventListener("click", () => navigatePair(1));
  elements.mappingSelect.addEventListener("change", () => {
    const pair = selectedPair();
    if (!pair) return;
    mapPair(state.project, pair.id, elements.mappingSelect.value);
    markDirty({ render: false });
    refresh();
  });

  $$('.mode-button').forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  $$('[data-setting]').forEach((input) => {
    input.addEventListener("input", () => updateSetting(input));
    input.addEventListener("change", () => updateSetting(input));
  });
  $$('[data-layer-setting]').forEach((input) => input.addEventListener("input", () => updateLayerSetting(input)));
  $$('.layer-tabs button').forEach((button) => button.addEventListener("click", () => {
    state.appearanceLayer = button.dataset.layer;
    syncInspector();
  }));
  $("#quickOpacity").addEventListener("input", (event) => {
    const pair = selectedPair();
    if (!pair) return;
    pair.settings.opacity = Number(event.target.value);
    const inspector = $('[data-setting="opacity"]');
    inspector.value = event.target.value;
    updateRangeOutputs();
    markDirty();
  });
  $("#resetAlignmentButton").addEventListener("click", () => {
    const pair = selectedPair();
    if (!pair) return;
    Object.assign(pair.settings, { offsetX: 0, offsetY: 0, rotation: 0, scale: 100 });
    markDirty({ controls: true });
  });
  $("#resetAppearanceButton").addEventListener("click", () => {
    const pair = selectedPair();
    if (!pair) return;
    pair.settings.layers[state.appearanceLayer] = { ...DEFAULT_LAYER_SETTINGS };
    markDirty({ controls: true });
  });
  $("#resetAllButton").addEventListener("click", () => {
    const pair = selectedPair();
    if (!pair) return;
    resetPairSettings(pair);
    resetView();
    markDirty({ controls: true });
  });
  $$('.section-heading').forEach((button) => button.addEventListener("click", () => {
    const section = button.closest(".inspector-section");
    section.classList.toggle("collapsed");
    const expanded = !section.classList.contains("collapsed");
    button.ariaExpanded = String(expanded);
    button.lastElementChild.textContent = expanded ? "−" : "+";
  }));

  $("#zoomOutButton").addEventListener("click", () => setZoom(state.view.zoom / 1.2));
  $("#zoomInButton").addEventListener("click", () => setZoom(state.view.zoom * 1.2));
  $("#zoomValueButton").addEventListener("click", () => { resetView(); renderCanvas(); });
  $("#fitButton").addEventListener("click", () => { resetView(); renderCanvas(); });
  $("#gridButton").addEventListener("click", () => {
    const pair = selectedPair();
    if (!pair) return;
    pair.settings.showGrid = !pair.settings.showGrid;
    markDirty({ controls: true });
  });
  $("#fullscreenButton").addEventListener("click", () => elements.canvasStage.requestFullscreen?.());

  elements.canvasStage.addEventListener("wheel", (event) => {
    if (!selectedPair() || isInteractivePointerTarget(event.target)) return;
    event.preventDefault();
    setZoom(state.view.zoom * Math.exp(-event.deltaY * 0.0015), { x: event.clientX, y: event.clientY });
  }, { passive: false });
  elements.canvasStage.addEventListener("pointerdown", (event) => {
    if (!selectedPair() || event.button !== 0 || isInteractivePointerTarget(event.target)) return;
    const wipe = wipePointerPosition(event);
    if (wipe?.nearDivider) {
      state.pointer = { id: event.pointerId, kind: "wipe" };
      elements.canvasStage.classList.add("wiping");
      elements.canvasStage.classList.toggle("wipe-ready-horizontal", wipe.horizontal);
      elements.canvasStage.classList.toggle("wipe-ready-vertical", !wipe.horizontal);
      updateWipeFromPointer(event);
    } else {
      state.pointer = { id: event.pointerId, kind: "pan", x: event.clientX, y: event.clientY, panX: state.view.panX, panY: state.view.panY };
      elements.canvasStage.classList.add("panning");
    }
    elements.canvasStage.setPointerCapture(event.pointerId);
  });
  elements.canvasStage.addEventListener("pointermove", (event) => {
    if (state.pointer?.id === event.pointerId) {
      if (state.pointer.kind === "wipe") updateWipeFromPointer(event);
      else {
        state.view.panX = state.pointer.panX + event.clientX - state.pointer.x;
        state.view.panY = state.pointer.panY + event.clientY - state.pointer.y;
        renderCanvas();
      }
      return;
    }
    const wipe = wipePointerPosition(event);
    elements.canvasStage.classList.toggle("wipe-ready-horizontal", Boolean(wipe?.nearDivider && wipe.horizontal));
    elements.canvasStage.classList.toggle("wipe-ready-vertical", Boolean(wipe?.nearDivider && !wipe.horizontal));
    const frame = state.renderer.lastFrame?.frame;
    if (!frame || event.pointerType === "touch") {
      $("#pixelReadout").hidden = true;
      return;
    }
    const bounds = elements.canvasStage.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const normalizedX = (x - frame.x) / frame.width;
    const normalizedY = (y - frame.y) / frame.height;
    const readout = $("#pixelReadout");
    readout.hidden = normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1;
    if (!readout.hidden) readout.textContent = `x ${(normalizedX * 100).toFixed(1)}%  ·  y ${(normalizedY * 100).toFixed(1)}%`;
  });
  const endPan = (event) => {
    if (state.pointer?.id !== event.pointerId) return;
    state.pointer = null;
    elements.canvasStage.classList.remove("panning");
    elements.canvasStage.classList.remove("wiping");
  };
  elements.canvasStage.addEventListener("pointerup", endPan);
  elements.canvasStage.addEventListener("pointercancel", endPan);
  elements.canvasStage.addEventListener("pointerleave", () => {
    if (!state.pointer) {
      $("#pixelReadout").hidden = true;
      elements.canvasStage.classList.remove("wipe-ready-horizontal", "wipe-ready-vertical");
    }
  });
  elements.canvasStage.addEventListener("dblclick", () => { resetView(); renderCanvas(); });

  elements.collectionList.addEventListener("dragover", (event) => {
    const card = event.target.closest("[data-collection-id]");
    if (!card) return;
    event.preventDefault();
    card.classList.add("drag-over");
  });
  elements.collectionList.addEventListener("dragleave", (event) => {
    const card = event.target.closest("[data-collection-id]");
    if (card && !card.contains(event.relatedTarget)) card.classList.remove("drag-over");
  });
  elements.collectionList.addEventListener("drop", async (event) => {
    const card = event.target.closest("[data-collection-id]");
    if (!card) return;
    event.preventDefault();
    event.stopPropagation();
    card.classList.remove("drag-over");
    elements.dropOverlay.hidden = true;
    await importFiles(event.dataTransfer.files, card.dataset.collectionId);
  });
  document.addEventListener("dragenter", (event) => {
    if (![...event.dataTransfer?.types ?? []].includes("Files")) return;
    state.dragDepth += 1;
    elements.dropOverlay.hidden = false;
  });
  document.addEventListener("dragleave", () => {
    state.dragDepth = Math.max(0, state.dragDepth - 1);
    if (!state.dragDepth) elements.dropOverlay.hidden = true;
  });
  document.addEventListener("dragover", (event) => event.preventDefault());
  document.addEventListener("drop", async (event) => {
    event.preventDefault();
    state.dragDepth = 0;
    elements.dropOverlay.hidden = true;
    if (event.target.closest("[data-collection-id]")) return;
    const collection = activeCollection(event.shiftKey ? "right" : "left") ?? activeCollection("left");
    if (collection) await importFiles(event.dataTransfer.files, collection.id);
  });

  $("#exportButton").addEventListener("click", openExportDialog);
  $("#exportCurrentButton").addEventListener("click", exportCurrent);
  $("#exportZipButton").addEventListener("click", () => exportAll(true));
  $("#exportAllIndividualButton").addEventListener("click", () => exportAll(false));
  $("#exportFormat").addEventListener("change", (event) => {
    setExportFormat(event.currentTarget.value);
    updateExportPreview();
  });
  $("#exportLongEdge").addEventListener("change", (event) => {
    state.exportLongEdges[exportLongEdgeKind(state.exportFormat)] = event.currentTarget.value;
    updateExportPreview();
  });
  $("#exportLabels").addEventListener("change", updateExportPreview);
  $("#exportQuality").addEventListener("input", (event) => {
    rangeProgress(event.currentTarget);
    $("#exportQualityOutput").textContent = `${event.currentTarget.value}%`;
  });
  elements.exportDialog.addEventListener("cancel", (event) => {
    if (state.exportBusy) event.preventDefault();
  });

  $("#themeToggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    renderCanvas();
  });

  document.addEventListener("keydown", (event) => {
    if (state.exportBusy) return;
    if (elements.exportDialog.open) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") event.preventDefault();
      return;
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveProjectFile();
      return;
    }
    const key = event.key.toLowerCase();
    const modeKeys = { s: "side", o: "overlay", w: "wipe", d: "difference", b: "blink" };
    if (modeKeys[key]) setMode(modeKeys[key]);
    else if (event.key === "ArrowLeft") navigatePair(-1);
    else if (event.key === "ArrowRight") navigatePair(1);
    else if (key === "f" || key === "0") { resetView(); renderCanvas(); }
    else if (key === "g") $("#gridButton").click();
    else if (key === "l") {
      const pair = selectedPair();
      if (pair) {
        pair.settings.showLabels = !pair.settings.showLabels;
        markDirty({ controls: true });
      }
    } else if (event.key === "[" || event.key === "]") {
      const pair = selectedPair();
      if (pair) {
        pair.settings.opacity = Math.max(0, Math.min(100, pair.settings.opacity + (event.key === "]" ? 5 : -5)));
        markDirty({ controls: true });
      }
    } else if (event.key === "?") elements.shortcutsDialog.showModal();
  });

  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

async function initialize() {
  const theme = localStorage.getItem(THEME_KEY);
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
  bindEvents();
  $$('input[type="range"]').forEach(rangeProgress);

  const linkedProject = new URLSearchParams(window.location.search).get("project");
  if (linkedProject) {
    try {
      $("#renderStatus").textContent = "Opening linked project…";
      await openProjectUrl(linkedProject);
      return;
    } catch (error) {
      showToast(`Could not open linked project: ${error.message}`, "error", 7000);
    }
  }

  const lastProjectId = localStorage.getItem(LAST_PROJECT_KEY);
  if (lastProjectId) {
    try {
      const saved = await loadProjectFromBrowser(lastProjectId);
      if (saved) activateProject(saved);
      else activateProject(state.project, { save: true });
    } catch {
      activateProject(state.project, { save: true });
    }
  } else {
    activateProject(state.project, { save: true });
  }
}

initialize();
