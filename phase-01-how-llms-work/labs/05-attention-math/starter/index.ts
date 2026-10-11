// Scaled dot-product attention on plain arrays — the core equation of the transformer:
//   Attention(Q, K, V) = softmax(Q·Kᵀ / √d + mask) · V
export type Matrix = number[][];

export function matmul(a: Matrix, b: Matrix): Matrix {
  // TODO: standard matrix multiply; throw on shape mismatch
  throw new Error('TODO: matmul');
}

export function transpose(m: Matrix): Matrix {
  throw new Error('TODO: transpose');
}

export function softmaxRow(row: number[]): number[] {
  // TODO: stable softmax; -Infinity entries (masked) must get weight 0
  throw new Error('TODO: softmaxRow');
}

export function attention(Q: Matrix, K: Matrix, V: Matrix, causal = true): { weights: Matrix; output: Matrix } {
  // TODO:
  //  1. scores = Q · Kᵀ / √d   (d = Q[0].length)
  //  2. if causal, set scores[i][j] = -Infinity for j > i (a token can't see the future)
  //  3. weights = softmax of each row
  //  4. output = weights · V
  throw new Error('TODO: attention');
}
