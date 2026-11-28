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

const BOARD_PROFILES = Object.freeze({
  uno: Object.freeze({
    id: "uno",
    name: "Arduino Uno",
    model: "Uno R3 · ATmega328P",
    voltage: "5 V",
    digitalPins: Object.freeze(Array.from({ length: 14 }, (_unused, index) => `D${index}`)),
    analogPins: Object.freeze(Array.from({ length: 6 }, (_unused, index) => `A${index}`)),
    analogOnlyPins: Object.freeze([]),
    pwmPins: Object.freeze(["D3", "D5", "D6", "D9", "D10", "D11"]),
    serialPins: Object.freeze({ D0: "RX", D1: "TX" }),
    notes: Object.freeze([
      "14 pines digitales (D0–D13), 6 entradas analógicas (A0–A5) y PWM en D3, D5, D6, D9, D10 y D11.",
      "D0 (RX) y D1 (TX) comparten la serie hardware con USB; conectarlos puede interferir con Serial y con la carga del programa.",
      "En este modelo didáctico A0–A5 se ofrecen como entradas analogRead; no se modelan como alias digitales D14–D19.",
      "La vista del laboratorio es un pinout funcional, no una reproducción de la distribución física de la placa.",
    ]),
  }),
  nano: Object.freeze({
    id: "nano",
    name: "Arduino Nano",
    model: "Nano clásico · ATmega328P",
    voltage: "5 V",
    digitalPins: Object.freeze(Array.from({ length: 14 }, (_unused, index) => `D${index}`)),
    analogPins: Object.freeze(Array.from({ length: 8 }, (_unused, index) => `A${index}`)),
    analogOnlyPins: Object.freeze(["A6", "A7"]),
    pwmPins: Object.freeze(["D3", "D5", "D6", "D9", "D10", "D11"]),
    serialPins: Object.freeze({ D0: "RX", D1: "TX" }),
    notes: Object.freeze([
      "14 pines digitales (D0–D13), 8 entradas analógicas (A0–A7) y PWM en D3, D5, D6, D9, D10 y D11.",
      "A6 y A7 son entradas analógicas solamente; no se aceptan como salidas digitales ni PWM.",
      "D0 (RX) y D1 (TX) comparten la serie hardware; conectarlos puede interferir con la comunicación y con la carga del programa.",
      "Este perfil representa el Nano clásico con ATmega328P; otras variantes de Nano pueden tener capacidades distintas.",
      "La vista del laboratorio es un pinout funcional, no una reproducción de la distribución física de la placa.",
    ]),
  }),
});

function boardProfile(profileId = "uno") {
  return Object.hasOwn(BOARD_PROFILES, profileId) ? BOARD_PROFILES[profileId] : null;
}

function arduinoTerminals(profileId = "uno") {
  const profile = boardProfile(profileId);
  if (!profile) return [];
  return [
    ...profile.digitalPins.map((id) => ({
      id,
      kind: "digital",
      number: Number(id.slice(1)),
      serial: profile.serialPins[id] ?? null,
      pwm: profile.pwmPins.includes(id),
      capabilities: ["digitalRead", "digitalWrite", ...(profile.pwmPins.includes(id) ? ["analogWrite"] : [])],
    })),
    ...profile.analogPins.map((id) => ({
      id,
      kind: "analog",
      number: Number(id.slice(1)),
      analogOnly: profile.analogOnlyPins.includes(id),
      capabilities: ["analogRead"],
    })),
    { id: "5V", kind: "rail", capabilities: ["power"] },
    { id: "GND", kind: "rail", capabilities: ["ground"] },
  ];
}

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

export function getBoardProfiles() {
  return Object.values(BOARD_PROFILES).map((profile) => structuredClone(profile));
}

export function getBoardProfile(profileId = "uno") {
  const profile = boardProfile(profileId);
  return profile ? structuredClone(profile) : null;
}

export function isArduinoTerminal(id, profileId = "uno") {
  return arduinoTerminals(profileId).some((item) => item.id === id);
}

export function getArduinoTerminals(profileId = "uno") {
  return arduinoTerminals(profileId).map((item) => ({ ...item, capabilities: [...item.capabilities] }));
}

export function hasBoardPinCapability(pin, capability, profileId = "uno") {
  return arduinoTerminals(profileId).some((item) => item.id === pin && item.capabilities.includes(capability));
}

export const resistorValues = [...RESISTOR_VALUES];
