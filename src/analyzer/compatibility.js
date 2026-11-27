import { ARDUINO_FUNCTIONS } from "../parser/parser.js";
import { arduinoCompletions } from "../editor/arduino-completions.js";

const SIMULATED_READS = new Set(["digitalRead", "analogRead"]);
const EVENT_CALLS = new Set([
  "pinMode", "digitalWrite", "analogWrite", "delay", "Serial.begin", "Serial.print", "Serial.println",
]);
const UNIMPLEMENTED = new Set([
  "delayMicroseconds", "millis", "micros", "Serial.available", "Serial.read", "map", "constrain", "tone", "noTone",
]);
const INPUT_DIAGRAM_CALLS = new Set(["digitalRead", "analogRead", "millis", "micros"]);

function simulationStatus(name) {
  if (SIMULATED_READS.has(name)) return "Simulada; puede pedir una entrada o leer el montaje virtual.";
  if (EVENT_CALLS.has(name)) return "Aproximación educativa: registra cambios/eventos; no controla hardware.";
  if (name === "Servo.attach" || name === "Servo.write") return "Aproximación educativa: actualiza el servo virtual; devuelve valor desconocido.";
  if (UNIMPLEMENTED.has(name)) return "No implementada: el valor queda desconocido y la simulación no ejecuta la llamada.";
  return "No implementada: la llamada queda como valor desconocido.";
}

const names = new Set([...arduinoCompletions.map(({ label }) => label), ...ARDUINO_FUNCTIONS]);

/** Resumen compartido por la guía visible de análisis, diagrama y simulación. */
export const compatibilityMatrix = Object.freeze([...names].map((name) => Object.freeze({
  name,
  recognized: ARDUINO_FUNCTIONS.has(name) ? "Sí, como llamada Arduino" : "Sí, como llamada genérica",
  diagram: INPUT_DIAGRAM_CALLS.has(name)
    ? "Sí, bloque de entrada (sin expandir su implementación)"
    : "Sí, bloque de llamada (sin expandir su implementación)",
  simulation: simulationStatus(name),
})));
