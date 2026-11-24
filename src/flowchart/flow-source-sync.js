/**
 * Normaliza el rango de líneas fuente de un nodo de flujo.
 * `line` sirve como alias de inicio para nodos que solo tienen una línea.
 */
export function getNodeLineRange(node) {
  if (!node || typeof node !== "object") return null;
  const startLine = node.startLine ?? node.line;
  const endLine = node.endLine ?? startLine;
  if (!Number.isInteger(startLine) || startLine < 1 || !Number.isInteger(endLine) || endLine < startLine) return null;
  return { startLine, endLine };
}

/** Devuelve el nodo fuente más específico que contiene la línea (base 1). */
export function findNodeForLine(nodes, line) {
  if (!Number.isInteger(line) || line < 1 || !nodes?.[Symbol.iterator]) return null;
  let best = null;
  let bestWidth = Infinity;
  let bestStart = -Infinity;
  for (const node of nodes) {
    const range = getNodeLineRange(node);
    if (!range || line < range.startLine || line > range.endLine) continue;
    const width = range.endLine - range.startLine;
    if (width < bestWidth || (width === bestWidth && range.startLine > bestStart) || (width === bestWidth && range.startLine === bestStart)) {
      best = node;
      bestWidth = width;
      bestStart = range.startLine;
    }
  }
  return best;
}

/** Devuelve el rango de líneas navegable de un nodo, si está bien formado. */
export function findLinesForNode(node) {
  return getNodeLineRange(node);
}
