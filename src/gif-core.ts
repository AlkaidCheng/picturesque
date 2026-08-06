import { Encoder } from "modern-gif";

const GIF_MAX_DIMENSION = 65_535;
const GIF_MAX_PIXELS = 16_777_216;
const GIF_MIN_DELAY_MS = 20;
const GIF_MAX_DELAY_MS = 655_350;

export interface GifPixelFrame {
  pixels: Uint8ClampedArray<ArrayBuffer>;
  delayMs: number;
}

export interface GifAnimation {
  width: number;
  height: number;
  frames: GifPixelFrame[];
  useWorker?: boolean;
}

function requireDimension(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1 || value > GIF_MAX_DIMENSION) {
    throw new RangeError(`${name} must be an integer from 1 to ${GIF_MAX_DIMENSION}.`);
  }
  return value;
}

export function normalizeGifDelay(delayMs: number): number {
  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    throw new RangeError("GIF frame delays must be positive finite numbers.");
  }
  const centisecondDelay = Math.round(delayMs / 10) * 10;
  return Math.min(GIF_MAX_DELAY_MS, Math.max(GIF_MIN_DELAY_MS, centisecondDelay));
}

export function validateGifAnimation(animation: GifAnimation): void {
  const width = requireDimension(animation.width, "GIF width");
  const height = requireDimension(animation.height, "GIF height");
  if (width * height > GIF_MAX_PIXELS) {
    throw new RangeError(`GIF frames may contain at most ${GIF_MAX_PIXELS.toLocaleString("en-US")} pixels.`);
  }
  if (animation.frames.length < 2) {
    throw new RangeError("Animated GIF export requires at least two frames.");
  }

  const expectedPixelLength = width * height * 4;
  for (const frame of animation.frames) {
    if (
      !(frame.pixels instanceof Uint8ClampedArray)
      || !(frame.pixels.buffer instanceof ArrayBuffer)
      || frame.pixels.length !== expectedPixelLength
    ) {
      throw new RangeError(`Each GIF frame must contain ${expectedPixelLength} RGBA values.`);
    }
    normalizeGifDelay(frame.delayMs);
  }
}

export async function encodeGifOnCurrentThread(animation: GifAnimation): Promise<Blob> {
  validateGifAnimation(animation);
  const encoder = new Encoder({
    width: animation.width,
    height: animation.height,
    looped: true,
    loopCount: 0,
    maxColors: 255,
    dither: "floyd-steinberg"
  });

  for (const frame of animation.frames) {
    await encoder.encode({
      data: frame.pixels,
      delay: normalizeGifDelay(frame.delayMs)
    });
  }

  return encoder.flush("blob");
}
