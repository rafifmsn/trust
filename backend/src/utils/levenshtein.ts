const MAX_LEN = 256;

// Pre-allocated buffers to prevent heap/GC activity on every request cycle.
// Safe due to Bun's single-threaded synchronous JS execution nature.
const v0 = new Int32Array(MAX_LEN);
const v1 = new Int32Array(MAX_LEN);

/**
 * Checks if the Levenshtein edit distance between s1 and s2 is exactly <= 1.
 * Returns true if distance is 0 or 1, and false if distance >= 2.
 */
export function isEditDistanceWithinOne(s1: string, s2: string): boolean {
  const len1 = s1.length;
  const len2 = s2.length;

  // If length difference is > 1, edit distance is guaranteed >= 2
  if (Math.abs(len1 - len2) > 1) {
    return false;
  }

  // Handle strings exceeding buffer limits cleanly with a temporary allocation
  if (len1 >= MAX_LEN || len2 >= MAX_LEN) {
    return calculateDynamicDistance(s1, s2) <= 1;
  }

  // Initialize v0 (the previous row of distances)
  // this row is A[0][i]: edit distance for an empty s1
  // the distance is just the number of characters to delete from s2
  for (let i = 0; i <= len2; i++) {
    v0[i] = i;
  }

  for (let i = 0; i < len1; i++) {
    // calculate v1 (current row distances) from the previous row v0

    // first element of v1 is A[i+1][0]
    //   edit distance is delete i+1 chars from s1 to match empty s2
    v1[0] = i + 1;

    // use formula to fill in the rest of the row
    for (let j = 0; j < len2; j++) {
      // calculating cost for A[i+1][j+1]
      const deletionCost = v0[j + 1] + 1;
      const insertionCost = v1[j] + 1;
      const substitutionCost = s1[i] === s2[j] ? v0[j] : v0[j] + 1;

      v1[j + 1] = Math.min(deletionCost, insertionCost, substitutionCost);
    }

    // copy v1 to v0 for next iteration
    for (let j = 0; j <= len2; j++) {
      v0[j] = v1[j];
    }
  }

  return v0[len2] <= 1;
}

/**
 * Fallback dynamic allocation calculation for longer strings (edge cases)
 */
function calculateDynamicDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;

  const d0 = new Int32Array(len2 + 1);
  const d1 = new Int32Array(len2 + 1);

  for (let i = 0; i <= len2; i++) {
    d0[i] = i;
  }

  for (let i = 0; i < len1; i++) {
    d1[0] = i + 1;
    for (let j = 0; j < len2; j++) {
      const deletionCost = d0[j + 1] + 1;
      const insertionCost = d1[j] + 1;
      const substitutionCost = s1[i] === s2[j] ? d0[j] : d0[j] + 1;
      d1[j + 1] = Math.min(deletionCost, insertionCost, substitutionCost);
    }
    d0.set(d1);
  }

  return d0[len2];
}
