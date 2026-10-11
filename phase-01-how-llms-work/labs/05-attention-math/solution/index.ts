// Scaled dot-product attention on plain arrays — the core equation of the transformer:
//   Attention(Q, K, V) = softmax(Q·Kᵀ / √d + mask) · V
export type Matrix = number[][];

export function matmul(a: Matrix, b: Matrix): Matrix {
  const inner = b.length;
  if (a[0]?.length !== inner) throw new Error(`shape mismatch: ${a.length}x${a[0]?.length} · ${b.length}x${b[0]?.length}`);
  return a.map((row) => b[0]!.map((_, j) => row.reduce((s, x, k) => s + x * b[k]![j]!, 0)));
}

export function transpose(m: Matrix): Matrix {
  return m[0]!.map((_, j) => m.map((row) => row[j]!));
}

export function softmaxRow(row: number[]): number[] {
  const max = Math.max(...row);
  const e = row.map((x) => (x === -Infinity ? 0 : Math.exp(x - max)));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

/** Returns the attention weights (rows sum to 1) and the output vectors. */
export function attention(Q: Matrix, K: Matrix, V: Matrix, causal = true): { weights: Matrix; output: Matrix } {
  const d = Q[0]!.length;
  const scores = matmul(Q, transpose(K)).map((row, i) =>
    row.map((s, j) => (causal && j > i ? -Infinity : s / Math.sqrt(d))),
  );
  const weights = scores.map(softmaxRow);
  return { weights, output: matmul(weights, V) };
}
