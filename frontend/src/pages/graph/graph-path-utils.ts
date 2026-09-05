/**
 * Pure helpers for the graph path finder (Sprint C).
 *
 * Path overlay on the canvas is a pair of sets: node ids + directed
 * edge keys. Keep the key format in one place so highlight + "is the
 * path inside this view?" agree.
 */

export function pathEdgeKeys(path: readonly string[]): Set<string> {
  const keys = new Set<string>();
  for (let i = 0; i < path.length - 1; i += 1) {
    keys.add(edgeKey(path[i], path[i + 1]));
  }
  return keys;
}

export function edgeKey(source: string, target: string): string {
  return `${source}\t${target}`;
}

/**
 * Path hops that are not in the currently loaded node set.
 *
 * Empty array means the path can be highlighted on the current canvas.
 */
export function pathNodesOutsideView(path: readonly string[], nodeIds: Iterable<string>): string[] {
  const present = new Set(nodeIds);
  return path.filter((id) => !present.has(id));
}
