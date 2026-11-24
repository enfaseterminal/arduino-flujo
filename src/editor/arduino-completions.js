/** Catálogo independiente del editor para sugerencias de Arduino y C++. */
export const arduinoCompletions = Object.freeze([
  completion("pinMode", "io", "Configura un pin como INPUT, OUTPUT o INPUT_PULLUP.", "pinMode(pin, OUTPUT);"),
  completion("digitalWrite", "io", "Escribe HIGH o LOW en un pin digital.", "digitalWrite(pin, HIGH);"),
  completion("digitalRead", "io", "Lee el estado HIGH o LOW de un pin digital.", "digitalRead(pin)"),
  completion("analogRead", "io", "Lee el valor analógico de un pin (normalmente 0–1023).", "analogRead(pin)"),
  completion("analogWrite", "io", "Genera una salida PWM con valor entre 0 y 255.", "analogWrite(pin, value);"),
  completion("delay", "timing", "Detiene el programa durante milisegundos.", "delay(ms);"),
  completion("delayMicroseconds", "timing", "Detiene el programa durante microsegundos.", "delayMicroseconds(us);"),
  completion("millis", "timing", "Milisegundos transcurridos desde el inicio del programa.", "millis()"),
  completion("micros", "timing", "Microsegundos transcurridos desde el inicio del programa.", "micros()"),
  completion("Serial.begin", "serial", "Inicia la comunicación serie con la velocidad indicada.", "Serial.begin(9600);"),
  completion("Serial.print", "serial", "Envía un valor por serie sin salto de línea.", "Serial.print(value);"),
  completion("Serial.println", "serial", "Envía un valor por serie y termina la línea.", "Serial.println(value);"),
  completion("Serial.available", "serial", "Indica cuántos bytes esperan ser leídos por serie.", "Serial.available()"),
  completion("Serial.read", "serial", "Lee el siguiente byte recibido por serie.", "Serial.read()"),
  completion("map", "math", "Convierte un valor de un rango a otro.", "map(value, fromLow, fromHigh, toLow, toHigh)"),
  completion("constrain", "math", "Limita un valor entre un mínimo y un máximo.", "constrain(value, minValue, maxValue)"),
  completion("tone", "math", "Genera un tono de frecuencia dada en un pin.", "tone(pin, frequency);"),
  completion("noTone", "math", "Detiene el tono generado en un pin.", "noTone(pin);")
]);

export const arduinoSnippets = Object.freeze([
  snippet("if", "control", "Condición con una rama verdadera.", "if (condition) {\n  \n}", 13),
  snippet("if / else", "control", "Condición con ramas verdadera y falsa.", "if (condition) {\n  \n} else {\n  \n}", 13),
  snippet("else if", "control", "Añade una condición alternativa.", "else if (condition) {\n  \n}", 15),
  snippet("switch / case", "control", "Selecciona una rama según el valor de una expresión.", "switch (value) {\n  case 0:\n    \n    break;\n  default:\n    break;\n}", 34),
  snippet("for", "loop", "Repite un bloque con contador.", "for (int i = 0; i < count; i++) {\n  \n}", 39),
  snippet("while", "loop", "Repite un bloque mientras la condición sea verdadera.", "while (condition) {\n  \n}", 17),
  snippet("do ... while", "loop", "Ejecuta el bloque al menos una vez y repite según la condición.", "do {\n  \n} while (condition);", 8),
  snippet("setup / loop", "structure", "Esqueleto principal de un sketch Arduino.", "void setup() {\n  \n}\n\nvoid loop() {\n  \n}", 19)
]);

function completion(label, category, detail, insertText) {
  return Object.freeze({ label, kind: "function", category, detail, insertText, cursor: insertText.indexOf(")") + 1 });
}

function snippet(label, category, detail, insertText, cursor) {
  return Object.freeze({ label, kind: "snippet", category, detail, insertText, cursor });
}

export function getCompletions(query = "", options = {}) {
  const { category, kind } = options;
  const needle = String(query).trim().toLocaleLowerCase();
  return [...arduinoCompletions, ...arduinoSnippets].filter((item) =>
    (!category || item.category === category) && (!kind || item.kind === kind) &&
    (!needle || item.label.toLocaleLowerCase().includes(needle) || item.detail.toLocaleLowerCase().includes(needle))
  );
}

/** Inserta una sugerencia/snippet; from/to son offsets UTF-16 como los del editor. */
export function applyCompletion(text, entry, from = text.length, to = from) {
  const source = String(text);
  const start = clamp(from, 0, source.length);
  const end = clamp(to, start, source.length);
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  const indent = source.slice(lineStart, start).match(/^[ \t]*/)?.[0] ?? "";
  const raw = String(entry.insertText ?? "");
  const inserted = raw.replace(/\n/g, `\n${indent}`);
  const result = source.slice(0, start) + inserted + source.slice(end);
  const relativeCursor = Number.isInteger(entry.cursor) ? clamp(entry.cursor, 0, raw.length) : raw.length;
  const cursor = start + raw.slice(0, relativeCursor).replace(/\n/g, `\n${indent}`).length;
  return { text: result, cursor, selection: { anchor: cursor, head: cursor, from: cursor, to: cursor, empty: true } };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(Number.isFinite(value) ? value : min, max));
}
