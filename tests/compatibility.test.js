// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { compatibilityMatrix } from "../src/analyzer/compatibility.js";
import { analyzeSource } from "../src/analyzer/analyzer.js";
import { renderAnalysisReport } from "../src/ui/diagnostics-panel.js";

describe("compatibility guide", () => {
  it("documents parser, diagram and simulation coverage for editor suggestions", () => {
    const byName = new Map(compatibilityMatrix.map((entry) => [entry.name, entry]));
    expect(byName.get("digitalRead")).toMatchObject({
      recognized: "Sí, como llamada Arduino",
      diagram: expect.stringContaining("bloque de entrada"),
      simulation: expect.stringContaining("Simulada"),
    });
    expect(byName.get("millis").simulation).toContain("No implementada");
    expect(byName.get("tone").simulation).toContain("desconocido");
    expect(byName.get("Serial.println").simulation).toContain("Aproximación educativa");
  });

  it("renders the compatibility matrix in the analysis report", () => {
    const container = document.createElement("section");
    renderAnalysisReport(container, analyzeSource("void loop() { millis(); }"));
    const guide = [...container.querySelectorAll("summary")]
      .find((item) => item.textContent.includes("Compatibilidad"));
    expect(guide).toBeDefined();
    expect(guide.parentElement.querySelector("table").textContent).toContain("No implementada");
    expect(guide.parentElement.querySelector("table").textContent).toContain("Serial.println");
  });
});
