/**
 * Cosine similarity, the whole "semantic" comparison orfora needs. Kept as a
 * tiny, dependency-free function on purpose: at orfora's scale (one request vs a
 * small set of seeds) this is microseconds, and pulling in a math library would
 * be pure weight.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `orfora: cannot compare vectors of different lengths (${a.length} vs ${b.length}).`,
    );
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  // A zero vector has no direction; treat it as "no similarity" rather than NaN.
  if (normA === 0 || normB === 0) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
