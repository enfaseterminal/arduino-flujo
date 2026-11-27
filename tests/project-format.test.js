// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createCircuitModel } from "../src/lab/circuit-model.js";
import { createVisualLabelStore } from "../src/flowchart/visual-labels.js";
import {
  createProjectDocument,
  parseProjectJson,
  restoreProjectDocument,
  serializeProjectDocument,
} from "../src/export/project-format.js";

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const source = "void setup() { pinMode(13, OUTPUT); }\nvoid loop() { digitalWrite(13, HIGH); }";

function createSourceProject() {
  const storage = createStorage();
  const circuitModel = createCircuitModel(storage);
  const led = circuitModel.addComponent("led").component;
  const servo = circuitModel.addComponent("servo").component;
  circuitModel.updateProperty(servo.id, "angle", 135);
  circuitModel.addWire("arduino:D13", `${led.id}:anode`);
  circuitModel.addWire(`${led.id}:cathode`, "arduino:GND");
  const visualLabelStore = createVisualLabelStore(storage);
  visualLabelStore.setSource(source);
  visualLabelStore.setLabel({ id: "ast-node-5", label: "digitalWrite(13, HIGH)" }, "Encender el LED");
  return { storage, circuitModel, visualLabelStore };
}

function createDocument() {
  const { circuitModel, visualLabelStore } = createSourceProject();
  return createProjectDocument({
    sketch: source,
    circuit: circuitModel.getState(),
    visualLabels: visualLabelStore.getProjectLabels(),
    name: "Ejercicio LED",
    appVersion: "0.9.6",
  });
}

describe("versioned educational project format", () => {
  it("serializes sketch, virtual circuit states, wiring, positions and visual labels", () => {
    const json = serializeProjectDocument(createDocument());
    const project = parseProjectJson(json);
    expect(project).toMatchObject({
      format: "arduino-flowchart-project",
      version: 1,
      metadata: { name: "Ejercicio LED", appVersion: "0.9.6" },
      sketch: { code: source },
      visualLabels: { version: 1, labels: { "ast-node-5": "Encender el LED" } },
    });
    expect(project.circuit.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "led", properties: { color: "rojo" } }),
      expect.objectContaining({ type: "servo", properties: { angle: 135 } }),
    ]));
    expect(project.circuit.wires).toHaveLength(2);
    expect(project.circuit.visual.positions).toHaveProperty("component-1");
  });

  it("restores editor text, circuit model and component state from a valid project", () => {
    const project = parseProjectJson(serializeProjectDocument(createDocument()));
    const storage = createStorage();
    const circuitModel = createCircuitModel(storage);
    const visualLabelStore = createVisualLabelStore(storage);
    const editor = { value: "old sketch", setValue(value) { this.value = value; } };

    restoreProjectDocument(project, { editor, circuitModel, visualLabelStore });

    expect(editor.value).toBe(source);
    expect(circuitModel.getComponents().map(({ type }) => type)).toEqual(["led", "servo"]);
    expect(circuitModel.getComponents()[1].properties.angle).toBe(135);
    expect(circuitModel.getWires()).toHaveLength(2);
    expect(visualLabelStore.getProjectLabels()).toEqual({ "ast-node-5": "Encender el LED" });
  });

  it("rejects malformed JSON, incompatible versions and invalid circuit schemas", () => {
    expect(() => parseProjectJson("{" )).toThrow("JSON válido");
    const unsupported = createDocument();
    unsupported.version = 99;
    expect(() => parseProjectJson(JSON.stringify(unsupported))).toThrow("Versión de proyecto no compatible");
    const corrupt = createDocument();
    corrupt.circuit.wires[0].to = "arduino:UNKNOWN";
    expect(() => parseProjectJson(JSON.stringify(corrupt))).toThrow("montaje virtual");
  });

  it("does not mutate editor, circuit or labels when validation rejects an import", () => {
    const existingStorage = createStorage();
    const circuitModel = createCircuitModel(existingStorage);
    circuitModel.addComponent("button");
    const beforeCircuit = circuitModel.getState();
    const visualLabelStore = createVisualLabelStore(existingStorage);
    visualLabelStore.setSource("old source");
    visualLabelStore.setLabel({ id: "old-node", label: "original" }, "Etiqueta previa");
    const beforeLabels = visualLabelStore.getProjectLabels();
    const editor = { value: "old source", setValue: vi.fn() };
    const invalid = createDocument();
    invalid.visualLabels.labels = { "node-1": "x".repeat(161) };

    expect(() => restoreProjectDocument(invalid, { editor, circuitModel, visualLabelStore }))
      .toThrow("etiquetas visuales");
    expect(editor.value).toBe("old source");
    expect(editor.setValue).not.toHaveBeenCalled();
    expect(circuitModel.getState()).toEqual(beforeCircuit);
    expect(visualLabelStore.getProjectLabels()).toEqual(beforeLabels);
  });
});
