/// <reference lib="webworker" />
import { pipeline } from "@huggingface/transformers";

// The embedding model, run inside a Web Worker so its forward pass never blocks
// the page. Same model and settings as orfora/local (Xenova/all-MiniLM-L6-v2,
// mean pooling, normalised), so the vectors it returns are identical.
type Extractor = (
  texts: string[],
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

const MODEL = "Xenova/all-MiniLM-L6-v2";
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
};

let extractorPromise: Promise<Extractor> | null = null;
function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = pipeline(
      "feature-extraction",
      MODEL,
    ) as unknown as Promise<Extractor>;
  }
  return extractorPromise;
}

ctx.onmessage = async (e: MessageEvent) => {
  const { id, texts } = e.data as { id: number; texts: string[] };
  try {
    if (!texts.length) {
      ctx.postMessage({ id, vectors: [] });
      return;
    }
    const extractor = await getExtractor();
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    ctx.postMessage({ id, vectors: output.tolist() });
  } catch (err) {
    ctx.postMessage({ id, error: (err as Error).message });
  }
};
