const RESISTOR_VALUES = Object.freeze([220, 330, 470, 1000, 2200, 4700, 10000]);

function terminal(id, anchor) {
  return Object.freeze({ id, anchor });
}

function defineComponent(defaultProperties, validateProperties, terminals) {
  return Object.freeze({
    defaultProperties: Object.freeze(defaultProperties),
    validateProperties,
    terminals: Object.freeze(terminals),
  });
}

const COMPONENTS = Object.freeze({
  led: defineComponent(
    { color: "rojo" },
    (properties) => ["rojo", "verde", "amarillo", "azul"].includes(properties.color),
    [terminal("anode", "left"), terminal("cathode", "right")],
  ),
  rgbLed: defineComponent(
    {},
    (properties) => Object.keys(properties).length === 0,
    [terminal("red", "left"), terminal("green", "top"), terminal("blue", "right"), terminal("cathode", "bottom")],
  ),
  resistor: defineComponent(
    { ohms: 220, tolerance: 5, bandCount: 4 },
    (properties) =>
      RESISTOR_VALUES.includes(Number(properties.ohms)) &&
      [3, 4, 5].includes(Number(properties.bandCount)) &&
      [1, 2, 5, 10].includes(Number(properties.tolerance)),
    [terminal("lead1", "left"), terminal("lead2", "right")],
  ),
  button: defineComponent(
    { pressed: false },
    (properties) => typeof properties.pressed === "boolean",
    [terminal("contact1", "left"), terminal("contact2", "right")],
  ),
  potentiometer: defineComponent(
    { value: 512 },
    (properties) =>
      Number.isInteger(properties.value) && properties.value >= 0 && properties.value <= 1023,
    [
      terminal("end1", "left"),
      terminal("wiper", "top"),
      terminal("end2", "right"),
    ],
  ),
  photoresistor: defineComponent(
    { value: 512 },
    (properties) => Number.isInteger(properties.value) && properties.value >= 0 && properties.value <= 1023,
    [terminal("vcc", "top"), terminal("signal", "left"), terminal("gnd", "bottom")],
  ),
  servo: defineComponent(
    { angle: 90 },
    (properties) => Number.isInteger(properties.angle) && properties.angle >= 0 && properties.angle <= 180,
    [terminal("vcc", "top"), terminal("signal", "left"), terminal("gnd", "bottom")],
  ),
  irSensor: defineComponent(
    { detected: false },
    (properties) => typeof properties.detected === "boolean",
    [terminal("vcc", "top"), terminal("signal", "left"), terminal("gnd", "bottom")],
  ),
});

function componentDefinition(type) {
  return Object.hasOwn(COMPONENTS, type) ? COMPONENTS[type] : null;
}

const ARDUINO_TERMINALS = Object.freeze([
  Object.freeze({ id: "D0", kind: "digital", number: 0, serial: "RX" }),
  Object.freeze({ id: "D1", kind: "digital", number: 1, serial: "TX" }),
  ...Array.from({ length: 12 }, (_unused, index) => Object.freeze({
    id: `D${index + 2}`,
    kind: "digital",
    number: index + 2,
  })),
  ...Array.from({ length: 6 }, (_unused, index) => Object.freeze({
    id: `A${index}`,
    kind: "analog",
    number: index,
  })),
  Object.freeze({ id: "5V", kind: "rail" }),
  Object.freeze({ id: "GND", kind: "rail" }),
]);
const ARDUINO_TERMINAL_IDS = new Set(ARDUINO_TERMINALS.map(({ id }) => id));

export function isComponentType(type) {
  return Object.hasOwn(COMPONENTS, type);
}

export function getComponentTerminals(type) {
  return componentDefinition(type)?.terminals.map((item) => ({ ...item })) ?? [];
}

export function createDefaultComponentProperties(type) {
  const definition = componentDefinition(type);
  if (!definition) throw new TypeError("Tipo de componente desconocido.");
  return { ...definition.defaultProperties };
}

export function hasValidComponentProperties(type, properties) {
  return componentDefinition(type)?.validateProperties(properties) ?? false;
}

export function isArduinoTerminal(id) {
  return ARDUINO_TERMINAL_IDS.has(id);
}

export function getArduinoTerminals() {
  return ARDUINO_TERMINALS.map((item) => ({ ...item }));
}

export const resistorValues = [...RESISTOR_VALUES];
