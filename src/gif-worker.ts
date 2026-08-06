import { encodeGifOnCurrentThread } from "./gif-core.js";
import type { GifAnimation } from "./gif-core.js";

interface GifWorkerRequest {
  animation: Omit<GifAnimation, "useWorker">;
}

interface GifWorkerResponse {
  buffer?: ArrayBuffer;
  error?: string;
}

interface GifWorkerScope {
  addEventListener(type: "message", listener: (event: MessageEvent<GifWorkerRequest>) => void): void;
  postMessage(message: GifWorkerResponse, transfer?: Transferable[]): void;
}

const workerScope = globalThis as unknown as GifWorkerScope;

workerScope.addEventListener("message", async (event) => {
  try {
    const blob = await encodeGifOnCurrentThread(event.data.animation);
    const buffer = await blob.arrayBuffer();
    workerScope.postMessage({ buffer }, [buffer]);
  } catch (error) {
    workerScope.postMessage({
      error: error instanceof Error ? error.message : "The GIF encoder failed."
    });
  }
});
