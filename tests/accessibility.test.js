import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const guide = readFileSync(new URL("../docs/accesibilidad.md", import.meta.url), "utf8");
const diagramStyles = readFileSync(new URL("../src/styles/diagram.css", import.meta.url), "utf8");

describe("accesibilidad documentada", () => {
  it("relates mobile navigation buttons to their panels and describes diagram shortcuts", () => {
    expect(indexHtml).toContain('aria-controls="editor-panel"');
    expect(indexHtml).toContain('aria-controls="diagram-panel"');
    expect(indexHtml).toContain('aria-controls="circuit-laboratory"');
    expect(indexHtml).toContain('aria-describedby="diagram-keyboard-hint"');
    expect(indexHtml).toContain('aria-keyshortcuts="+ - f 0"');
    expect(indexHtml).toContain('id="circuit-status" role="status" aria-live="polite"');
    expect(indexHtml).toContain('for="circuit-board-profile"');
  });

  it("keeps mobile diagram instructions available to assistive technology and documents access paths", () => {
    expect(diagramStyles).toContain(".diagram-hint");
    expect(diagramStyles).not.toMatch(/\.diagram-hint\s*\{\s*display:\s*none/);
    expect(guide).toContain("## Teclado");
    expect(guide).toContain("## Lector de pantalla");
    expect(guide).toContain("## Zoom y vista móvil");
    expect(guide).toContain("no compilan ni ejecutan C++ arbitrario");
  });
});
