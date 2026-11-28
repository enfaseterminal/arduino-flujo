import {
  getBoardProfiles,
  getArduinoTerminals,
  getComponentTerminals,
  isComponentType,
} from "./circuit-catalog.js";
import { resistorBands, resistorValues } from "./circuit-model.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const COMPONENT_LABELS = {
  led: "LED",
  rgbLed: "LED RGB",
  resistor: "Resistencia",
  button: "Pulsador",
  potentiometer: "Potenciómetro",
  photoresistor: "Sensor de luz",
  servo: "Servomotor",
  irSensor: "Sensor infrarrojo digital",
};
const COLOR_VALUES = {
  rojo: "#e04438",
  verde: "#329665",
  amarillo: "#e9c63f",
  azul: "#387fc1",
};

function svgElement(name, attributes = {}, text = "") {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text) element.textContent = text;
  return element;
}

function htmlElement(name, className, text = "") {
  const element = document.createElement(name);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function endpointTitle(endpoint) {
  if (endpoint.startsWith("arduino:")) return `Arduino ${endpoint.slice("arduino:".length)}`;
  const [componentId, terminal] = endpoint.split(":");
  return `${componentId} · ${terminal}`;
}

function componentDescription(component) {
  const properties = component.properties ?? {};
  switch (component.type) {
    case "led": return `LED ${properties.color}`;
    case "rgbLed": return "LED RGB";
    case "resistor": return `Resistencia ${properties.ohms} Ω`;
    case "button": return `Pulsador ${properties.pressed ? "presionado" : "liberado"}`;
    case "potentiometer": return `Potenciómetro ${properties.value}/1023`;
    case "photoresistor": return `Sensor de luz ${properties.value}/1023`;
    case "servo": return `Servomotor ${properties.angle}°`;
    case "irSensor": return `Sensor infrarrojo ${properties.detected ? "detecta" : "libre"}`;
    default: return `Componente no compatible (${component.type})`;
  }
}

const COMPONENT_TERMINAL_OFFSETS = {
  led: { left: [-19, 0], right: [19, 0] },
  rgbLed: { left: [-30, 0], top: [0, -30], right: [30, 0], bottom: [0, 30] },
  resistor: { left: [-34, 0], right: [34, 0] },
  button: { left: [-32, 0], right: [32, 0] },
  potentiometer: { left: [-38, 0], top: [0, -42], right: [38, 0] },
  photoresistor: { top: [0, -34], left: [-38, 0], bottom: [0, 34] },
  servo: { top: [0, -34], left: [-38, 0], bottom: [0, 34] },
  irSensor: { top: [0, -34], left: [-38, 0], bottom: [0, 34] },
};

function terminalPosition(component, terminalId, position) {
  const terminal = getComponentTerminals(component.type).find(({ id }) => id === terminalId);
  if (!terminal || !position) return null;
  const offset = COMPONENT_TERMINAL_OFFSETS[component.type]?.[terminal.anchor];
  if (!offset) return null;
  const { x, y } = position;
  const [offsetX, offsetY] = offset;
  return { x: x + offsetX, y: y + offsetY };
}

function arduinoTerminalPosition(terminal) {
  if (terminal.kind === "digital") return { x: 254, y: 46 + terminal.number * 18 };
  if (terminal.kind === "analog") return { x: 254, y: 315 + terminal.number * 18 };
  return { x: 254, y: terminal.id === "5V" ? 471 : 489 };
}

function endpointPosition(endpoint, components, positions, terminals) {
  if (endpoint.startsWith("arduino:")) {
    const terminal = terminals.find(({ id }) => id === endpoint.slice("arduino:".length));
    return terminal ? arduinoTerminalPosition(terminal) : null;
  }
  const separator = endpoint.lastIndexOf(":");
  const component = components.find((item) => item.id === endpoint.slice(0, separator));
  return component
    ? terminalPosition(component, endpoint.slice(separator + 1), positions[component.id])
    : null;
}

function pointerPosition(canvas, event) {
  const matrix = canvas.getScreenCTM?.();
  if (matrix && typeof DOMPoint === "function") {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  const viewBox = canvas.viewBox?.baseVal;
  const bounds = canvas.getBoundingClientRect();
  if (!viewBox?.width || !viewBox.height || !bounds.width || !bounds.height) {
    return { x: event.clientX, y: event.clientY };
  }
  const scale = Math.min(bounds.width / viewBox.width, bounds.height / viewBox.height);
  const offsetX = (bounds.width - viewBox.width * scale) / 2;
  const offsetY = (bounds.height - viewBox.height * scale) / 2;
  return {
    x: viewBox.x + (event.clientX - bounds.left - offsetX) / scale,
    y: viewBox.y + (event.clientY - bounds.top - offsetY) / scale,
  };
}

function wirePath(from, to, offset = 0) {
  const rawDx = to.x - from.x;
  const rawDy = to.y - from.y;
  const length = Math.hypot(rawDx, rawDy);
  const dx = length ? rawDx / length : 1;
  const dy = length ? rawDy / length : 0;
  const offsetX = -dy * offset;
  const offsetY = dx * offset;
  const controlX = (from.x + to.x) / 2 + offsetX;
  return `M ${from.x} ${from.y} C ${controlX} ${from.y + offsetY}, ${controlX} ${to.y + offsetY}, ${to.x} ${to.y}`;
}

function wirePathEntries(wires, components, positions, endpoints, terminals) {
  const endpointIds = new Set(endpoints.map(({ id }) => id));
  const groups = new Map();
  for (const wire of wires) {
    const pair = [wire.from, wire.to].sort();
    const key = JSON.stringify(pair);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(wire);
  }

  const indexes = new Map();
  return wires.map((wire) => {
    const pair = [wire.from, wire.to].sort();
    const group = groups.get(JSON.stringify(pair));
    const index = indexes.get(JSON.stringify(pair)) ?? 0;
    indexes.set(JSON.stringify(pair), index + 1);
    const centeredOffset = (index - (group.length - 1) / 2) * 14;
    const orientation = wire.from <= wire.to ? 1 : -1;
    const from = endpointPosition(wire.from, components, positions, terminals) ?? { x: 280, y: 500 };
    const to = endpointPosition(wire.to, components, positions, terminals) ?? { x: 790, y: 500 };
    const invalid = !endpointIds.has(wire.from) || !endpointIds.has(wire.to);
    return {
      wire,
      invalid,
      from,
      to,
      d: wirePath(from, to, centeredOffset * orientation),
    };
  });
}

function makeSelect(labelText, name, options, selectedValue = "") {
  const label = htmlElement("label", "circuit-field", labelText);
  const select = htmlElement("select", "circuit-select");
  select.name = name;
  for (const [value, text] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.append(option);
  }
  select.value = String(selectedValue || options[0]?.[0] || "");
  label.append(select);
  return { label, control: select };
}

export function createCircuitLab(root, model, { onChange = () => {}, onLoadDemo = () => {} } = {}) {
  let selectedComponentId = null;
  let selectedWireId = null;
  let wireEditSide = null;
  let wireEditEndpoint = "";
  let currentSimulationInputs = null;
  let activeDrag = null;
  let suppressedClick = null;
  const canvas = root.querySelector("#circuit-canvas");
  const componentList = root.querySelector("#circuit-component-list");
  const wireList = root.querySelector("#circuit-wire-list");
  const properties = root.querySelector("#circuit-properties");
  const warnings = root.querySelector("#circuit-warnings");
  const status = root.querySelector("#circuit-status");
  const fromSelect = root.querySelector("#circuit-wire-from");
  const toSelect = root.querySelector("#circuit-wire-to");
  const boardSelect = root.querySelector("#circuit-board-profile");
  const boardNotes = root.querySelector("#circuit-board-profile-notes");
  const wireForm = root.querySelector("#circuit-wire-form");
  const historyControls = htmlElement("div", "circuit-history-controls");
  const undoButton = htmlElement("button", "tool-button circuit-history-button", "Deshacer");
  undoButton.type = "button";
  undoButton.dataset.circuitUndo = "";
  undoButton.setAttribute("aria-label", "Deshacer el último cambio del circuito");
  const redoButton = htmlElement("button", "tool-button circuit-history-button", "Rehacer");
  redoButton.type = "button";
  redoButton.dataset.circuitRedo = "";
  redoButton.setAttribute("aria-label", "Rehacer el último cambio deshecho del circuito");
  historyControls.append(undoButton, redoButton);
  wireForm.before(historyControls);
  const wireEditor = htmlElement("section", "circuit-wire-editor");
  wireEditor.setAttribute("aria-live", "polite");
  wireList.after(wireEditor);

  function announceChange(change) {
    render();
    onChange(change);
  }

  function addOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  }

  function renderCanvas() {
    const components = model.getComponents();
    const board = model.getBoardProfile();
    const terminals = getArduinoTerminals(board.id);
    const positions = model.getVisualState().positions;
    const wires = model.getWires();
    canvas.replaceChildren();
    canvas.dataset.boardProfile = board.id;
    canvas.append(svgElement("title", { id: "circuit-canvas-title" }, `${board.name} y protoboard`));
    canvas.append(svgElement("desc", {}, `Pinout funcional del perfil ${board.name}. Selecciona componentes o terminales para editarlos y conectarlos.`));
    canvas.append(svgElement("rect", { x: 18, y: 42, width: 246, height: 450, rx: 20, class: "circuit-uno" }));
    canvas.append(svgElement("text", { x: 141, y: 70, "text-anchor": "middle", class: "circuit-uno-title" }, board.name));
    canvas.append(svgElement("rect", { x: 52, y: 91, width: 138, height: 87, rx: 10, class: "circuit-chip" }));
    canvas.append(svgElement("text", { x: 121, y: 139, "text-anchor": "middle", class: "circuit-label" }, "ATmega328P"));
    canvas.append(svgElement("rect", { x: 299, y: 42, width: 483, height: 450, rx: 12, class: "circuit-breadboard" }));
    canvas.append(svgElement("text", { x: 320, y: 66, class: "circuit-board-label" }, "Protoboard"));
    for (const x of [322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582, 602, 622, 642, 662, 682, 702, 722, 742, 762]) {
      for (const y of [86, 104, 122, 140, 158, 176, 194, 212, 230, 248, 266, 284, 302, 320, 338, 356, 374, 392, 410, 428, 446]) {
        canvas.append(svgElement("circle", { cx: x, cy: y, r: 2, class: "circuit-hole" }));
      }
    }

    for (const terminal of terminals) {
      const { x, y } = arduinoTerminalPosition(terminal);
      canvas.append(svgElement("line", { x1: 228, y1: y, x2: x, y2: y, class: "circuit-pin-line" }));
      canvas.append(svgElement("circle", {
        cx: x,
        cy: y,
        r: 5,
        class: "circuit-terminal",
        "data-terminal": `arduino:${terminal.id}`,
        tabindex: 0,
        role: "button",
        "aria-label": terminal.serial
          ? `Terminal ${board.name} ${terminal.id}, serie ${terminal.serial}; usarlo puede interferir con la comunicación serie.`
          : terminal.analogOnly
            ? `Terminal ${board.name} ${terminal.id}, solo entrada analógica`
            : terminal.pwm ? `Terminal ${board.name} ${terminal.id}, compatible con PWM` : `Terminal ${board.name} ${terminal.id}`,
        title: terminal.serial ? `${terminal.serial}: serie hardware` : terminal.analogOnly ? "Solo entrada analógica" : terminal.pwm ? "PWM" : terminal.id,
        "aria-pressed": String(fromSelect.value === `arduino:${terminal.id}`),
        class: `circuit-terminal${fromSelect.value === `arduino:${terminal.id}` ? " is-origin-selected" : ""}`,
      }));
      canvas.append(svgElement("text", {
        x: 216,
        y: y + 3,
        "text-anchor": "end",
        class: "circuit-pin-label",
      }, terminal.serial ? `${terminal.id} · ${terminal.serial}` : terminal.id));
    }

    const wireEntries = wirePathEntries(wires, components, positions, model.getEndpoints(), terminals);
    for (const { wire, d, invalid, from, to } of wireEntries) {
      const invalidClass = invalid ? " is-invalid" : "";
      canvas.append(svgElement("path", {
        d,
        class: `circuit-wire-hit${invalidClass}`,
        "data-wire-id": wire.id,
        "aria-hidden": "true",
      }));
      if (invalid) canvas.append(svgElement("text", {
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2 - 5,
        class: "circuit-wire-warning",
        "data-wire-warning": wire.id,
        "aria-hidden": "true",
      }, "⚠"));
    }
    for (const { wire, d, invalid } of wireEntries) {
      const invalidClass = invalid ? " is-invalid" : "";
      canvas.append(svgElement("path", {
        d,
        class: `circuit-wire${invalidClass}${wire.id === selectedWireId ? " is-selected" : ""}`,
        "data-wire-id": wire.id,
        tabindex: 0,
        role: "button",
        "aria-pressed": String(wire.id === selectedWireId),
        "aria-label": `Conexión ${endpointTitle(wire.from)} con ${endpointTitle(wire.to)}${invalid ? ". Advertencia: extremo desconocido" : ""}${wire.id === selectedWireId ? ", seleccionada" : ""}`,
      }));
    }

    const ledStates = model.getLedStates();
    for (const component of components) {
      const position = positions[component.id];
      if (!position) continue;
      const { x, y } = position;
      const group = svgElement("g", {
        class: `circuit-component circuit-component-${isComponentType(component.type) ? component.type : "unknown"}${component.id === selectedComponentId ? " is-selected" : ""}`,
        "data-component-id": component.id,
        tabindex: 0,
        role: "button",
        "aria-label": `${componentDescription(component)}. Seleccionar componente.`,
      });
      if (component.type === "led") {
        const ledState = ledStates[component.id] ?? { state: "unknown" };
        group.setAttribute("data-state", ledState.state);
        group.append(svgElement("line", { x1: x - 19, y1: y, x2: x - 9, y2: y, class: "circuit-lead" }));
        group.append(svgElement("line", { x1: x + 9, y1: y, x2: x + 19, y2: y, class: "circuit-lead" }));
        group.append(svgElement("path", { d: `M ${x - 9} ${y} Q ${x} ${y - 25} ${x + 9} ${y} Q ${x} ${y + 10} ${x - 9} ${y}Z`, class: "circuit-led-bulb", fill: COLOR_VALUES[component.properties.color] }));
        group.append(svgElement("line", { x1: x + 5, y1: y - 10, x2: x + 5, y2: y + 5, class: "circuit-led-cathode" }));
        if (ledState.state === "on") {
          group.append(svgElement("path", { d: `M ${x + 12} ${y - 18} l 10 -10 m -6 0 h 6 v 6 M ${x + 17} ${y - 7} l 10 -10 m -6 0 h 6 v 6`, class: "circuit-led-rays" }));
        }
      } else if (component.type === "rgbLed") {
        const rgb = model.getRgbLedStates()[component.id] ?? { red: 0, green: 0, blue: 0 };
        group.dataset.state = rgb.active ? "on" : "off";
        group.append(svgElement("circle", { cx: x, cy: y, r: 17, fill: `rgb(${rgb.red}, ${rgb.green}, ${rgb.blue})`, class: "circuit-rgb-led" }));
        group.append(svgElement("circle", { cx: x, cy: y, r: 6, fill: "#222", class: "circuit-rgb-cathode" }));
      } else if (component.type === "resistor") {
        group.append(svgElement("line", { x1: x - 34, y1: y, x2: x - 24, y2: y, class: "circuit-lead" }));
        group.append(svgElement("rect", { x: x - 24, y: y - 9, width: 48, height: 18, rx: 4, class: "circuit-resistor-body" }));
        const bands = resistorBands(component.properties.ohms, component.properties.bandCount, component.properties.tolerance);
        const colors = { negro: "#252525", marrón: "#8b4b28", rojo: "#e04438", naranja: "#ec8428", amarillo: "#e9c63f", verde: "#329665", azul: "#387fc1", violeta: "#8457ad", gris: "#8b929b", blanco: "#f4f4f4", dorado: "#c5a13b", plateado: "#c6cbd1" };
        bands.forEach((band, index) => group.append(svgElement("rect", {
          x: x - 16 + index * (32 / Math.max(1, bands.length - 1)),
          y: y - 9,
          width: 3,
          height: 18,
          fill: colors[band],
          class: "circuit-resistor-band",
        })));
        group.append(svgElement("line", { x1: x + 24, y1: y, x2: x + 34, y2: y, class: "circuit-lead" }));
      } else if (component.type === "button") {
        group.setAttribute("data-state", component.properties.pressed ? "pressed" : "released");
        group.append(svgElement("line", { x1: x - 32, y1: y, x2: x - 16, y2: y, class: "circuit-lead" }));
        group.append(svgElement("rect", { x: x - 16, y: y - 11, width: 32, height: 22, rx: 4, class: "circuit-button-body" }));
        group.append(svgElement("circle", { cx: x, cy: y, r: 5, class: "circuit-button-cap" }));
        group.append(svgElement("line", { x1: x + 16, y1: y, x2: x + 32, y2: y, class: "circuit-lead" }));
      } else if (component.type === "potentiometer") {
        group.append(svgElement("line", { x1: x - 38, y1: y, x2: x + 38, y2: y, class: "circuit-lead" }));
        const knobX = x - 26 + (Number(component.properties.value) / 1023) * 52;
        group.append(svgElement("line", { x1: x - 26, y1: y - 25, x2: x + 26, y2: y - 25, class: "circuit-pot-track" }));
        group.append(svgElement("line", { x1: knobX, y1: y - 30, x2: x, y2: y - 42, class: "circuit-pot-wiper-line" }));
        group.append(svgElement("circle", { cx: knobX, cy: y - 25, r: 6, class: "circuit-pot-knob", "data-pot-knob": "" }));
      } else if (component.type === "photoresistor") {
        group.append(svgElement("rect", { x: x - 22, y: y - 18, width: 44, height: 36, rx: 8, class: "circuit-photoresistor-body" }));
        group.append(svgElement("circle", { cx: x, cy: y, r: 9, class: "circuit-photoresistor-cell" }));
        group.append(svgElement("path", { d: `M ${x - 5} ${y + 5} L ${x + 5} ${y - 5} M ${x - 1} ${y + 7} L ${x + 7} ${y - 1}`, class: "circuit-photoresistor-mark" }));
        group.dataset.value = String(component.properties.value);
      } else if (component.type === "servo") {
        const angle = Number(component.properties.angle);
        group.dataset.angle = String(angle);
        group.append(svgElement("rect", { x: x - 22, y: y - 18, width: 44, height: 36, rx: 7, class: "circuit-servo-body" }));
        group.append(svgElement("line", {
          x1: x, y1: y, x2: x, y2: y - 30,
          transform: `rotate(${angle - 90} ${x} ${y})`,
          class: "circuit-servo-horn",
          "data-servo-horn": "",
        }));
        group.append(svgElement("circle", { cx: x, cy: y, r: 5, class: "circuit-servo-pivot" }));
      } else if (component.type === "irSensor") {
        group.dataset.state = component.properties.detected ? "detected" : "clear";
        group.append(svgElement("rect", { x: x - 22, y: y - 17, width: 44, height: 34, rx: 7, class: "circuit-ir-body" }));
        group.append(svgElement("circle", { cx: x - 7, cy: y, r: 6, class: "circuit-ir-eye" }));
        group.append(svgElement("circle", { cx: x + 8, cy: y, r: 6, class: "circuit-ir-eye" }));
      } else {
        group.append(svgElement("rect", {
          x: x - 30,
          y: y - 15,
          width: 60,
          height: 30,
          rx: 5,
          class: "circuit-unknown-body",
        }));
      }
      group.append(svgElement("text", { x, y: y + 28, "text-anchor": "middle", class: "circuit-component-label" }, componentDescription(component)));
      for (const terminal of getComponentTerminals(component.type)) {
        const point = terminalPosition(component, terminal.id, position);
        if (!point) continue;
        group.append(svgElement("circle", {
          cx: point.x,
          cy: point.y,
          r: 5,
          class: "circuit-terminal",
          "data-terminal": `${component.id}:${terminal.id}`,
          tabindex: 0,
          role: "button",
          "aria-label": `Terminal ${terminal.id} de ${componentDescription(component)}`,
          "aria-pressed": String(fromSelect.value === `${component.id}:${terminal.id}`),
          class: `circuit-terminal${fromSelect.value === `${component.id}:${terminal.id}` ? " is-origin-selected" : ""}`,
        }));
      }
      canvas.append(group);
    }
    canvas.setAttribute("aria-labelledby", "circuit-canvas-title");
  }

  function renderWireControls() {
    const endpoints = model.getEndpoints();
    const endpointIds = new Set(endpoints.map(({ id }) => id));
    const previousFrom = fromSelect.value;
    const previousTo = toSelect.value;
    fromSelect.replaceChildren();
    toSelect.replaceChildren();
    addOption(fromSelect, "", "Seleccionar terminal");
    addOption(toSelect, "", "Seleccionar terminal");
    for (const endpoint of endpoints) {
      addOption(fromSelect, endpoint.id, endpoint.label);
      addOption(toSelect, endpoint.id, endpoint.label);
    }
    if (endpoints.some(({ id }) => id === previousFrom)) fromSelect.value = previousFrom;
    if (endpoints.some(({ id }) => id === previousTo)) toSelect.value = previousTo;

    wireList.replaceChildren();
    for (const wire of model.getWires()) {
      const invalid = !endpointIds.has(wire.from) || !endpointIds.has(wire.to);
      const item = htmlElement("li", `circuit-wire-item${wire.id === selectedWireId ? " is-selected" : ""}${invalid ? " is-invalid" : ""}`);
      const select = htmlElement("button", "circuit-wire-select", `${endpointTitle(wire.from)} ↔ ${endpointTitle(wire.to)}`);
      select.type = "button";
      select.dataset.selectWire = wire.id;
      select.setAttribute("aria-pressed", String(wire.id === selectedWireId));
      if (invalid) select.setAttribute("aria-label", `Conexión ${endpointTitle(wire.from)} con ${endpointTitle(wire.to)}. Extremo desconocido; selecciona para reparar o eliminar.`);
      const remove = htmlElement("button", "tool-button circuit-remove-wire", "Quitar");
      remove.type = "button";
      remove.dataset.removeWire = wire.id;
      remove.setAttribute("aria-label", `Quitar conexión ${endpointTitle(wire.from)} con ${endpointTitle(wire.to)}`);
      if (invalid) item.append(htmlElement("span", "circuit-wire-warning-label", "⚠ Extremo desconocido"));
      item.append(select, remove);
      wireList.append(item);
    }

    if (selectedWireId && !model.getWires().some(({ id }) => id === selectedWireId)) {
      selectedWireId = null;
      wireEditSide = null;
      wireEditEndpoint = "";
    }
    wireEditor.replaceChildren();
    const selectedWire = model.getWires().find(({ id }) => id === selectedWireId);
    if (!selectedWire) return;
    const heading = htmlElement("h3", "", `Conexión seleccionada · ${selectedWire.id}`);
    wireEditor.append(heading);
    if (wireEditSide === null) {
      wireEditor.append(htmlElement("p", "circuit-help", `${endpointTitle(selectedWire.from)} ↔ ${endpointTitle(selectedWire.to)}`));
      const side = makeSelect("Extremo que sustituir", "wire-side", [["from", `Origen · ${endpointTitle(selectedWire.from)}`], ["to", `Destino · ${endpointTitle(selectedWire.to)}`]]);
      side.control.dataset.wireEditSide = "";
      const edit = htmlElement("button", "tool-button button-primary circuit-wire-edit", "Editar extremo");
      edit.type = "button";
      edit.dataset.startWireEdit = "";
      const remove = htmlElement("button", "tool-button tool-button-danger circuit-wire-delete", "Eliminar conexión");
      remove.type = "button";
      remove.dataset.deleteSelectedWire = "";
      wireEditor.append(side.label, edit, remove);
      return;
    }

    const side = makeSelect("Extremo que sustituir", "wire-side", [["from", `Origen · ${endpointTitle(selectedWire.from)}`], ["to", `Destino · ${endpointTitle(selectedWire.to)}`]], wireEditSide);
    side.control.dataset.wireEditSide = "";
    const endpoint = makeSelect("Nuevo terminal", "wire-endpoint", endpoints.map(({ id, label }) => [id, label]), wireEditEndpoint);
    endpoint.control.dataset.wireEditEndpoint = "";
    const confirm = htmlElement("button", "tool-button button-primary circuit-wire-confirm", "Confirmar cambio");
    confirm.type = "button";
    confirm.dataset.confirmWireEdit = "";
    confirm.disabled = !wireEditEndpoint;
    const cancel = htmlElement("button", "tool-button circuit-wire-cancel", "Cancelar");
    cancel.type = "button";
    cancel.dataset.cancelWireEdit = "";
    const remove = htmlElement("button", "tool-button tool-button-danger circuit-wire-delete", "Eliminar conexión");
    remove.type = "button";
    remove.dataset.deleteSelectedWire = "";
    wireEditor.append(side.label, endpoint.label, confirm, cancel, remove,
      htmlElement("p", "circuit-help", "También puedes seleccionar el nuevo terminal en el montaje y confirmar el cambio."));
  }

  function renderComponentList() {
    componentList.replaceChildren();
    for (const component of model.getComponents()) {
      const button = htmlElement(
        "button",
        `circuit-component-item${component.id === selectedComponentId ? " is-selected" : ""}`,
        `${COMPONENT_LABELS[component.type] ?? "Componente"} · ${componentDescription(component)}`,
      );
      button.type = "button";
      button.dataset.selectComponent = component.id;
      componentList.append(button);
    }
  }

  function appendComponentProperties(component) {
    properties.replaceChildren();
    if (!component) {
      properties.append(htmlElement("p", "circuit-empty", "Selecciona un componente en el montaje para ver sus propiedades."));
      return;
    }
    properties.append(htmlElement("h3", "", `${COMPONENT_LABELS[component.type] ?? "Componente"} · ${component.id}`));
    properties.append(htmlElement("p", "circuit-help", "La visualización representa conexiones educativas; no calcula magnitudes eléctricas."));

    if (component.type === "led") {
      const { label, control } = makeSelect("Color", "color", Object.keys(COLOR_VALUES).map((color) => [color, color]), component.properties.color);
      control.dataset.property = "color";
      properties.append(label);
    } else if (component.type === "resistor") {
      const value = makeSelect("Valor", "ohms", resistorValues.map((ohms) => [String(ohms), `${ohms} Ω`]), component.properties.ohms);
      value.control.dataset.property = "ohms";
      const bandCount = makeSelect("Bandas", "bandCount", [["3", "3 bandas"], ["4", "4 bandas"], ["5", "5 bandas"]], component.properties.bandCount);
      bandCount.control.dataset.property = "bandCount";
      const tolerance = makeSelect("Tolerancia", "tolerance", [["1", "±1 %"], ["2", "±2 %"], ["5", "±5 %"], ["10", "±10 %"]], component.properties.tolerance);
      tolerance.control.dataset.property = "tolerance";
      tolerance.control.disabled = component.properties.bandCount === 3;
      properties.append(value.label, bandCount.label, tolerance.label);
      properties.append(htmlElement("p", "circuit-resistor-colors", `Código de colores: ${resistorBands(component.properties.ohms, component.properties.bandCount, component.properties.tolerance).join(" · ")}`));
      properties.append(htmlElement("p", "circuit-help", "La tolerancia es descriptiva; no se calcula corriente."));
    } else if (component.type === "button") {
      const pressed = htmlElement("button", "tool-button button-primary circuit-input-toggle", component.properties.pressed ? "Liberar pulsador" : "Presionar pulsador");
      pressed.type = "button";
      pressed.dataset.property = "pressed";
      pressed.setAttribute("aria-pressed", String(component.properties.pressed));
      properties.append(pressed, htmlElement("p", "circuit-help", "La entrada solo se determina con una conexión válida al pin y una referencia GND o 5V."));
    } else if (component.type === "potentiometer" || component.type === "photoresistor") {
      const label = htmlElement("label", "circuit-field", "Valor analógico (0–1023)");
      const range = document.createElement("input");
      range.type = "range";
      range.name = "value";
      range.min = "0";
      range.max = "1023";
      range.step = "1";
      range.value = String(component.properties.value);
      range.dataset.property = "value";
      label.append(range);
      const output = htmlElement("output", "circuit-pot-value circuit-analog-value", `${component.properties.value}/1023`);
      properties.append(label, output, htmlElement("p", "circuit-help", component.type === "potentiometer"
        ? "El valor alimenta analogRead() cuando el wiper y los extremos están conectados correctamente."
        : "El valor representa la lectura de luz simulada; requiere VCC, GND y AO conectados."));
    } else if (component.type === "servo") {
      const label = htmlElement("label", "circuit-field", "Ángulo del servo (0–180°)");
      const range = document.createElement("input");
      range.type = "range";
      range.name = "angle";
      range.min = "0";
      range.max = "180";
      range.step = "1";
      range.value = String(component.properties.angle);
      range.dataset.property = "angle";
      label.append(range);
      properties.append(label, htmlElement("output", "circuit-servo-angle", `${component.properties.angle}°`),
        htmlElement("p", "circuit-help", "motor.attach(pin) asocia SIG a un pin digital y motor.write(grados) actualiza el brazo en la simulación."));
    } else if (component.type === "irSensor") {
      const detected = htmlElement("button", "tool-button", component.properties.detected ? "Simular sin detección" : "Simular detección");
      detected.type = "button";
      detected.dataset.property = "detected";
      detected.setAttribute("aria-pressed", String(component.properties.detected));
      properties.append(detected, htmlElement("p", "circuit-help", "digitalRead(pin) devuelve HIGH al detectar y LOW cuando no hay detección; conecta VCC, GND y OUT."));
    } else {
      properties.append(htmlElement("p", "circuit-help", "Este componente se conserva, pero esta versión no puede editarlo ni simularlo."));
    }

    const remove = htmlElement("button", "tool-button tool-button-danger", "Eliminar componente");
    remove.type = "button";
    remove.dataset.removeComponent = component.id;
    properties.append(remove);
  }

  function renderWarnings() {
    const list = model.getWarnings();
    warnings.replaceChildren();
    if (!list.length) {
      warnings.append(htmlElement("p", "circuit-success", "Sin advertencias: el montaje tiene terminales conectados."));
      return;
    }
    warnings.append(htmlElement("p", "circuit-warning-title", `${list.length} aviso(s) de conexión`));
    const items = document.createElement("ul");
    for (const warning of list) items.append(htmlElement("li", "", warning));
    warnings.append(items);
  }

  function render() {
    if (selectedComponentId && !model.getComponents().some(({ id }) => id === selectedComponentId)) {
      selectedComponentId = null;
    }
    renderCanvas();
    if (boardSelect) boardSelect.value = model.getBoardProfile().id;
    if (boardNotes) {
      const board = model.getBoardProfile();
      boardNotes.replaceChildren();
      boardNotes.append(htmlElement("strong", "", `${board.model} · ${board.voltage}`));
      const notes = document.createElement("ul");
      board.notes.forEach((note) => notes.append(htmlElement("li", "", note)));
      boardNotes.append(notes);
    }
    renderWireControls();
    renderComponentList();
    const selected = model.getComponents().find((item) => item.id === selectedComponentId);
    if (selected && currentSimulationInputs && Object.hasOwn(currentSimulationInputs, selected.id)) {
      selected.properties = {
        ...selected.properties,
        ...(selected.type === "button" ? { pressed: Boolean(currentSimulationInputs[selected.id]) } : {}),
        ...(selected.type === "potentiometer" ? { value: Number(currentSimulationInputs[selected.id]) } : {}),
        ...(selected.type === "photoresistor" ? { value: Number(currentSimulationInputs[selected.id]) } : {}),
        ...(selected.type === "servo" ? { angle: Number(currentSimulationInputs[selected.id]) } : {}),
      };
    }
    appendComponentProperties(selected);
    renderWarnings();
    status.textContent = model.getComponents().length
      ? `${model.getComponents().length} componentes · ${model.getWires().length} conexiones`
      : "Añade componentes o carga el circuito de ejemplo.";
    undoButton.disabled = !model.canUndo();
    redoButton.disabled = !model.canRedo();
  }

  function updateDragPreview() {
    const { componentId, element, startPosition, position } = activeDrag;
    element.setAttribute(
      "transform",
      `translate(${position.x - startPosition.x} ${position.y - startPosition.y})`,
    );
    const components = model.getComponents();
    const positions = model.getVisualState().positions;
    positions[componentId] = position;
    for (const entry of wirePathEntries(model.getWires(), components, positions, model.getEndpoints(), getArduinoTerminals(model.getBoardProfile().id))) {
      for (const path of canvas.querySelectorAll(`[data-wire-id="${entry.wire.id}"]`)) {
        path.setAttribute("d", entry.d);
      }
      const warning = canvas.querySelector(`[data-wire-warning="${entry.wire.id}"]`);
      if (warning) {
        warning.setAttribute("x", String((entry.from.x + entry.to.x) / 2));
        warning.setAttribute("y", String((entry.from.y + entry.to.y) / 2 - 5));
      }
    }
  }

  function stopDrag(commit) {
    if (!activeDrag) return;
    const drag = activeDrag;
    activeDrag = null;
    canvas.classList.remove("is-dragging");
    if (!commit) {
      renderCanvas();
      return;
    }
    if (!drag.moved) return;

    selectedComponentId = drag.componentId;
    suppressedClick = { componentId: drag.componentId, expiresAt: performance.now() + 500 };
    if (
      drag.position.x !== drag.startPosition.x ||
      drag.position.y !== drag.startPosition.y
    ) {
      announceChange(model.setComponentPosition(drag.componentId, drag.position));
    } else {
      render();
    }
  }

  canvas.addEventListener("pointerdown", (event) => {
    suppressedClick = null;
    if (event.button !== 0 || event.isPrimary === false || !(event.target instanceof Element)) return;
    if (event.target.closest("[data-terminal], .circuit-wire")) return;
    const element = event.target.closest(".circuit-component[data-component-id]");
    if (!element) return;
    const componentId = element.dataset.componentId;
    const position = model.getComponentPosition(componentId);
    if (!position) return;

    activeDrag = {
      pointerId: event.pointerId,
      componentId,
      element,
      startPointer: pointerPosition(canvas, event),
      startPosition: position,
      position,
      moved: false,
    };
    if (
      Number.isFinite(event.pointerId) &&
      typeof element.setPointerCapture === "function"
    ) {
      element.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
    const point = pointerPosition(canvas, event);
    const deltaX = point.x - activeDrag.startPointer.x;
    const deltaY = point.y - activeDrag.startPointer.y;
    if (!activeDrag.moved && Math.hypot(deltaX, deltaY) < 3) return;
    activeDrag.moved = true;
    activeDrag.position = {
      x: Math.max(300, Math.min(760, activeDrag.startPosition.x + deltaX)),
      y: Math.max(85, Math.min(430, activeDrag.startPosition.y + deltaY)),
    };
    canvas.classList.add("is-dragging");
    updateDragPreview();
    event.preventDefault();
  });

  canvas.addEventListener("pointerup", (event) => {
    if (activeDrag && event.pointerId === activeDrag.pointerId) stopDrag(true);
  });

  canvas.addEventListener("pointercancel", (event) => {
    if (activeDrag && event.pointerId === activeDrag.pointerId) stopDrag(false);
  });

  canvas.addEventListener("lostpointercapture", (event) => {
    if (activeDrag && event.pointerId === activeDrag.pointerId) stopDrag(false);
  });

  function addWire(from, to) {
    try {
      const change = model.addWire(from, to);
      fromSelect.value = "";
      toSelect.value = "";
      selectedWireId = null;
      announceChange(change);
    } catch (error) {
      status.textContent = error.message;
    }
  }

  function cancelWireEdit() {
    wireEditSide = null;
    wireEditEndpoint = "";
    renderWireControls();
    status.textContent = "Edición de conexión cancelada.";
  }

  function applyWireEdit() {
    if (!selectedWireId || !wireEditSide || !wireEditEndpoint) return;
    try {
      const change = model.updateWireEndpoint(selectedWireId, wireEditSide, wireEditEndpoint);
      wireEditSide = null;
      wireEditEndpoint = "";
      status.textContent = "Conexión actualizada.";
      announceChange(change);
    } catch (error) {
      status.textContent = `No se pudo editar la conexión: ${error.message}`;
    }
  }

  function deleteSelectedWire() {
    if (!selectedWireId) return;
    const change = model.removeWire(selectedWireId);
    selectedWireId = null;
    wireEditSide = null;
    wireEditEndpoint = "";
    if (change) announceChange(change);
    else render();
  }

  function runHistoryAction(action) {
    const available = action === "undo" ? model.canUndo() : model.canRedo();
    if (!available) return;
    const change = model[action]();
    if (change !== false) announceChange(change);
  }

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-circuit-undo]")) {
      runHistoryAction("undo");
      return;
    }
    if (event.target.closest("[data-circuit-redo]")) {
      runHistoryAction("redo");
      return;
    }
    const clickedWire = event.target.closest(".circuit-wire[data-wire-id], .circuit-wire-hit[data-wire-id]");
    if (clickedWire) {
      selectedWireId = selectedWireId === clickedWire.dataset.wireId ? null : clickedWire.dataset.wireId;
      selectedComponentId = null;
      fromSelect.value = "";
      wireEditSide = null;
      wireEditEndpoint = "";
      event.stopPropagation();
      render();
      return;
    }

    if (event.target.closest("[data-delete-selected-wire]")) {
      event.preventDefault();
      event.stopPropagation();
      deleteSelectedWire();
      return;
    }
    const deleteWire = event.target.closest("[data-remove-wire]");
    if (deleteWire) {
      event.preventDefault();
      event.stopPropagation();
      if (selectedWireId === deleteWire.dataset.removeWire) deleteSelectedWire();
      else {
        const change = model.removeWire(deleteWire.dataset.removeWire);
        if (change) announceChange(change);
      }
      return;
    }
    const wireSelection = event.target.closest("[data-select-wire]");
    if (wireSelection) {
      selectedWireId = wireSelection.dataset.selectWire;
      selectedComponentId = null;
      fromSelect.value = "";
      wireEditSide = null;
      wireEditEndpoint = "";
      render();
      return;
    }
    if (event.target.closest("[data-start-wire-edit]")) {
      wireEditSide = wireEditor.querySelector("[data-wire-edit-side]").value;
      wireEditEndpoint = "";
      renderWireControls();
      status.textContent = `Selecciona un nuevo terminal para el extremo ${wireEditSide === "from" ? "de origen" : "de destino"}.`;
      return;
    }
    if (event.target.closest("[data-confirm-wire-edit]")) {
      applyWireEdit();
      return;
    }
    if (event.target.closest("[data-cancel-wire-edit]")) {
      cancelWireEdit();
      return;
    }

    const clickedComponent = event.target.closest(".circuit-component[data-component-id]");
    if (
      clickedComponent &&
      suppressedClick?.componentId === clickedComponent.dataset.componentId &&
      event.detail > 0 &&
      performance.now() <= suppressedClick.expiresAt
    ) {
      suppressedClick = null;
      event.preventDefault();
      return;
    }
    if (suppressedClick && performance.now() > suppressedClick.expiresAt) suppressedClick = null;

    const add = event.target.closest("[data-add-component]");
    if (add) {
      try {
        const result = model.addComponent(add.dataset.addComponent);
        selectedComponentId = result.component.id;
        announceChange(result);
      } catch (error) {
        status.textContent = error.message;
      }
      return;
    }
    if (event.target.closest("#circuit-load-demo")) {
      const result = model.loadDemo();
      selectedComponentId = "component-2";
      selectedWireId = null;
      wireEditSide = null;
      wireEditEndpoint = "";
      fromSelect.value = "";
      onLoadDemo();
      announceChange(result);
      return;
    }
    if (event.target.closest("#circuit-clear")) {
      selectedComponentId = null;
      selectedWireId = null;
      wireEditSide = null;
      wireEditEndpoint = "";
      fromSelect.value = "";
      announceChange(model.clear());
      return;
    }
    const terminal = event.target.closest("[data-terminal]");
    if (terminal) {
      if (selectedWireId && wireEditSide !== null) {
        wireEditEndpoint = terminal.dataset.terminal;
        renderWireControls();
        status.textContent = `Nuevo terminal seleccionado: ${endpointTitle(wireEditEndpoint)}. Confirma el cambio o cancélalo.`;
      } else if (!fromSelect.value) {
        fromSelect.value = terminal.dataset.terminal;
        status.textContent = `Terminal inicial: ${endpointTitle(fromSelect.value)}. Selecciona otro terminal para conectar.`;
        render();
      } else if (terminal.dataset.terminal === fromSelect.value) {
        fromSelect.value = "";
        status.textContent = "Selección de terminal cancelada.";
        render();
      } else {
        toSelect.value = terminal.dataset.terminal;
        addWire(fromSelect.value, toSelect.value);
      }
      return;
    }
    const select = event.target.closest("[data-select-component], .circuit-component[data-component-id]");
    if (select) {
      selectedComponentId = select.dataset.selectComponent ?? select.dataset.componentId;
      selectedWireId = null;
      wireEditSide = null;
      wireEditEndpoint = "";
      render();
      return;
    }
    const removeComponent = event.target.closest("[data-remove-component]");
    if (removeComponent) {
      const result = model.removeComponent(removeComponent.dataset.removeComponent);
      selectedComponentId = null;
      if (result) announceChange(result);
      return;
    }
    const toggle = event.target.closest('[data-property="pressed"], [data-property="detected"]');
    if (toggle && selectedComponentId) {
      const component = model.getComponents().find((item) => item.id === selectedComponentId);
      const property = toggle.dataset.property;
      const currentPressed = currentSimulationInputs &&
        Object.hasOwn(currentSimulationInputs, selectedComponentId)
        ? Boolean(currentSimulationInputs[selectedComponentId])
        : property === "detected" ? component.properties.detected : component.properties.pressed;
      const result = model.updateProperty(selectedComponentId, property, !currentPressed);
      announceChange(result);
      return;
    }
  });

  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (wireEditSide !== null) cancelWireEdit();
      else if (fromSelect.value) {
        fromSelect.value = "";
        status.textContent = "Selección de terminal cancelada.";
        render();
      } else if (selectedWireId) {
        selectedWireId = null;
        render();
      }
      return;
    }
    const activeElement = document.activeElement;
    const textEntryFocused = activeElement instanceof Element &&
      activeElement.matches("input, select, textarea, [contenteditable]");
    if (event.key === "Delete" || event.key === "Backspace") {
      if (textEntryFocused) return;
      if (selectedWireId) {
        event.preventDefault();
        deleteSelectedWire();
      } else if (selectedComponentId) {
        event.preventDefault();
        const change = model.removeComponent(selectedComponentId);
        selectedComponentId = null;
        if (change) announceChange(change);
        else render();
      }
      return;
    }

    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && !event.altKey && !textEntryFocused) {
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        runHistoryAction(event.shiftKey ? "redo" : "undo");
        return;
      }
      if (key === "y" && !event.shiftKey) {
        event.preventDefault();
        runHistoryAction("redo");
        return;
      }
    }
    const terminal = event.target.closest("[data-terminal]");
    if (terminal && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      terminal.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
    const wire = event.target.closest(".circuit-wire[data-wire-id]");
    if (wire && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      wire.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }
  });

  root.addEventListener("change", (event) => {
    if (event.target === boardSelect) {
      try {
        announceChange(model.setBoardProfile(boardSelect.value));
        status.textContent = `Perfil activo: ${model.getBoardProfile().name}.`;
      } catch (error) {
        boardSelect.value = model.getBoardProfile().id;
        status.textContent = error.message;
      }
      return;
    }
    if (event.target.matches("[data-wire-edit-side]")) {
      wireEditSide = event.target.value;
      wireEditEndpoint = "";
      renderWireControls();
      return;
    }
    if (event.target.matches("[data-wire-edit-endpoint]")) {
      wireEditEndpoint = event.target.value;
      renderWireControls();
      return;
    }
    const property = event.target.dataset.property;
    if (!property || !selectedComponentId) return;
    try {
      const value = ["value", "angle"].includes(property) ? Number(event.target.value) : event.target.value;
      announceChange(model.updateProperty(selectedComponentId, property, value));
    } catch (error) {
      status.textContent = error.message;
    }
  });

  root.addEventListener("input", (event) => {
    if (!selectedComponentId) return;
    if (event.target.dataset.property === "value") {
      const output = properties.querySelector(".circuit-analog-value");
      if (output) output.value = `${event.target.value}/1023`;
    } else if (event.target.dataset.property === "angle") {
      const output = properties.querySelector(".circuit-servo-angle");
      if (output) output.value = `${event.target.value}°`;
    }
  });

  wireForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addWire(fromSelect.value, toSelect.value);
    fromSelect.value = "";
    toSelect.value = "";
  });

  if (boardSelect) {
    boardSelect.replaceChildren();
    for (const profile of getBoardProfiles()) addOption(boardSelect, profile.id, profile.name);
  }

  render();
  return {
    render,
    getModel: () => model,
    setComponentPosition(id, position) {
      announceChange(model.setComponentPosition(id, position));
    },
    getSvgForExport() {
      const exported = canvas.cloneNode(true);
      const sourceElements = [canvas, ...canvas.querySelectorAll("*")];
      const exportElements = [exported, ...exported.querySelectorAll("*")];
      const propertiesToCopy = [
        "fill",
        "stroke",
        "stroke-width",
        "stroke-linecap",
        "stroke-linejoin",
        "stroke-dasharray",
        "opacity",
        "font-family",
        "font-size",
        "font-weight",
        "text-anchor",
      ];
      sourceElements.forEach((element, index) => {
        const computed = getComputedStyle(element);
        const declarations = propertiesToCopy
          .map((property) => {
            let value = computed.getPropertyValue(property);
            if (property === "font-weight" && /^\d+$/.test(value)) {
              value = Number(value) >= 600 ? "700" : "400";
            }
            return [property, value];
          })
          .filter(([, value]) => value && value !== "none" && value !== "normal");
        if (declarations.length) {
          exportElements[index].setAttribute(
            "style",
            declarations.map(([property, value]) => `${property}:${value}`).join(";"),
          );
        }
      });
      exported.querySelectorAll(".is-selected").forEach((element) => element.classList.remove("is-selected"));
      for (const board of exported.querySelectorAll(".circuit-breadboard")) {
        board.style.setProperty("fill", "#f7f1df");
        board.style.setProperty("stroke", "#d7cba8");
      }
      exported.querySelectorAll(".circuit-board-label, .circuit-pin-label, .circuit-component-label")
        .forEach((label) => label.style.setProperty("fill", "#566276"));
      return exported;
    },
    updateSimulation(state) {
      currentSimulationInputs = { ...state.circuitInputs };
      const ledStates = model.getLedStates(state.pins, state.circuitInputs);
      const rgbStates = model.getRgbLedStates(state.pins);
      for (const [componentId, ledState] of Object.entries(ledStates)) {
        const group = [...canvas.querySelectorAll("[data-component-id]")]
          .find((element) => element.dataset.componentId === componentId);
        if (group) {
          group.dataset.state = ledState.state;
          group.setAttribute(
            "aria-label",
            `${componentDescription(model.getComponents().find((item) => item.id === componentId))}; estado ${ledState.state}; ${ledState.pin ? `pin ${ledState.pin}` : "sin salida válida"}. Seleccionar componente.`,
          );
        }
      }
      for (const [componentId, rgb] of Object.entries(rgbStates)) {
        const group = [...canvas.querySelectorAll("[data-component-id]")].find((element) => element.dataset.componentId === componentId);
        const bulb = group?.querySelector(".circuit-rgb-led");
        if (bulb) bulb.setAttribute("fill", `rgb(${rgb.red}, ${rgb.green}, ${rgb.blue})`);
        if (group) group.dataset.state = rgb.active ? "on" : "off";
      }
      for (const component of model.getComponents()) {
        if (!(["button", "potentiometer", "photoresistor", "servo", "irSensor"].includes(component.type))) continue;
        const group = [...canvas.querySelectorAll("[data-component-id]")]
          .find((element) => element.dataset.componentId === component.id);
        if (component.type === "servo") {
          const angle = Number(state.servoAngles?.[component.id] ?? state.circuitInputs[component.id] ?? component.properties.angle);
          if (group) {
            group.dataset.angle = String(angle);
            group.setAttribute("aria-label", `Servomotor ${angle}°. Seleccionar componente.`);
            const position = model.getComponentPosition(component.id);
            const horn = group.querySelector("[data-servo-horn]");
            if (horn && position) horn.setAttribute("transform", `rotate(${angle - 90} ${position.x} ${position.y})`);
          }
          if (component.id === selectedComponentId) {
            const range = properties.querySelector('[data-property="angle"]');
            const output = properties.querySelector(".circuit-servo-angle");
            if (range) range.value = String(angle);
            if (output) output.value = `${angle}°`;
          }
          continue;
        }
        const input = state.circuitInputs[component.id];
        if (group && component.type === "button" && typeof input === "boolean") {
          group.dataset.state = input ? "pressed" : "released";
          group.setAttribute(
            "aria-label",
            `Pulsador ${input ? "presionado" : "liberado"}. Seleccionar componente.`,
          );
        }
        if (group && component.type === "irSensor" && typeof input === "boolean") {
          group.dataset.state = input ? "detected" : "clear";
          group.setAttribute("aria-label", `Sensor infrarrojo ${input ? "detecta" : "sin detección"}. Seleccionar componente.`);
        }
        if (component.id !== selectedComponentId) continue;
        if (component.type === "button" && typeof input === "boolean") {
          const toggle = properties.querySelector('[data-property="pressed"]');
          if (toggle) {
            toggle.setAttribute("aria-pressed", String(input));
            toggle.textContent = input ? "Liberar pulsador" : "Presionar pulsador";
          }
        } else if (component.type === "irSensor" && typeof input === "boolean") {
          const toggle = properties.querySelector('[data-property="detected"]');
          if (toggle) {
            toggle.setAttribute("aria-pressed", String(input));
            toggle.textContent = input ? "Simular sin detección" : "Simular detección";
          }
        } else if ((component.type === "potentiometer" || component.type === "photoresistor") && Number.isInteger(input)) {
          const range = properties.querySelector('[data-property="value"]');
          const output = properties.querySelector(".circuit-analog-value");
          const knob = group?.querySelector("[data-pot-knob]");
          if (range) range.value = String(input);
          if (output) output.value = `${input}/1023`;
          if (component.type === "photoresistor" && group) {
            group.dataset.value = String(input);
            group.setAttribute("aria-label", `Sensor de luz · lectura ${input}/1023. Seleccionar componente.`);
          }
          const position = model.getComponentPosition(component.id);
          if (knob && position) knob.setAttribute("cx", String(position.x - 26 + (input / 1023) * 52));
        }
      }
    },
    selectComponent(id) {
      selectedComponentId = id;
      render();
    },
  };
}
