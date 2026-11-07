// Word-level comparison used by the dictation and "voice challenge" games.
// It compares written words only. It is not a phonetic (pronunciation) assessment.

export function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFC")
    .replace(/ё/g, "е")
    .replace(/[’'`´]/g, "'")
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .replace(/(^|\s)[-']+|[-']+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
export const words = s => { const n = normalize(s); return n ? n.split(" ") : []; };

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** One-letter slip in a word of 4+ letters (two for 9+) counts as "near". */
export function nearWord(a, b) {
  if (a === b) return true;
  const len = Math.max(a.length, b.length);
  if (len < 4) return false;
  return levenshtein(a, b) <= (len >= 9 ? 2 : 1);
}

/** "sea shells" ↔ "seashells": join neighbours on one side when that gives a word of the other side. */
function joinSplits(A, B) {
  const set = new Set(B), out = [];
  for (let i = 0; i < A.length; i++) {
    if (i + 1 < A.length && !set.has(A[i]) && set.has(A[i] + A[i + 1])) { out.push(A[i] + A[i + 1]); i++; }
    else if (i + 1 < A.length && !set.has(A[i]) && set.has(A[i] + "-" + A[i + 1])) { out.push(A[i] + "-" + A[i + 1]); i++; }
    else out.push(A[i]);
  }
  return out;
}

/**
 * Align the reference with what the user typed/said.
 * Returns { tokens: [{w, kind: ok|near|miss|extra, got?}], score 0..100, ok, near, miss, extra }.
 * Score = (exact + 0.5 * near) / reference words.
 */
export function compare(reference, hypothesis) {
  let R = words(reference), H = words(hypothesis);
  H = joinSplits(H, R); R = joinSplits(R, H);
  const n = R.length, m = H.length;
  // LCS where a near match also counts (weighted lower)
  const W = (i, j) => (R[i] === H[j] ? 2 : nearWord(R[i], H[j]) ? 1 : 0);
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    const w = W(i, j);
    dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1], w ? w + dp[i + 1][j + 1] : 0);
  }
  const tokens = [];
  let i = 0, j = 0, ok = 0, near = 0, miss = 0, extra = 0;
  while (i < n || j < m) {
    if (i < n && j < m) {
      const w = W(i, j);
      if (w && dp[i][j] === w + dp[i + 1][j + 1]) {
        if (w === 2) { tokens.push({ w: R[i], kind: "ok" }); ok++; }
        else { tokens.push({ w: R[i], kind: "near", got: H[j] }); near++; }
        i++; j++; continue;
      }
      if (dp[i + 1][j] >= dp[i][j + 1]) { tokens.push({ w: R[i], kind: "miss" }); miss++; i++; }
      else { tokens.push({ w: H[j], kind: "extra" }); extra++; j++; }
    } else if (i < n) { tokens.push({ w: R[i], kind: "miss" }); miss++; i++; }
    else { tokens.push({ w: H[j], kind: "extra" }); extra++; j++; }
  }
  // extra words lower the score a little so that saying everything twice does not get 100
  const raw = n ? (ok + near * 0.5) / n : 0;
  const penalty = n ? Math.min(0.3, extra / (n * 3)) : 0;
  const score = Math.max(0, Math.round((raw - penalty) * 100));
  return { tokens, score, ok, near, miss, extra, total: n };
}

/** Does a guess match any accepted answer? -> "exact" | "near" | null */
export function matchAnswer(guess, accepted) {
  const g = normalize(guess);
  if (!g) return null;
  const list = accepted.map(normalize).filter(Boolean);
  if (list.includes(g)) return "exact";
  if (list.some(a => nearWord(a, g))) return "near";
  return null;
}
