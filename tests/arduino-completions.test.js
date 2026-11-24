import { describe, expect, it } from "vitest";
import { applyCompletion, arduinoCompletions, arduinoSnippets, getCompletions } from "../src/editor/arduino-completions.js";

describe("catálogo de completados Arduino", () => {
  it("incluye funciones core con metadatos consistentes", () => {
    const labels = arduinoCompletions.map(({ label }) => label);
    for (const label of ["pinMode", "digitalWrite", "digitalRead", "analogRead", "analogWrite", "delay", "delayMicroseconds", "millis", "micros", "Serial.begin", "Serial.print", "Serial.println", "Serial.available", "Serial.read", "map", "constrain", "tone", "noTone"]) {
      expect(labels).toContain(label);
    }
    for (const item of arduinoCompletions) {
      expect(item).toMatchObject({ kind: "function", label: expect.any(String), category: expect.any(String), detail: expect.any(String), insertText: expect.any(String) });
    }
  });

  it("incluye estructuras de control y esqueleto de sketch", () => {
    const labels = arduinoSnippets.map(({ label }) => label);
    for (const label of ["if", "if / else", "else if", "switch / case", "for", "while", "do ... while", "setup / loop"]) expect(labels).toContain(label);
    for (const item of arduinoSnippets) {
      expect(item).toMatchObject({ kind: "snippet", category: expect.any(String), detail: expect.any(String), insertText: expect.any(String), cursor: expect.any(Number) });
      expect(item.insertText).toContain("{");
    }
  });

  it("filtra por etiqueta exacta, parcial, sin distinguir mayúsculas y sin resultados", () => {
    expect(getCompletions("millis").map(({ label }) => label)).toEqual(["millis"]);
    expect(getCompletions("serial.p").map(({ label }) => label)).toEqual(["Serial.print", "Serial.println"]);
    expect(getCompletions("ANALOG").map(({ label }) => label)).toEqual(["analogRead", "analogWrite"]);
    expect(getCompletions("xyz-no-existe")).toEqual([]);
  });

  it("inserta funciones al inicio, en medio, al final y reemplazando una selección", () => {
    const write = arduinoCompletions.find(({ label }) => label === "digitalWrite");
    expect(applyCompletion("", write, 0).text).toBe("digitalWrite(pin, HIGH);");
    expect(applyCompletion("abcXYZdef", write, 3, 6).text).toBe("abcdigitalWrite(pin, HIGH);def");
    expect(applyCompletion("abc", write).text).toBe("abcdigitalWrite(pin, HIGH);");
    const result = applyCompletion("before selected after", write, 7, 15);
    expect(result.text).toBe("before digitalWrite(pin, HIGH); after");
    expect(result.cursor).toBe(7 + write.cursor);
    expect(result.selection).toEqual({ anchor: result.cursor, head: result.cursor, from: result.cursor, to: result.cursor, empty: true });
  });

  it("ajusta indentación de snippets y calcula cursor con saltos de línea", () => {
    const loop = arduinoSnippets.find(({ label }) => label === "while");
    const twoSpaces = applyCompletion("  ", loop, 2);
    expect(twoSpaces.text).toBe("  while (condition) {\n    \n  }");
    expect(twoSpaces.cursor).toBe(2 + loop.cursor);

    const fourSpaces = applyCompletion("head\n    ", loop, 9);
    expect(fourSpaces.text).toBe("head\n    while (condition) {\n      \n    }");
    expect(fourSpaces.cursor).toBe(9 + loop.cursor);
  });
});
