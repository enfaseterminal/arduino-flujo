import { findLinesForNode, findNodeForLine } from "../flowchart/flow-source-sync.js";

/** Coordina el cursor del editor y el nodo de diagrama sin acoplarse al DOM. */
export function createEditorDiagramSync({ editor, getNodes, setActiveNode = () => {} }) {
  let programmatic = false;

  function syncFromEditorLine(line) {
    if (programmatic) return null;
    const nodes = [...(getNodes() ?? [])].filter((node) => node.sourceNavigable);
    const node = findNodeForLine(nodes, line);
    setActiveNode(node?.id ?? null);
    return node;
  }

  function syncFromDiagramNode(node) {
    const range = node?.sourceNavigable ? findLinesForNode(node) : null;
    if (!range || typeof editor.selectLine !== "function") return null;
    programmatic = true;
    try {
      setActiveNode(node.id);
      editor.selectLine(range.startLine);
    } finally {
      programmatic = false;
    }
    return range;
  }

  return {
    syncFromEditorLine,
    syncFromDiagramNode,
    get isProgrammatic() { return programmatic; },
  };
}
