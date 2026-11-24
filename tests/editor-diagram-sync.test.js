import { describe, expect, it, vi } from "vitest";
import { createEditorDiagramSync } from "../src/ui/editor-diagram-sync.js";

describe("editor and diagram source synchronization", () => {
  it("highlights the most specific source node for the active editor line", () => {
    const nodes = [
      { id: "function", startLine: 1, endLine: 12, sourceNavigable: true },
      { id: "branch", startLine: 3, endLine: 9, sourceNavigable: true },
      { id: "statement", startLine: 5, endLine: 5, sourceNavigable: true },
      { id: "structural", startLine: 5, endLine: 5, sourceNavigable: false },
    ];
    const setActiveNode = vi.fn();
    const sync = createEditorDiagramSync({ editor: {}, getNodes: () => nodes, setActiveNode });

    expect(sync.syncFromEditorLine(5)).toBe(nodes[2]);
    expect(setActiveNode).toHaveBeenLastCalledWith("statement");
    expect(sync.syncFromEditorLine(11)).toBe(nodes[0]);
    expect(setActiveNode).toHaveBeenLastCalledWith("function");
    expect(sync.syncFromEditorLine(20)).toBeNull();
    expect(setActiveNode).toHaveBeenLastCalledWith(null);
  });

  it("moves to a diagram node line without feeding the programmatic cursor change back", () => {
    let sync;
    const setActiveNode = vi.fn();
    const onEditorLine = vi.fn();
    const editor = {
      selectLine: vi.fn((line) => {
        expect(sync.isProgrammatic).toBe(true);
        if (!sync.isProgrammatic) onEditorLine(sync.syncFromEditorLine(line));
      }),
    };
    sync = createEditorDiagramSync({ editor, getNodes: () => [], setActiveNode });
    const node = { id: "source-node", sourceNavigable: true, startLine: 7, endLine: 9 };

    expect(sync.syncFromDiagramNode(node)).toEqual({ startLine: 7, endLine: 9 });
    expect(editor.selectLine).toHaveBeenCalledWith(7);
    expect(setActiveNode).toHaveBeenCalledWith("source-node");
    expect(onEditorLine).not.toHaveBeenCalled();
    expect(sync.isProgrammatic).toBe(false);
  });

  it("ignores diagram nodes without a navigable source range", () => {
    const editor = { selectLine: vi.fn() };
    const setActiveNode = vi.fn();
    const sync = createEditorDiagramSync({ editor, getNodes: () => [], setActiveNode });
    expect(sync.syncFromDiagramNode({ id: "synthetic", startLine: 1, endLine: 1, sourceNavigable: false })).toBeNull();
    expect(editor.selectLine).not.toHaveBeenCalled();
    expect(setActiveNode).not.toHaveBeenCalled();
  });
});
