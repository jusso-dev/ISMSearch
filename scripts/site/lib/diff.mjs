// Small word-level LCS diff. Returns null when the input is too large so the
// caller can fall back to plain before/after blocks.

export const MAX_DIFF_PRODUCT = 250_000;

export function tokenizeWords(text) {
  return String(text ?? "")
    .split(/\s+/)
    .filter(Boolean);
}

function pushOp(ops, type, token) {
  const last = ops[ops.length - 1];
  if (last && last.type === type) last.tokens.push(token);
  else ops.push({ type, tokens: [token] });
}

export function wordDiff(before, after, { maxProduct = MAX_DIFF_PRODUCT } = {}) {
  const a = tokenizeWords(before);
  const b = tokenizeWords(after);

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  if ((n + 1) * (m + 1) > maxProduct) return null;

  const ops = [];
  for (let i = 0; i < start; i += 1) pushOp(ops, "eq", a[i]);

  // dp[i][j] = LCS length of midA[i..] and midB[j..]
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * width + j] =
        midA[i] === midB[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      pushOp(ops, "eq", midA[i]);
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      pushOp(ops, "del", midA[i]);
      i += 1;
    } else {
      pushOp(ops, "ins", midB[j]);
      j += 1;
    }
  }
  while (i < n) pushOp(ops, "del", midA[i++]);
  while (j < m) pushOp(ops, "ins", midB[j++]);
  for (let k = endA; k < a.length; k += 1) pushOp(ops, "eq", a[k]);

  return ops.map((op) => ({ type: op.type, text: op.tokens.join(" ") }));
}
