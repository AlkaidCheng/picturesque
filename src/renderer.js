import { getActiveCollection, getComparisonMode, getImage } from "./project.js";

const LABEL_HEIGHT = 34;
const PANEL_GAP = 8;
const MIN_EXPORT_EDGE = 640;
const MAX_EXPORT_EDGE = 8192;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function resolveFrameRatio(project, pair) {
  const setting = pair?.settings?.frameRatio ?? "auto";
  const left = pair ? getImage(project, "left", pair.leftId) : null;
  const right = pair ? getImage(project, "right", pair.rightId) : null;
  if (setting === "left") return left ? left.width / left.height : 1;
  if (setting === "right") return right ? right.width / right.height : left ? left.width / left.height : 1;
  if (setting !== "auto") {
    const numeric = Number.parseFloat(setting);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  const reference = left ?? right;
  return reference ? reference.width / reference.height : 1;
}

export function comparisonAspect(project, pair, includeLabels = pair?.settings?.showLabels ?? true) {
  const frameRatio = resolveFrameRatio(project, pair);
  const mode = getComparisonMode(project);
  let ratio = frameRatio;
  if (mode === "side") {
    ratio = pair?.settings?.orientation === "vertical" ? frameRatio / 2 : frameRatio * 2;
  }
  if (!includeLabels) return ratio;
  const nominalHeight = 1000;
  return (ratio * nominalHeight) / (nominalHeight + LABEL_HEIGHT);
}

export function computeExportSize(project, pair, longEdge = 2400, includeLabels = true) {
  const ratio = comparisonAspect(project, pair, includeLabels);
  let requested = Number(longEdge);
  if (!Number.isFinite(requested)) {
    const left = getImage(project, "left", pair?.leftId);
    const right = getImage(project, "right", pair?.rightId);
    requested = Math.max(left?.width ?? 0, left?.height ?? 0, right?.width ?? 0, right?.height ?? 0, 2400);
    if (getComparisonMode(project) === "side" && pair?.settings.orientation !== "vertical") requested *= 2;
  }
  requested = clamp(Math.round(requested), MIN_EXPORT_EDGE, MAX_EXPORT_EDGE);
  if (ratio >= 1) return { width: requested, height: Math.max(1, Math.round(requested / ratio)) };
  return { width: Math.max(1, Math.round(requested * ratio)), height: requested };
}

function imagePromise(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("Unable to decode image data.")), { once: true });
    image.src = source;
  });
}

function fitRect(image, viewport, fit) {
  if (fit === "stretch") return { ...viewport };
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const viewportRatio = viewport.width / viewport.height;
  const useWidth = fit === "cover" ? imageRatio < viewportRatio : imageRatio > viewportRatio;
  const width = useWidth ? viewport.width : viewport.height * imageRatio;
  const height = useWidth ? viewport.width / imageRatio : viewport.height;
  return {
    x: viewport.x + (viewport.width - width) / 2,
    y: viewport.y + (viewport.height - height) / 2,
    width,
    height
  };
}

function layerFilter(settings) {
  const warmth = clamp(Number(settings.warmth) || 0, -100, 100);
  const warmthStrength = Math.abs(warmth) * 0.35;
  const warmthHue = warmth >= 0 ? -12 : 168;
  return [
    `brightness(${settings.brightness ?? 100}%)`,
    `contrast(${settings.contrast ?? 100}%)`,
    `saturate(${settings.saturation ?? 100}%)`,
    `grayscale(${settings.grayscale ?? 0}%)`,
    `sepia(${warmthStrength}%)`,
    `hue-rotate(${warmthHue}deg)`
  ].join(" ");
}

function drawPanelBackground(context, viewport, color) {
  context.save();
  context.fillStyle = color;
  context.fillRect(viewport.x, viewport.y, viewport.width, viewport.height);
  context.restore();
}

function drawLayer(context, image, viewport, settings, layer, options = {}) {
  if (!image) return;
  const fit = fitRect(image, viewport, settings.fit);
  const alignment = layer === "right"
    ? {
        offsetX: (Number(settings.offsetX) || 0) * viewport.width / 100,
        offsetY: (Number(settings.offsetY) || 0) * viewport.height / 100,
        rotation: (Number(settings.rotation) || 0) * Math.PI / 180,
        scale: (Number(settings.scale) || 100) / 100
      }
    : { offsetX: 0, offsetY: 0, rotation: 0, scale: 1 };
  const appearance = settings.layers?.[layer] ?? {};
  const centerX = fit.x + fit.width / 2 + alignment.offsetX;
  const centerY = fit.y + fit.height / 2 + alignment.offsetY;

  context.save();
  context.beginPath();
  context.rect(viewport.x, viewport.y, viewport.width, viewport.height);
  context.clip();
  context.globalAlpha = options.alpha ?? 1;
  context.globalCompositeOperation = options.blend ?? "source-over";
  context.filter = layerFilter(appearance);
  context.translate(centerX, centerY);
  context.rotate(alignment.rotation);
  context.scale(alignment.scale, alignment.scale);
  context.drawImage(image, -fit.width / 2, -fit.height / 2, fit.width, fit.height);
  context.restore();
}

function drawMissing(context, viewport, label) {
  context.save();
  context.fillStyle = "rgba(125, 140, 157, 0.12)";
  context.fillRect(viewport.x, viewport.y, viewport.width, viewport.height);
  context.strokeStyle = "rgba(160, 176, 193, 0.28)";
  context.setLineDash([8, 8]);
  context.strokeRect(viewport.x + 0.5, viewport.y + 0.5, viewport.width - 1, viewport.height - 1);
  context.fillStyle = "rgba(180, 193, 207, 0.68)";
  context.font = `${Math.max(11, Math.min(16, viewport.width / 24))}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
  context.restore();
}

function drawLabel(context, viewport, label, collectionLabel) {
  context.save();
  const fontSize = clamp(Math.round(viewport.width / 55), 10, 16);
  context.fillStyle = "rgba(8, 11, 15, 0.88)";
  context.fillRect(viewport.x, viewport.y + viewport.height - LABEL_HEIGHT, viewport.width, LABEL_HEIGHT);
  context.font = `600 ${fontSize}px system-ui, sans-serif`;
  context.fillStyle = "rgba(240, 245, 250, 0.92)";
  context.textBaseline = "middle";
  context.textAlign = "left";
  context.fillText(collectionLabel, viewport.x + 10, viewport.y + viewport.height - LABEL_HEIGHT / 2);
  context.font = `500 ${fontSize}px system-ui, sans-serif`;
  context.fillStyle = "rgba(190, 202, 214, 0.82)";
  const prefixWidth = context.measureText(collectionLabel).width + 18;
  const maximumWidth = Math.max(20, viewport.width - prefixWidth - 12);
  context.fillText(label ?? "Unmapped", viewport.x + prefixWidth, viewport.y + viewport.height - LABEL_HEIGHT / 2, maximumWidth);
  context.restore();
}

function drawGrid(context, viewport) {
  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.24)";
  context.lineWidth = 1;
  context.setLineDash([5, 6]);
  context.beginPath();
  for (const fraction of [1 / 3, 2 / 3]) {
    context.moveTo(viewport.x + viewport.width * fraction, viewport.y);
    context.lineTo(viewport.x + viewport.width * fraction, viewport.y + viewport.height);
    context.moveTo(viewport.x, viewport.y + viewport.height * fraction);
    context.lineTo(viewport.x + viewport.width, viewport.y + viewport.height * fraction);
  }
  context.stroke();
  context.restore();
}

function panelRects(frame, settings, labels, mode) {
  const availableHeight = Math.max(1, frame.height - (labels ? LABEL_HEIGHT : 0));
  if (mode !== "side") {
    return [{ x: frame.x, y: frame.y, width: frame.width, height: availableHeight + (labels ? LABEL_HEIGHT : 0) }];
  }
  if (settings.orientation === "vertical") {
    const labelsHeight = labels ? LABEL_HEIGHT * 2 : 0;
    const height = Math.max(1, (frame.height - labelsHeight - PANEL_GAP) / 2);
    return [
      { x: frame.x, y: frame.y, width: frame.width, height: height + (labels ? LABEL_HEIGHT : 0) },
      { x: frame.x, y: frame.y + height + PANEL_GAP + (labels ? LABEL_HEIGHT : 0), width: frame.width, height: height + (labels ? LABEL_HEIGHT : 0) }
    ];
  }
  const width = (frame.width - PANEL_GAP) / 2;
  return [
    { x: frame.x, y: frame.y, width, height: frame.height },
    { x: frame.x + width + PANEL_GAP, y: frame.y, width, height: frame.height }
  ];
}

function imageViewport(panel, labels) {
  return {
    x: panel.x,
    y: panel.y,
    width: panel.width,
    height: Math.max(1, panel.height - (labels ? LABEL_HEIGHT : 0))
  };
}

function drawWipeDivider(context, viewport, settings) {
  const fraction = clamp(settings.wipe / 100, 0, 1);
  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.95)";
  context.lineWidth = 2;
  context.shadowBlur = 6;
  context.shadowColor = "rgba(0, 0, 0, 0.5)";
  context.beginPath();
  if (settings.orientation === "vertical") {
    const y = viewport.y + viewport.height * fraction;
    context.moveTo(viewport.x, y);
    context.lineTo(viewport.x + viewport.width, y);
  } else {
    const x = viewport.x + viewport.width * fraction;
    context.moveTo(x, viewport.y);
    context.lineTo(x, viewport.y + viewport.height);
  }
  context.stroke();
  context.restore();
}

export class ComparisonRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false });
    this.imageCache = new Map();
    this.lastFrame = null;
    this.resizeObserver = new ResizeObserver(() => this.onResize?.());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.imageCache.clear();
  }

  async loadImage(record) {
    if (!record) return null;
    if (!this.imageCache.has(record.id)) {
      this.imageCache.set(record.id, imagePromise(record.dataUrl).catch((error) => {
        this.imageCache.delete(record.id);
        throw error;
      }));
    }
    return this.imageCache.get(record.id);
  }

  async loadPair(project, pair) {
    const leftRecord = getImage(project, "left", pair?.leftId);
    const rightRecord = getImage(project, "right", pair?.rightId);
    const [left, right] = await Promise.all([this.loadImage(leftRecord), this.loadImage(rightRecord)]);
    return { left, right, leftRecord, rightRecord };
  }

  resizeDisplayCanvas() {
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { width: bounds.width, height: bounds.height, ratio };
  }

  async render(project, pair, view = { zoom: 1, panX: 0, panY: 0 }, blinkPhase = 0) {
    const dimensions = this.resizeDisplayCanvas();
    const context = this.context;
    context.save();
    context.fillStyle = pair?.settings?.background ?? "#11151b";
    context.fillRect(0, 0, dimensions.width, dimensions.height);
    context.restore();
    if (!pair) {
      this.lastFrame = null;
      return null;
    }

    const images = await this.loadPair(project, pair);
    const aspect = comparisonAspect(project, pair, pair.settings.showLabels);
    const padding = 18;
    const availableWidth = Math.max(1, dimensions.width - padding * 2);
    const availableHeight = Math.max(1, dimensions.height - padding * 2);
    let width = availableWidth;
    let height = width / aspect;
    if (height > availableHeight) {
      height = availableHeight;
      width = height * aspect;
    }
    width *= view.zoom;
    height *= view.zoom;
    const frame = {
      x: (dimensions.width - width) / 2 + view.panX,
      y: (dimensions.height - height) / 2 + view.panY,
      width,
      height
    };
    this.drawComparison(context, frame, project, pair, images, {
      includeGrid: pair.settings.showGrid,
      includeLabels: pair.settings.showLabels,
      blinkPhase
    });
    this.lastFrame = { frame, project, pair, images };
    return { frame, width: images.leftRecord?.width ?? images.rightRecord?.width, height: images.leftRecord?.height ?? images.rightRecord?.height };
  }

  drawComparison(context, frame, project, pair, images, options = {}) {
    const settings = pair.settings;
    const mode = getComparisonMode(project);
    const labels = Boolean(options.includeLabels);
    const panels = panelRects(frame, settings, labels, mode);
    const leftName = images.leftRecord?.name ?? "Unmapped";
    const rightName = images.rightRecord?.name ?? "Unmapped";
    const leftCollectionName = getActiveCollection(project, "left")?.name ?? "Collection A";
    const rightCollectionName = getActiveCollection(project, "right")?.name ?? "Collection B";

    context.save();
    context.fillStyle = settings.background;
    context.fillRect(frame.x, frame.y, frame.width, frame.height);

    if (mode === "side") {
      const leftPanel = panels[0];
      const rightPanel = panels[1] ?? panels[0];
      const leftViewport = imageViewport(leftPanel, labels);
      const rightViewport = imageViewport(rightPanel, labels);
      drawPanelBackground(context, leftViewport, settings.background);
      drawPanelBackground(context, rightViewport, settings.background);
      images.left ? drawLayer(context, images.left, leftViewport, settings, "left") : drawMissing(context, leftViewport, "No image in A");
      images.right ? drawLayer(context, images.right, rightViewport, settings, "right") : drawMissing(context, rightViewport, "No image in B");
      if (labels) {
        drawLabel(context, leftPanel, leftName, `A · ${leftCollectionName}`);
        drawLabel(context, rightPanel, rightName, `B · ${rightCollectionName}`);
      }
      if (options.includeGrid) {
        drawGrid(context, leftViewport);
        drawGrid(context, rightViewport);
      }
      context.restore();
      return;
    }

    const panel = panels[0];
    const viewport = imageViewport(panel, labels);
    drawPanelBackground(context, viewport, settings.background);
    if (mode === "blink") {
      const showRight = options.blinkPhase % 2 === 1 && images.right;
      const image = showRight ? images.right : images.left ?? images.right;
      const layer = showRight ? "right" : images.left ? "left" : "right";
      image ? drawLayer(context, image, viewport, settings, layer) : drawMissing(context, viewport, "No mapped image");
    } else {
      images.left ? drawLayer(context, images.left, viewport, settings, "left") : drawMissing(context, viewport, "No image in A");
      if (images.right && mode === "wipe") {
        context.save();
        context.beginPath();
        const fraction = clamp(settings.wipe / 100, 0, 1);
        if (settings.orientation === "vertical") {
          context.rect(viewport.x, viewport.y, viewport.width, viewport.height * fraction);
        } else {
          context.rect(viewport.x, viewport.y, viewport.width * fraction, viewport.height);
        }
        context.clip();
        drawLayer(context, images.right, viewport, settings, "right");
        context.restore();
        drawWipeDivider(context, viewport, settings);
      } else if (images.right) {
        const blend = mode === "difference" ? "difference" : settings.blendMode;
        drawLayer(context, images.right, viewport, settings, "right", {
          alpha: clamp(settings.opacity / 100, 0, 1),
          blend
        });
      }
    }

    if (labels) {
      const label = mode === "blink" && options.blinkPhase % 2 === 1
        ? `B · ${rightCollectionName}: ${rightName}`
        : `A · ${leftCollectionName}: ${leftName}`;
      const comparisonLabel = mode === "overlay" || mode === "difference" || mode === "wipe"
        ? `${leftCollectionName}: ${leftName}  ↔  ${rightCollectionName}: ${rightName}`
        : label;
      drawLabel(context, panel, comparisonLabel, mode.toUpperCase());
    }
    if (options.includeGrid) drawGrid(context, viewport);
    context.restore();
  }

  async renderToCanvas(project, pair, exportOptions = {}) {
    const includeLabels = exportOptions.includeLabels ?? pair.settings.showLabels;
    const longEdge = exportOptions.longEdge === "original" ? Number.NaN : Number(exportOptions.longEdge ?? 2400);
    const size = computeExportSize(project, pair, longEdge, includeLabels);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d", { alpha: exportOptions.format === "png" });
    const images = await this.loadPair(project, pair);
    this.drawComparison(context, { x: 0, y: 0, width: size.width, height: size.height }, project, pair, images, {
      includeGrid: false,
      includeLabels,
      blinkPhase: 0
    });
    return canvas;
  }

  async renderBlob(project, pair, exportOptions = {}) {
    const canvas = await this.renderToCanvas(project, pair, exportOptions);
    const format = exportOptions.format === "jpeg" ? "image/jpeg" : "image/png";
    const quality = clamp(Number(exportOptions.quality ?? 0.92), 0.6, 1);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("The browser could not encode the comparison.")), format, quality);
    });
    return { blob, width: canvas.width, height: canvas.height };
  }

  async renderPreview(targetCanvas, project, pair, exportOptions = {}) {
    if (!pair) return;
    const source = await this.renderToCanvas(project, pair, { ...exportOptions, longEdge: 800 });
    const bounds = targetCanvas.getBoundingClientRect();
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
    targetCanvas.width = Math.max(1, Math.round(bounds.width * ratio));
    targetCanvas.height = Math.max(1, Math.round(bounds.height * ratio));
    const context = targetCanvas.getContext("2d");
    context.fillStyle = pair.settings.background;
    context.fillRect(0, 0, targetCanvas.width, targetCanvas.height);
    const scale = Math.min(targetCanvas.width / source.width, targetCanvas.height / source.height);
    const width = source.width * scale;
    const height = source.height * scale;
    context.drawImage(source, (targetCanvas.width - width) / 2, (targetCanvas.height - height) / 2, width, height);
  }
}
