// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { analyzeSource } from "../src/analyzer/analyzer.js";
import { guidedExamples } from "../src/examples/guided-examples.js";
import { generateFlowcharts } from "../src/flowchart/flow-generator.js";
import { initializeEditorControls } from "../src/editor/editor-controls.js";

describe("guided examples", () => {
  it.each(guidedExamples.slice(1).map((example) => [example.title, example]))(
    "%s parses and produces a loop diagram with input, condition and output",
    (_title, example) => {
      const analysis = analyzeSource(example.code);
      expect(analysis.diagnostics.filter(({ severity }) => severity === "error")).toEqual([]);
      expect(analysis.summary.functionCalls.map(({ name }) => name)).toEqual(
        expect.arrayContaining(["digitalRead", "analogRead"].filter((name) => example.code.includes(name))),
      );
      expect(analysis.summary.functionCalls.map(({ name }) => name)).toContain("digitalWrite");
      expect(analysis.summary.controls.some(({ type }) => type === "IfStatement")).toBe(true);
      const flowcharts = generateFlowcharts(analysis.ast, example.code);
      expect(flowcharts.diagrams.some(({ functionName }) => functionName === "loop")).toBe(true);
      expect(example.wiring).toBeTruthy();
      expect(example.observe).toBeTruthy();
    },
  );

  it("populates the example selector and loads the selected code and learning notes", () => {
    const editor = { setValue: vi.fn() };
    const exampleSelect = document.createElement("select");
    const exampleGuidance = document.createElement("p");
    const loadExample = document.createElement("button");
    const setStatus = vi.fn();
    initializeEditorControls({
      editor,
      setStatus,
      elements: {
        paste: document.createElement("button"),
        loadExample,
        exampleSelect,
        exampleGuidance,
        clear: document.createElement("button"),
        fileInput: document.createElement("input"),
      },
    });

    expect([...exampleSelect.options].map(({ textContent }) => textContent)).toEqual(
      guidedExamples.map(({ title }) => title),
    );
    exampleSelect.value = "button-led";
    exampleSelect.dispatchEvent(new Event("change"));
    expect(exampleGuidance.textContent).toContain("pulsador entre D2 y GND");
    expect(exampleGuidance.textContent).toContain("diagrama");
    loadExample.click();
    expect(editor.setValue).toHaveBeenCalledWith(guidedExamples.find(({ id }) => id === "button-led").code);
    expect(setStatus.mock.calls[0][0]).toContain("Ejemplo «Pulsador y LED» cargado");
  });
});
