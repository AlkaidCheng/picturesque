import {
  encodeGifOnCurrentThread,
  validateGifAnimation
} from "./gif-core.js";
import type { GifAnimation } from "./gif-core.js";

export { normalizeGifDelay } from "./gif-core.js";
export type { GifAnimation, GifPixelFrame } from "./gif-core.js";

const GIF_WORKER_TIMEOUT_MS = 120_000;

interface GifWorkerResponse {
  buffer?: ArrayBuffer;
  error?: string;
}

function encodeGifInWorker(animation: GifAnimation): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./gif-worker.ts", import.meta.url), { type: "module" });
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      callback();
    };
    const timeout = setTimeout(() => {
      finish(() => reject(new Error("GIF encoding timed out.")));
    }, GIF_WORKER_TIMEOUT_MS);

    worker.addEventListener("message", (event: MessageEvent<GifWorkerResponse>) => {
      finish(() => {
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else if (event.data.buffer instanceof ArrayBuffer) {
          resolve(new Blob([event.data.buffer], { type: "image/gif" }));
        } else {
          reject(new Error("The GIF worker returned an invalid result."));
        }
      });
    }, { once: true });
    worker.addEventListener("error", (event) => {
      finish(() => reject(new Error(event.message || "The GIF worker failed.")));
    }, { once: true });
    worker.addEventListener("messageerror", () => {
      finish(() => reject(new Error("The GIF worker returned unreadable data.")));
    }, { once: true });

    try {
      const buffers = [...new Set(animation.frames.map((frame) => frame.pixels.buffer))];
      worker.postMessage({
        animation: {
          width: animation.width,
          height: animation.height,
          frames: animation.frames
        }
      }, buffers);
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

export async function encodeGifAnimation(animation: GifAnimation): Promise<Blob> {
  validateGifAnimation(animation);
  const useWorker = animation.useWorker ?? typeof Worker !== "undefined";
  return useWorker ? encodeGifInWorker(animation) : encodeGifOnCurrentThread(animation);
}
