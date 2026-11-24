import { describe, expect, it } from "vitest";
import { analyzeSource } from "../src/analyzer/analyzer.js";
import { generateFlowcharts } from "../src/flowchart/flow-generator.js";
import { findLinesForNode, findNodeForLine, getNodeLineRange } from "../src/flowchart/flow-source-sync.js";

describe("flow source synchronization", () => {
  it("extracts positive integer line ranges and rejects invalid ranges", () => {
    expect(getNodeLineRange({ startLine: 3, endLine: 5 })).toEqual({ startLine: 3, endLine: 5 });
    expect(getNodeLineRange({ line: 4 })).toEqual({ startLine: 4, endLine: 4 });
    expect(getNodeLineRange({ startLine: 5, endLine: 3 })).toBeNull();
    expect(getNodeLineRange({ startLine: "2", endLine: 3 })).toBeNull();
    expect(getNodeLineRange({ startLine: 0, endLine: 1 })).toBeNull();
    expect(getNodeLineRange({ startLine: 2, endLine: null })).toEqual({ startLine: 2, endLine: 2 });
    expect(getNodeLineRange(null)).toBeNull();
  });

  it("finds a node whose source range exactly contains the requested line", () => {
    const node = { id: "statement", startLine: 4, endLine: 4 };
    expect(findNodeForLine([node], 4)).toBe(node);
    expect(findLinesForNode(node)).toEqual({ startLine: 4, endLine: 4 });
  });

  it("prefers the narrowest containing range and the last node on a complete tie", () => {
    const outer = { id: "function", startLine: 1, endLine: 12 };
    const branch = { id: "if", startLine: 3, endLine: 9 };
    const statement = { id: "statement", startLine: 5, endLine: 5 };
    const lastSameRange = { id: "last", startLine: 5, endLine: 5 };
    expect(findNodeForLine([outer, branch, statement, lastSameRange], 5)).toBe(lastSameRange);
    expect(findNodeForLine([outer, branch], 7)).toBe(branch);
  });

  it("returns null for blank/unmatched lines, invalid lines, and empty collections", () => {
    const nodes = [{ startLine: 2, endLine: 3 }, { id: "synthetic" }];
    expect(findNodeForLine(nodes, 1)).toBeNull();
    expect(findNodeForLine(nodes, 4)).toBeNull();
    expect(findNodeForLine(nodes, 0)).toBeNull();
    expect(findNodeForLine([], 2)).toBeNull();
    expect(findNodeForLine(null, 2)).toBeNull();
  });

  it("preserves source ranges on generated flow nodes and leaves the line alias consistent", () => {
    const source = "void setup() {\n  if (ready) {\n    digitalWrite(13, HIGH);\n  }\n}";
    const analysis = analyzeSource(source);
    const result = generateFlowcharts(analysis.ast, source);
    const diagram = result.diagrams.find(({ functionName }) => functionName === "setup");
    const write = diagram.nodes.find(({ label }) => label.includes("digitalWrite"));
    const decision = diagram.nodes.find(({ kind }) => kind === "decision");

    expect(write).toMatchObject({ startLine: 3, endLine: 3, line: 3 });
    expect(findNodeForLine(diagram.nodes, 3)).toBe(write);
    expect(findLinesForNode(write)).toEqual({ startLine: 3, endLine: 3 });
    expect(decision.startLine).toBe(2);
    expect(decision.line).toBe(decision.startLine);
    for (const node of diagram.nodes) {
      const range = getNodeLineRange(node);
      if (range) expect(node.line).toBe(range.startLine);
    }
  });
});
