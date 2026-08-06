import { coerceExportLongEdge, exportExtension } from "./export-format.js";
import { encodeGifAnimation } from "./gif.js";

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function encodeStaticCanvas(canvas, format, quality = 0.92) {
  const mimeType = format === "jpeg" ? "image/jpeg" : format === "png" ? "image/png" : null;
  if (!mimeType) throw new TypeError(`Static export does not support .${exportExtension(format)} files.`);
  const normalizedQuality = clamp(Number(quality), 0.6, 1);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error("The browser could not encode the comparison.")),
      mimeType,
      normalizedQuality
    );
  });
}

function readCanvasPixels(canvas) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser could not read the rendered comparison.");
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

export async function renderComparisonExport(
  renderer,
  project,
  pair,
  mode,
  options = {},
  dependencies = { encodeGif: encodeGifAnimation }
) {
  const format = options.format ?? "png";
  const resolvedOptions = format === "gif"
    ? { ...options, format, longEdge: coerceExportLongEdge("gif", String(options.longEdge ?? "")) }
    : { ...options, format };
  if (format !== "gif") {
    const canvas = await renderer.renderToCanvas(project, pair, resolvedOptions);
    const blob = await encodeStaticCanvas(canvas, format, options.quality);
    return { blob, width: canvas.width, height: canvas.height };
  }

  if (mode !== "blink") throw new Error("Animated GIF export is available only in Blink mode.");
  if (!pair.leftId || !pair.rightId) {
    throw new Error("Animated GIF export requires a mapped image in both collections.");
  }

  const frames = [];
  let width = 0;
  let height = 0;
  for (const blinkPhase of [0, 1]) {
    const canvas = await renderer.renderToCanvas(project, pair, { ...resolvedOptions, blinkPhase });
    if (blinkPhase === 0) {
      width = canvas.width;
      height = canvas.height;
    } else if (canvas.width !== width || canvas.height !== height) {
      throw new Error("Blink frames must have matching export dimensions.");
    }
    frames.push({ pixels: readCanvasPixels(canvas), delayMs: pair.settings.blinkInterval });
  }

  const blob = await dependencies.encodeGif({ width, height, frames });
  return { blob, width, height };
}
