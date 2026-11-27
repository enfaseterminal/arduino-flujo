// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { circuitStorageKey, createCircuitModel } from "../src/lab/circuit-model.js";
import { createCircuitLab } from "../src/lab/circuit-lab.js";
import { getComponentTerminals } from "../src/lab/circuit-catalog.js";

function createMemoryStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    entries,
  };
}

function dispatchPointer(target, type, { pointerId = 1, x = 0, y = 0 } = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    isPrimary: { value: true },
  });
  target.dispatchEvent(event);
}

function createRoot() {
  const root = document.createElement("section");
  root.innerHTML = `
    <svg id="circuit-canvas" viewBox="0 0 800 490"></svg>
    <div id="circuit-component-list"></div>
    <ul id="circuit-wire-list"></ul>
    <section id="circuit-properties"></section>
    <div id="circuit-warnings"></div>
    <p id="circuit-status"></p>
    <select id="circuit-wire-from"></select>
    <select id="circuit-wire-to"></select>
    <form id="circuit-wire-form"></form>
    <button id="circuit-load-demo" type="button"></button>
    <button id="circuit-clear" type="button"></button>
    <button type="button" data-add-component="led"></button>
    <button type="button" data-add-component="button"></button>
    <button type="button" data-add-component="potentiometer"></button>
    <button type="button" data-add-component="photoresistor"></button>
    <button type="button" data-add-component="servo"></button>
  `;
  document.body.append(root);
  return root;
}

describe("circuit lab interface", () => {
  it("renders a demonstrator, lets users select components, and edits component properties", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    const changes = [];
    let demoLoaded = false;
    createCircuitLab(root, model, {
      onChange: (change) => changes.push(change.changeType),
      onLoadDemo: () => { demoLoaded = true; },
    });

    root.querySelector("#circuit-load-demo").click();
    expect(demoLoaded).toBe(true);
    expect(model.getComponents().map((component) => component.type)).toEqual(["resistor", "led"]);
    expect(root.querySelectorAll(".circuit-wire").length).toBe(3);
    expect(root.querySelector("#circuit-warnings").textContent).toContain("Sin advertencias");

    root.querySelector('[data-select-component="component-2"]').click();
    const color = root.querySelector('[data-property="color"]');
    color.value = "azul";
    color.dispatchEvent(new Event("change", { bubbles: true }));
    expect(model.getComponents().find((component) => component.id === "component-2").properties.color).toBe("azul");
    expect(changes).toContain("topology");
  });

  it("supports adding a button, changing its virtual input, and drawing terminal connections", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    const changes = [];
    createCircuitLab(root, model, { onChange: (change) => changes.push(change) });

    root.querySelector('[data-add-component="button"]').click();
    const button = model.getComponents()[0];
    expect(getComponentTerminals("button").map(({ id }) => id)).toEqual(["contact1", "contact2"]);
    expect(root.querySelector(`[data-component-id="${button.id}"]`).dataset.state).toBe("released");
    root.querySelector('[data-property="pressed"]').click();
    expect(model.getInitialInputs()[button.id]).toBe(true);
    expect(root.querySelector(`[data-component-id="${button.id}"]`).dataset.state).toBe("pressed");
    expect(root.querySelector('[data-property="pressed"]').getAttribute("aria-pressed")).toBe("true");
    expect(changes.at(-1).changeType).toBe("input");

    const from = root.querySelector("#circuit-wire-from");
    const to = root.querySelector("#circuit-wire-to");
    from.value = "arduino:D2";
    to.value = `${button.id}:contact1`;
    root.querySelector("#circuit-wire-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(model.getWires()).toHaveLength(1);
    expect(root.querySelector("#circuit-wire-list").textContent).toContain("Arduino D2");
  });

  it("shows D0/RX and D1/TX with a visible serial-use warning", () => {
    const root = createRoot();
    createCircuitLab(root, createCircuitModel(createMemoryStorage()));
    expect(root.querySelector('[data-terminal="arduino:D0"]').getAttribute("aria-label"))
      .toContain("serie RX");
    expect(root.querySelector('[data-terminal="arduino:D1"]').getAttribute("aria-label"))
      .toContain("serie TX");
    expect(root.querySelector('[data-terminal="arduino:D0"]').getAttribute("title"))
      .toContain("serie hardware");
  });

  it("adds and edits a photoresistor module and renders its analog simulation input", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    const changes = [];
    const lab = createCircuitLab(root, model, { onChange: (change) => changes.push(change) });

    root.querySelector('[data-add-component="photoresistor"]').click();
    const sensor = model.getComponents()[0];
    expect(sensor).toMatchObject({ type: "photoresistor", properties: { value: 512 } });
    expect(root.querySelector(`[data-component-id="${sensor.id}"] .circuit-photoresistor-cell`)).not.toBeNull();
    const slider = root.querySelector('[data-property="value"]');
    slider.value = "830";
    slider.dispatchEvent(new Event("change", { bubbles: true }));
    expect(model.getInitialInputs()[sensor.id]).toBe(830);
    expect(changes.at(-1).changeType).toBe("input");

    lab.updateSimulation({ pins: {}, circuitInputs: { [sensor.id]: 274 } });
    expect(root.querySelector(`[data-component-id="${sensor.id}"]`).dataset.value).toBe("274");
    expect(root.querySelector('[data-property="value"]').value).toBe("274");
    expect(root.querySelector(".circuit-analog-value").value).toBe("274/1023");
  });

  it("adds a servo with a bounded angle control and reflects simulated horn snapshots", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    const lab = createCircuitLab(root, model);
    root.querySelector('[data-add-component="servo"]').click();
    const servo = model.getComponents()[0];
    let group = root.querySelector(`[data-component-id="${servo.id}"]`);
    expect(servo).toMatchObject({ type: "servo", properties: { angle: 90 } });
    expect(group.querySelector(".circuit-servo-body")).not.toBeNull();
    expect(group.querySelector("[data-servo-horn]").getAttribute("transform")).toBe("rotate(0 405 120)");
    expect([...root.querySelectorAll("[data-terminal]")]
      .filter((terminal) => terminal.dataset.terminal.startsWith(`${servo.id}:`))
      .map((terminal) => terminal.dataset.terminal))
      .toEqual([`${servo.id}:vcc`, `${servo.id}:signal`, `${servo.id}:gnd`]);

    const range = root.querySelector('[data-property="angle"]');
    expect([range.min, range.max, range.value]).toEqual(["0", "180", "90"]);
    range.value = "35";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    expect(root.querySelector(".circuit-servo-angle").value).toBe("35°");
    range.dispatchEvent(new Event("change", { bubbles: true }));
    expect(model.getComponents()[0].properties.angle).toBe(35);
    group = root.querySelector(`[data-component-id="${servo.id}"]`);
    expect(group.querySelector("[data-servo-horn]").getAttribute("transform")).toBe("rotate(-55 405 120)");

    lab.updateSimulation({ pins: {}, circuitInputs: { [servo.id]: 150 }, servoAngles: { [servo.id]: 150 } });
    expect(root.querySelector('[data-property="angle"]').value).toBe("150");
    expect(root.querySelector(".circuit-servo-angle").value).toBe("150°");
    expect(group.dataset.angle).toBe("150");
    expect(group.querySelector("[data-servo-horn]").getAttribute("transform")).toBe("rotate(60 405 120)");
  });

  it("adds an interactive potentiometer with three terminals and mirrors simulated readings", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    const lab = createCircuitLab(root, model);
    root.querySelector('[data-add-component="potentiometer"]').click();
    const pot = model.getComponents()[0];
    const group = root.querySelector(`[data-component-id="${pot.id}"]`);

    expect(pot).toMatchObject({ type: "potentiometer", properties: { value: 512 } });
    expect(group.querySelector("[data-pot-knob]")).not.toBeNull();
    expect([...root.querySelectorAll("[data-terminal]")]
      .filter((terminal) => terminal.dataset.terminal.startsWith(`${pot.id}:`))
      .map((terminal) => terminal.dataset.terminal))
      .toEqual([`${pot.id}:end1`, `${pot.id}:wiper`, `${pot.id}:end2`]);

    const slider = root.querySelector('[data-property="value"]');
    expect(slider.min).toBe("0");
    expect(slider.max).toBe("1023");
    slider.value = "1023";
    slider.dispatchEvent(new Event("change", { bubbles: true }));
    expect(model.getInitialInputs()[pot.id]).toBe(1023);

    lab.updateSimulation({ pins: {}, circuitInputs: { [pot.id]: 256 } });
    expect(root.querySelector('[data-property="value"]').value).toBe("256");
    expect(root.querySelector(".circuit-analog-value").value).toBe("256/1023");
    expect(Number(root.querySelector(`[data-component-id="${pot.id}"] [data-pot-knob]`).getAttribute("cx")))
      .toBeCloseTo(405 - 26 + (256 / 1023) * 52, 2);
  });

  it("renders simulation outputs without mutating the circuit model", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    const lab = createCircuitLab(root, model);
    root.querySelector('[data-add-component="button"]').click();
    const button = model.getComponents()[0];
    root.querySelector('[data-property="pressed"]').click();
    lab.updateSimulation({ pins: {}, circuitInputs: { [button.id]: false } });

    expect(root.querySelector('[data-component-id="component-1"]').dataset.state).toBe("released");
    expect(root.querySelector('[data-component-id="component-1"]').getAttribute("aria-label")).toContain("Pulsador liberado");
    expect(root.querySelector('[data-property="pressed"]').getAttribute("aria-pressed")).toBe("false");
    expect(root.querySelector('[data-property="pressed"]').textContent).toBe("Presionar pulsador");
    expect(model.getComponents()[0].properties.pressed).toBe(true);
  });

  it("announces the LED state derived from simulator pin snapshots", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    const lab = createCircuitLab(root, model);
    model.loadDemo();
    lab.render();

    lab.updateSimulation({
      pins: { 13: { mode: "OUTPUT", value: 1 } },
      circuitInputs: {},
    });

    const led = root.querySelector('[data-component-id="component-2"]');
    expect(led.dataset.state).toBe("on");
    expect(led.getAttribute("aria-label")).toContain("estado on");
    expect(led.getAttribute("aria-label")).toContain("pin 13");
  });

  it("drags each component type, saves positions, and restores them without changing properties", () => {
    const root = createRoot();
    const storage = createMemoryStorage();
    const model = createCircuitModel(storage);
    const componentTypes = ["led", "resistor", "button", "potentiometer"];
    const originalComponents = componentTypes.map((type) => model.addComponent(type).component);
    const changes = [];
    const lab = createCircuitLab(root, model, {
      onChange: (change) => changes.push(change),
    });

    expect([...root.querySelectorAll("[data-terminal]")]
      .filter((terminal) => terminal.dataset.terminal.startsWith("component-1:"))
      .map((terminal) => terminal.dataset.terminal))
      .toEqual(getComponentTerminals("led").map(({ id }) => `component-1:${id}`));

    for (const [index, component] of originalComponents.entries()) {
      const element = root.querySelector(`[data-component-id="${component.id}"]`);
      dispatchPointer(element, "pointerdown", { x: 100, y: 100 });
      dispatchPointer(root.querySelector("#circuit-canvas"), "pointermove", {
        x: 135,
        y: 125,
      });
      dispatchPointer(root.querySelector("#circuit-canvas"), "pointerup", {
        x: 135,
        y: 125,
      });
      expect(model.getComponentPosition(component.id)).toEqual({
        x: component.position.x + 35,
        y: component.position.y + 25,
      });
      expect(changes.at(-1).changeType).toBe("visual");
      expect(model.getComponents()[index]).toMatchObject({
        id: component.id,
        type: component.type,
        properties: component.properties,
      });
    }

    const saved = JSON.parse(storage.entries.get(circuitStorageKey));
    expect(saved.version).toBe(2);
    expect(saved.components.every((component) => !Object.hasOwn(component, "position"))).toBe(true);
    const restored = createCircuitModel(storage);
    for (const component of originalComponents) {
      expect(restored.getComponentPosition(component.id)).toEqual({
        x: component.position.x + 35,
        y: component.position.y + 25,
      });
    }
    lab.render();
  });

  it("keeps dragging after the pointer leaves the component through pointer capture", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    const component = model.addComponent("led").component;
    createCircuitLab(root, model);
    const element = root.querySelector(`[data-component-id="${component.id}"]`);
    const capturePointer = vi.fn();
    element.setPointerCapture = capturePointer;

    dispatchPointer(element, "pointerdown", { pointerId: 7, x: 100, y: 100 });
    expect(capturePointer).toHaveBeenCalledWith(7);
    dispatchPointer(element, "pointermove", { pointerId: 7, x: 145, y: 130 });
    dispatchPointer(element, "pointerup", { pointerId: 7, x: 145, y: 130 });

    expect(model.getComponentPosition(component.id)).toEqual({
      x: component.position.x + 45,
      y: component.position.y + 30,
    });
  });

  it("previews cable movement while dragging and exports the committed visual position", () => {
    const root = createRoot();
    const storage = createMemoryStorage();
    const model = createCircuitModel(storage);
    model.loadDemo();
    const changes = [];
    const lab = createCircuitLab(root, model, {
      onChange: (change) => changes.push(change),
    });
    const originalWires = model.getWires();
    const originalPath = root.querySelector(".circuit-wire").getAttribute("d");
    const originalStoredState = storage.entries.get(circuitStorageKey);
    const component = root.querySelector('[data-component-id="component-1"]');

    dispatchPointer(component, "pointerdown", { x: 100, y: 200 });
    dispatchPointer(root.querySelector("#circuit-canvas"), "pointermove", { x: 120, y: 230 });

    const previewPath = root.querySelector(".circuit-wire").getAttribute("d");
    expect(previewPath).not.toBe(originalPath);
    expect(previewPath).toContain("391 150");
    expect(model.getComponentPosition("component-1")).toEqual({ x: 405, y: 120 });
    expect(storage.entries.get(circuitStorageKey)).toBe(originalStoredState);

    dispatchPointer(root.querySelector("#circuit-canvas"), "pointerup", { x: 120, y: 230 });
    expect(model.getComponentPosition("component-1")).toEqual({ x: 425, y: 150 });
    expect(model.getWires()).toEqual(originalWires);
    expect(changes.at(-1).changeType).toBe("visual");
    expect(root.querySelector(".circuit-wire").getAttribute("d")).not.toBe(originalPath);

    const changeCount = changes.length;
    root.querySelector('[data-component-id="component-1"]').dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 }),
    );
    expect(changes).toHaveLength(changeCount);

    const exported = lab.getSvgForExport();
    expect(exported.querySelector(".circuit-wire").getAttribute("d"))
      .toBe(root.querySelector(".circuit-wire").getAttribute("d"));
    expect(exported.querySelector('[data-component-id="component-1"] .circuit-resistor-body')
      .getAttribute("x")).toBe("401");
  });

  it("clamps dragged components to the valid work-area bounds", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    model.loadDemo();
    createCircuitLab(root, model);
    const canvas = root.querySelector("#circuit-canvas");

    dispatchPointer(root.querySelector('[data-component-id="component-1"]'), "pointerdown");
    dispatchPointer(canvas, "pointermove", { x: 1000, y: 1000 });
    dispatchPointer(canvas, "pointerup", { x: 1000, y: 1000 });
    expect(model.getComponentPosition("component-1")).toEqual({ x: 760, y: 430 });

    dispatchPointer(root.querySelector('[data-component-id="component-1"]'), "pointerdown", {
      pointerId: 2,
      x: 1000,
      y: 1000,
    });
    dispatchPointer(canvas, "pointermove", { pointerId: 2, x: 0, y: 0 });
    dispatchPointer(canvas, "pointerup", { pointerId: 2, x: 0, y: 0 });
    expect(model.getComponentPosition("component-1")).toEqual({ x: 300, y: 85 });
  });

  it("leaves terminal clicks and component selection intact when no drag occurs", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    const changes = [];
    const lab = createCircuitLab(root, model, { onChange: (change) => changes.push(change) });
    const component = model.addComponent("led").component;
    lab.render();
    const terminal = root.querySelector(`[data-terminal="${component.id}:anode"]`);
    const initialPosition = model.getComponentPosition(component.id);

    dispatchPointer(terminal, "pointerdown", { x: 10, y: 10 });
    dispatchPointer(root.querySelector("#circuit-canvas"), "pointermove", { x: 90, y: 90 });
    dispatchPointer(root.querySelector("#circuit-canvas"), "pointerup", { x: 90, y: 90 });
    terminal.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(model.getComponentPosition(component.id)).toEqual(initialPosition);
    expect(root.querySelector("#circuit-wire-from").value).toBe(`${component.id}:anode`);
    expect(changes).toHaveLength(0);

    const componentElement = root.querySelector(`[data-component-id="${component.id}"]`);
    dispatchPointer(componentElement, "pointerdown", { x: 100, y: 100 });
    dispatchPointer(root.querySelector("#circuit-canvas"), "pointerup", { x: 100, y: 100 });
    componentElement.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(root.querySelector(`[data-component-id="${component.id}"]`).classList.contains("is-selected")).toBe(true);
  });

  it("highlights and cancels a terminal origin with Escape or a second click, then creates a wire", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    const led = model.addComponent("led").component;
    createCircuitLab(root, model);
    const selectTerminal = (id) => root.querySelector(`[data-terminal="${id}"]`)
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));

    selectTerminal(`${led.id}:anode`);
    expect(root.querySelector(`[data-terminal="${led.id}:anode"]`).classList.contains("is-origin-selected")).toBe(true);
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(root.querySelector("#circuit-wire-from").value).toBe("");
    expect(root.querySelector(`[data-terminal="${led.id}:anode"]`).classList.contains("is-origin-selected")).toBe(false);

    selectTerminal(`${led.id}:anode`);
    selectTerminal(`${led.id}:anode`);
    expect(root.querySelector("#circuit-wire-from").value).toBe("");
    expect(model.getWires()).toHaveLength(0);

    selectTerminal("arduino:D13");
    expect(root.querySelector(`[data-terminal="arduino:D13"]`).getAttribute("aria-pressed")).toBe("true");
    selectTerminal(`${led.id}:anode`);
    expect(model.getWires()).toEqual([
      { id: "wire-2", from: "arduino:D13", to: `${led.id}:anode` },
    ]);
  });

  it("selects an SVG wire without selecting or dragging a component", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    model.loadDemo();
    createCircuitLab(root, model);
    const before = model.getComponentPosition("component-1");
    const wire = root.querySelector('[data-wire-id="wire-3"].circuit-wire');
    dispatchPointer(wire, "pointerdown", { x: 100, y: 100 });
    dispatchPointer(root.querySelector("#circuit-canvas"), "pointermove", { x: 160, y: 150 });
    dispatchPointer(root.querySelector("#circuit-canvas"), "pointerup", { x: 160, y: 150 });
    wire.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(root.querySelector('[data-wire-id="wire-3"].circuit-wire').classList.contains("is-selected")).toBe(true);
    expect(root.querySelector(".circuit-component.is-selected")).toBeNull();
    expect(model.getComponentPosition("component-1")).toEqual(before);
  });

  it("edits both wire endpoints through the lab controls while retaining the wire ID", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    model.loadDemo();
    const lab = createCircuitLab(root, model);
    const wireId = "wire-3";
    const selectWire = () => root.querySelector(`[data-select-wire="${wireId}"]`).click();
    const changeControl = (selector, value) => {
      const control = root.querySelector(selector);
      control.value = value;
      control.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const startEdit = (side) => {
      selectWire();
      changeControl("[data-wire-edit-side]", side);
    };

    startEdit("from");
    changeControl("[data-wire-edit-endpoint]", "arduino:D12");
    root.querySelector("[data-confirm-wire-edit]").click();
    expect(model.getWires().find(({ id }) => id === wireId)).toEqual({
      id: wireId,
      from: "arduino:D12",
      to: "component-1:lead1",
    });

    startEdit("to");
    changeControl("[data-wire-edit-endpoint]", "component-2:cathode");
    root.querySelector("[data-confirm-wire-edit]").click();
    expect(model.getWires().find(({ id }) => id === wireId)).toEqual({
      id: wireId,
      from: "arduino:D12",
      to: "component-2:cathode",
    });
    const beforeExport = model.getState();
    const visiblePath = root.querySelector(`[data-wire-id="${wireId}"].circuit-wire`).getAttribute("d");
    const exported = lab.getSvgForExport();
    expect(exported.querySelector(`[data-wire-id="${wireId}"].circuit-wire`).getAttribute("d"))
      .toBe(visiblePath);
    expect(model.getState()).toEqual(beforeExport);
  });

  it("cancels wire edits and reports invalid edits without changing the circuit", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    model.loadDemo();
    model.addWire("arduino:D12", "component-1:lead1");
    createCircuitLab(root, model);
    const before = model.getWires();
    const wire = root.querySelector('[data-wire-id="wire-3"].circuit-wire');
    wire.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const side = root.querySelector("[data-wire-edit-side]");
    side.value = "from";
    side.dispatchEvent(new Event("change", { bubbles: true }));
    root.querySelector("[data-wire-edit-endpoint]").value = "arduino:D12";
    root.querySelector("[data-wire-edit-endpoint]").dispatchEvent(new Event("change", { bubbles: true }));
    root.querySelector("[data-cancel-wire-edit]").click();
    expect(model.getWires()).toEqual(before);

    root.querySelector("[data-wire-edit-side]").value = "to";
    root.querySelector("[data-wire-edit-side]").dispatchEvent(new Event("change", { bubbles: true }));
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(model.getWires()).toEqual(before);

    root.querySelector('[data-select-wire="wire-3"]').click();
    const nextSide = root.querySelector("[data-wire-edit-side]");
    nextSide.value = "from";
    nextSide.dispatchEvent(new Event("change", { bubbles: true }));
    const endpoint = root.querySelector("[data-wire-edit-endpoint]");
    endpoint.value = "arduino:D12";
    endpoint.dispatchEvent(new Event("change", { bubbles: true }));
    root.querySelector("[data-confirm-wire-edit]").click();
    expect(model.getWires()).toEqual(before);
    expect(root.querySelector("#circuit-status").textContent).toContain("No se pudo editar la conexión");
  });

  it("deletes the selected wire only and leaves other connections and components intact", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    model.loadDemo();
    const beforeComponents = model.getComponents();
    const beforeWires = model.getWires();
    const lab = createCircuitLab(root, model);
    root.querySelector('[data-wire-id="wire-4"].circuit-wire')
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const wire = root.querySelector('[data-wire-id="wire-4"].circuit-wire');
    dispatchPointer(wire, "pointerdown", { x: 100, y: 100 });
    dispatchPointer(root.querySelector("#circuit-canvas"), "pointerup", { x: 100, y: 100 });
    root.querySelector("[data-delete-selected-wire]").click();

    expect(model.getWires()).toEqual(beforeWires.filter(({ id }) => id !== "wire-4"));
    expect(model.getComponents()).toEqual(beforeComponents);
    expect(root.querySelector(".circuit-wire.is-selected")).toBeNull();
    expect(root.querySelector(".circuit-component.is-selected")).toBeNull();
    expect(lab.getModel().getWires()).toHaveLength(2);
  });

  it("deletes a selected wire with Delete or Backspace and preserves wires while editing text", () => {
    for (const key of ["Delete", "Backspace"]) {
      const root = createRoot();
      const model = createCircuitModel(createMemoryStorage());
      model.loadDemo();
      createCircuitLab(root, model);
      const selectedWireId = model.getWires()[2].id;
      const originalIds = model.getWires().map(({ id }) => id);
      root.querySelector(`[data-select-wire="${selectedWireId}"]`).click();
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      root.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(model.getWires().map(({ id }) => id)).toEqual(originalIds.slice(0, 2));
      expect(root.querySelector(".circuit-wire.is-selected")).toBeNull();
      root.remove();
    }

    for (const tag of ["input", "textarea"]) {
      const root = createRoot();
      const model = createCircuitModel(createMemoryStorage());
      model.loadDemo();
      createCircuitLab(root, model);
      root.querySelector('[data-select-wire="wire-3"]').click();
      const editor = document.createElement(tag);
      root.append(editor);
      editor.focus();
      const event = new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true });
      editor.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(model.getWires()).toHaveLength(3);
      root.remove();
    }
  });

  it("connects Undo and Redo buttons and Ctrl/Cmd keyboard shortcuts to model history", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    const lab = createCircuitLab(root, model);
    const undo = root.querySelector("[data-circuit-undo]");
    const redo = root.querySelector("[data-circuit-redo]");
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);

    model.addComponent("led");
    lab.render();
    expect(undo.disabled).toBe(false);
    const undoEvent = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true });
    root.dispatchEvent(undoEvent);
    expect(undoEvent.defaultPrevented).toBe(true);
    expect(model.getComponents()).toHaveLength(0);
    expect(redo.disabled).toBe(false);

    const redoEvent = new KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true, cancelable: true });
    root.dispatchEvent(redoEvent);
    expect(redoEvent.defaultPrevented).toBe(true);
    expect(model.getComponents()).toHaveLength(1);
    expect(undo.disabled).toBe(false);

    root.querySelector("[data-circuit-undo]").click();
    expect(model.getComponents()).toHaveLength(0);
    root.querySelector("[data-circuit-redo]").click();
    expect(model.getComponents()).toHaveLength(1);
  });

  it("offsets coincident wires while keeping their endpoints anchored", () => {
    const seed = {
      version: 2,
      components: [{ id: "component-1", type: "led", properties: { color: "rojo" } }],
      visual: { positions: { "component-1": { x: 650, y: 220 } } },
      wires: [
        { id: "wire-1", from: "arduino:D13", to: "component-1:anode" },
        { id: "wire-2", from: "arduino:D13", to: "component-1:anode" },
        { id: "wire-3", from: "arduino:D13", to: "component-1:anode" },
      ],
    };
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage({ [circuitStorageKey]: JSON.stringify(seed) }));
    createCircuitLab(root, model);
    const paths = [...root.querySelectorAll(".circuit-wire")];
    expect(new Set(paths.map((path) => path.getAttribute("d"))).size).toBe(3);
    for (const path of paths) {
      expect(path.getAttribute("d")).toMatch(/^M 254 280 C/);
      expect(path.getAttribute("d")).toMatch(/ 631 220$/);
    }
  });

  it("marks unknown wire endpoints and lets the user repair or delete the orphan", () => {
    const seed = {
      version: 2,
      components: [{ id: "component-1", type: "led", properties: { color: "rojo" } }],
      visual: { positions: { "component-1": { x: 650, y: 220 } } },
      wires: [{ id: "wire-1", from: "future-1:signal", to: "component-1:anode" }],
    };
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage({ [circuitStorageKey]: JSON.stringify(seed) }));
    createCircuitLab(root, model);
    expect(root.querySelector('[data-wire-id="wire-1"].circuit-wire').classList.contains("is-invalid")).toBe(true);
    expect(root.querySelector('[data-select-wire="wire-1"]').getAttribute("aria-label")).toContain("Extremo desconocido");
    expect(root.querySelector(".circuit-wire-warning-label").textContent).toContain("Extremo desconocido");

    root.querySelector('[data-select-wire="wire-1"]').click();
    const side = root.querySelector("[data-wire-edit-side]");
    side.value = "from";
    side.dispatchEvent(new Event("change", { bubbles: true }));
    const endpoint = root.querySelector("[data-wire-edit-endpoint]");
    endpoint.value = "arduino:D13";
    endpoint.dispatchEvent(new Event("change", { bubbles: true }));
    root.querySelector("[data-confirm-wire-edit]").click();
    expect(model.getWires()).toEqual([{ id: "wire-1", from: "arduino:D13", to: "component-1:anode" }]);
    expect(root.querySelector('[data-wire-id="wire-1"].circuit-wire').classList.contains("is-invalid")).toBe(false);

    root.querySelector('[data-select-wire="wire-1"]').click();
    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
    expect(model.getWires()).toHaveLength(0);
  });

  it("exports a styled clone of the actual laboratory SVG without changing the displayed mount", () => {
    const root = createRoot();
    const model = createCircuitModel(createMemoryStorage());
    model.loadDemo();
    const lab = createCircuitLab(root, model);
    const visibleCanvas = root.querySelector("#circuit-canvas");
    visibleCanvas.querySelector(".circuit-uno").style.fill = "#237bba";
    const exported = lab.getSvgForExport();

    expect(exported).not.toBe(visibleCanvas);
    expect(exported.getAttribute("viewBox")).toBe("0 0 800 490");
    expect(exported.querySelectorAll(".circuit-wire")).toHaveLength(3);
    expect(exported.querySelectorAll(".circuit-component")).toHaveLength(2);
    expect(exported.querySelector(".circuit-component-label").textContent).toContain("220 Ω");
    expect(exported.querySelector(".circuit-breadboard").style.fill).toBe("#f7f1df");
    expect(exported.querySelector(".circuit-component-label").style.fill).toBe("#566276");
    expect(visibleCanvas.querySelectorAll(".circuit-wire")).toHaveLength(3);
    expect(exported.querySelector(".circuit-uno").getAttribute("style")).toContain("fill:#237bba");
  });
});
