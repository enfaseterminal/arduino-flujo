// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { analyzeSource } from "../src/analyzer/analyzer.js";
import { generateFlowcharts } from "../src/flowchart/flow-generator.js";
import { layoutDiagram } from "../src/flowchart/flow-layout.js";
import { createCircuitModel } from "../src/lab/circuit-model.js";
import { createCircuitLab } from "../src/lab/circuit-lab.js";
import { SimulationEngine } from "../src/simulator/simulation-engine.js";

function createEngine(source, circuit, functionName = "setup") {
  const analysis = analyzeSource(source);
  const generated = generateFlowcharts(analysis.ast, source);
  generated.diagrams.forEach(layoutDiagram);
  const diagram = generated.diagrams.find((item) => item.functionName === functionName);
  return new SimulationEngine({ ast: analysis.ast, source, diagram, circuit });
}

function createStorage() {
  const items = new Map();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
  };
}

function createLabRoot() {
  const root = document.createElement("section");
  root.innerHTML = `
    <svg id="circuit-canvas" viewBox="0 0 800 490"></svg>
    <div id="circuit-component-list"></div><ul id="circuit-wire-list"></ul>
    <section id="circuit-properties"></section><div id="circuit-warnings"></div>
    <p id="circuit-status"></p><select id="circuit-wire-from"></select>
    <select id="circuit-wire-to"></select><form id="circuit-wire-form"></form>
    <button id="circuit-load-demo" type="button"></button><button id="circuit-clear" type="button"></button>
  `;
  document.body.append(root);
  return root;
}

describe("circuit lab simulation integration", () => {
  it("updates a correctly wired LED from executed digitalWrite instructions and snapshots", () => {
    const circuit = createCircuitModel(createStorage());
    circuit.loadDemo();
    const source = `void loop() {
  pinMode(13, OUTPUT);
  digitalWrite(13, HIGH);
  digitalWrite(13, LOW);
}`;
    const engine = createEngine(source, circuit, "loop");
    engine.start();

    engine.stepForward();
    expect(circuit.getLedStates(engine.state.pins)["component-2"].state).toBe("unknown");
    engine.stepForward();
    expect(circuit.getLedStates(engine.state.pins)["component-2"].state).toBe("on");
    engine.stepForward();
    expect(circuit.getLedStates(engine.state.pins)["component-2"].state).toBe("off");
    engine.stepBackward();
    expect(circuit.getLedStates(engine.state.pins)["component-2"].state).toBe("on");
    engine.restart();
    expect(circuit.getLedStates(engine.state.pins)["component-2"].state).toBe("unknown");
    expect(circuit.getWires()).toHaveLength(3);
  });

  it("uses a connected pull-up button for digitalRead and snapshots its input state", () => {
    const circuit = createCircuitModel(createStorage());
    const button = circuit.addComponent("button").component;
    circuit.addWire("arduino:D2", `${button.id}:contact1`);
    circuit.addWire(`${button.id}:contact2`, "arduino:GND");
    const engine = createEngine(
      "void setup() { pinMode(2, INPUT_PULLUP); int pressed = digitalRead(2); }",
      circuit,
    );
    engine.start();
    engine.stepForward();
    engine.setCircuitInput(button.id, true);
    engine.stepForward();
    engine.stepForward();

    expect(engine.state.status).toBe("completed");
    expect(engine.findVariable("pressed").scope.variables.pressed.value).toBe(0);
    expect(engine.state.events.some((event) => event.message === "[PIN 2] Lectura simulada: LOW")).toBe(true);

    engine.stepBackward();
    expect(engine.state.circuitInputs[button.id]).toBe(true);
    engine.stepBackward();
    expect(engine.state.circuitInputs[button.id]).toBe(true);
    engine.stepBackward();
    expect(engine.state.circuitInputs[button.id]).toBe(false);
  });

  it("keeps a normally configured INPUT button unknown while open and LOW when pressed to GND", () => {
    const circuit = createCircuitModel(createStorage());
    const button = circuit.addComponent("button").component;
    circuit.addWire("arduino:D2", `${button.id}:contact1`);
    circuit.addWire(`${button.id}:contact2`, "arduino:GND");
    const pinState = { 2: { mode: "INPUT" } };

    expect(circuit.readInput("digitalRead", 2, pinState, circuit.getInitialInputs()).known).toBe(false);
    circuit.updateProperty(button.id, "pressed", true);
    expect(circuit.readInput("digitalRead", 2, pinState, circuit.getInitialInputs()))
      .toEqual({ known: true, value: 0 });
  });

  it("does not invalidate simulation state or reversible history when component layout changes", () => {
    const circuit = createCircuitModel(createStorage());
    circuit.loadDemo();
    const engine = createEngine(
      'void loop() { Serial.begin(9600); Serial.println("layout stable"); pinMode(13, OUTPUT); digitalWrite(13, HIGH); digitalWrite(13, LOW); }',
      circuit,
      "loop",
    );
    engine.start();
    engine.stepForward();
    engine.stepForward();
    engine.stepForward();
    engine.stepForward();
    const beforeMove = engine.getState();
    const historyLength = engine.history.length;
    const wires = circuit.getWires();

    expect(beforeMove.serialOutput).toBe("layout stable\n");
    const change = circuit.setComponentPosition("component-2", { x: 680, y: 330 });

    expect(change.changeType).toBe("visual");
    expect(engine.getState()).toEqual(beforeMove);
    expect(engine.history).toHaveLength(historyLength);
    expect(circuit.getWires()).toEqual(wires);
    engine.stepBackward();
    expect(engine.state.status).toBe("paused");
    expect(engine.state.step).toBe(beforeMove.step - 1);
    expect(engine.state.serialOutput).toBe(beforeMove.serialOutput);
    expect(circuit.getLedStates(engine.state.pins)["component-2"].state).toBe("unknown");
  });

  it("rebuilds simulation from persisted topology after creating, editing, and removing wires", () => {
    const storage = createStorage();
    const circuit = createCircuitModel(storage);
    circuit.loadDemo();
    const source = 'void loop() { Serial.begin(9600); Serial.println("before wiring change"); pinMode(13, OUTPUT); digitalWrite(13, HIGH); }';
    let engine = createEngine(source, circuit, "loop");
    engine.start();
    for (let step = 0; step < 4; step += 1) engine.stepForward();
    expect(engine.state.serialOutput).toBe("before wiring change\n");

    const topologyChanges = [];
    const root = createLabRoot();
    createCircuitLab(root, circuit, {
      onChange(change) {
        if (change.changeType === "visual" || change.changeType === "input") return;
        topologyChanges.push(change);
        const activeDiagram = generateFlowcharts(analyzeSource(source).ast, source).diagrams
          .find((item) => item.functionName === "loop");
        layoutDiagram(activeDiagram);
        engine = new SimulationEngine({
          ast: analyzeSource(source).ast,
          source,
          diagram: activeDiagram,
          circuit,
        });
      },
    });

    const from = root.querySelector("#circuit-wire-from");
    const to = root.querySelector("#circuit-wire-to");
    from.value = "arduino:D2";
    to.value = "component-1:lead1";
    root.querySelector("#circuit-wire-form").dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
    const newWire = circuit.getWires().at(-1);
    expect(topologyChanges.at(-1).changeType).toBe("topology");
    expect(engine.state).toMatchObject({ status: "idle", pins: {}, serialOutput: "" });
    expect(engine.history).toHaveLength(0);
    expect(JSON.parse(storage.getItem("arduino-flowchart-circuit")).wires).toEqual(circuit.getWires());

    root.querySelector(`[data-select-wire="${newWire.id}"]`).click();
    const side = root.querySelector("[data-wire-edit-side]");
    side.value = "from";
    side.dispatchEvent(new Event("change", { bubbles: true }));
    const endpoint = root.querySelector("[data-wire-edit-endpoint]");
    endpoint.value = "arduino:D3";
    endpoint.dispatchEvent(new Event("change", { bubbles: true }));
    root.querySelector("[data-confirm-wire-edit]").click();
    expect(topologyChanges.at(-1).changeType).toBe("topology");
    expect(circuit.getWires().find(({ id }) => id === newWire.id)).toEqual({
      id: newWire.id,
      from: "arduino:D3",
      to: "component-1:lead1",
    });
    expect(engine.state).toMatchObject({ status: "idle", pins: {}, serialOutput: "" });
    expect(JSON.parse(storage.getItem("arduino-flowchart-circuit")).wires).toEqual(circuit.getWires());

    root.querySelector(`[data-select-wire="${newWire.id}"]`).click();
    root.querySelector("[data-delete-selected-wire]").click();
    expect(topologyChanges.at(-1).changeType).toBe("topology");
    expect(circuit.getWires().some(({ id }) => id === newWire.id)).toBe(false);
    expect(circuit.getWires()).toHaveLength(3);
    expect(engine.state).toMatchObject({ status: "idle", pins: {}, serialOutput: "" });
    expect(JSON.parse(storage.getItem("arduino-flowchart-circuit")).wires).toEqual(circuit.getWires());
    expect(topologyChanges).toHaveLength(3);
  });

  it.each([
    ["addWire", (circuit) => circuit.addWire("arduino:D2", "component-1:lead1")],
    ["updateWireEndpoint", (circuit) => circuit.updateWireEndpoint(circuit.getWires()[0].id, "from", "arduino:D12")],
    ["removeWire", (circuit) => circuit.removeWire(circuit.getWires()[0].id)],
    ["addComponent", (circuit) => circuit.addComponent("potentiometer")],
    ["removeComponent", (circuit) => circuit.removeComponent("component-2")],
  ])("undo and redo of %s restore topology, storage, and a fresh simulation", (_name, mutate) => {
    const storage = createStorage();
    const circuit = createCircuitModel(storage);
    circuit.loadDemo();
    mutate(circuit);
    const source = "void setup() { pinMode(13, OUTPUT); digitalWrite(13, HIGH); }";
    let engine = createEngine(source, circuit);
    engine.start();
    engine.stepForward();
    const topologyChanges = [];
    const root = createLabRoot();
    const lab = createCircuitLab(root, circuit, {
      onChange(change) {
        if (change.changeType === "visual" || change.changeType === "input") return;
        topologyChanges.push(change);
        engine = createEngine(source, circuit);
      },
    });

    root.querySelector("[data-circuit-undo]").click();
    expect(topologyChanges.at(-1).changeType).toBe("topology");
    expect(engine.state).toMatchObject({ status: "idle", pins: {}, serialOutput: "" });
    expect(JSON.parse(storage.getItem("arduino-flowchart-circuit"))).toEqual(circuit.getState());
    const undoneState = circuit.getState();

    const redo = new KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true, cancelable: true });
    root.dispatchEvent(redo);
    expect(redo.defaultPrevented).toBe(true);
    expect(topologyChanges.at(-1).changeType).toBe("topology");
    expect(circuit.getState()).not.toEqual(undoneState);
    expect(engine.state).toMatchObject({ status: "idle", pins: {}, serialOutput: "" });
    expect(JSON.parse(storage.getItem("arduino-flowchart-circuit"))).toEqual(circuit.getState());
    expect(topologyChanges).toHaveLength(2);
    lab.render();
    root.remove();
  });

  it("keeps the running simulation and reversible steps when visual moves are undone or redone", () => {
    const circuit = createCircuitModel(createStorage());
    circuit.loadDemo();
    const source = "void setup() { Serial.begin(9600); Serial.println(7); }";
    let engine = createEngine(source, circuit);
    engine.start();
    engine.stepForward();
    const originalEngine = engine;
    const originalState = engine.getState();
    const originalHistoryLength = engine.history.length;
    const visualChanges = [];
    const root = createLabRoot();
    const lab = createCircuitLab(root, circuit, {
      onChange(change) {
        visualChanges.push(change.changeType);
        if (change.changeType !== "visual") engine = createEngine(source, circuit);
      },
    });

    lab.setComponentPosition("component-2", { x: 700, y: 340 });
    root.querySelector("[data-circuit-undo]").click();
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));

    expect(visualChanges).toEqual(["visual", "visual", "visual"]);
    expect(engine).toBe(originalEngine);
    expect(engine.getState()).toEqual(originalState);
    expect(engine.history).toHaveLength(originalHistoryLength);
    expect(circuit.getComponentPosition("component-2")).toEqual({ x: 700, y: 340 });
    root.remove();
  });

  it("uses a connected potentiometer value for analogRead", () => {
    const circuit = createCircuitModel(createStorage());
    const potentiometer = circuit.addComponent("potentiometer").component;
    circuit.addWire("arduino:5V", `${potentiometer.id}:end1`);
    circuit.addWire(`${potentiometer.id}:wiper`, "arduino:A0");
    circuit.addWire(`${potentiometer.id}:end2`, "arduino:GND");
    circuit.updateProperty(potentiometer.id, "value", 734);

    const engine = createEngine("void setup() { int sensor = analogRead(A0); }", circuit);
    engine.start();
    engine.stepForward();
    engine.stepForward();

    expect(engine.state.status).toBe("completed");
    expect(engine.findVariable("sensor").scope.variables.sensor.value).toBe(734);
    expect(engine.state.events.some((event) => event.message.includes("734"))).toBe(true);
  });

  it("keeps disconnected sensor values unknown and falls back to explicit manual input", () => {
    const circuit = createCircuitModel(createStorage());
    circuit.addComponent("potentiometer");
    const engine = createEngine("void setup() { int sensor = analogRead(A0); }", circuit);
    engine.start();
    engine.stepForward();

    expect(engine.state.status).toBe("waiting-input");
    expect(engine.state.waitingInput.callName).toBe("analogRead");
    engine.provideInput("512");
    engine.stepForward();
    expect(engine.findVariable("sensor").scope.variables.sensor.value).toBe(512);
  });
});
