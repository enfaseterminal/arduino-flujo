import { blinkExample } from "./arduino-examples.js";

export const guidedExamples = Object.freeze([
  Object.freeze({
    id: "blink",
    title: "Parpadeo de LED",
    description: "Salida básica sin entrada: observa cómo alternan HIGH y LOW en el pin 13.",
    code: blinkExample,
    wiring: "LED y resistencia en D13 y GND.",
    observe: "El diagrama muestra las escrituras; el simulador registra los estados y las esperas como eventos educativos.",
  }),
  Object.freeze({
    id: "button-led",
    title: "Pulsador y LED",
    description: "Lee D2 y enciende el LED de D13 cuando se pulsa el botón.",
    code: `// Entrada: pulsador entre D2 y GND (INPUT_PULLUP)
// Salida: LED con resistencia entre D13 y GND
const int buttonPin = 2;
const int ledPin = 13;

void setup() {
  pinMode(buttonPin, INPUT_PULLUP);
  pinMode(ledPin, OUTPUT);
}

void loop() {
  if (digitalRead(buttonPin) == LOW) {
    digitalWrite(ledPin, HIGH);
  } else {
    digitalWrite(ledPin, LOW);
  }
}`,
    wiring: "Conecta el pulsador entre D2 y GND; el LED con resistencia entre D13 y GND.",
    observe: "En el código, LOW significa pulsado; el diagrama muestra la condición y sus dos ramas. En el laboratorio virtual, cambia el pulsador y avanza el simulador para ver la lectura y el estado del LED.",
  }),
  Object.freeze({
    id: "pot-threshold",
    title: "Potenciómetro y umbral",
    description: "Compara analogRead(A0) con un umbral y controla un LED.",
    code: `// Entrada: cursor del potenciómetro a A0
// Salida: LED con resistencia en D13
const int sensorPin = A0;
const int ledPin = 13;

void setup() {
  pinMode(ledPin, OUTPUT);
}

void loop() {
  int value = analogRead(sensorPin);
  if (value > 512) {
    digitalWrite(ledPin, HIGH);
  } else {
    digitalWrite(ledPin, LOW);
  }
}`,
    wiring: "Conecta los extremos del potenciómetro a 5V y GND, el cursor a A0 y el LED con resistencia a D13 y GND.",
    observe: "El diagrama separa lectura, condición y salida. Ajusta el valor virtual por encima o debajo de 512 y observa el LED.",
  }),
  Object.freeze({
    id: "ir-led",
    title: "Sensor digital y LED",
    description: "Usa la detección digital del sensor infrarrojo como condición para encender un LED.",
    code: `// Entrada: salida OUT del sensor infrarrojo en D2
// Salida: LED con resistencia en D13
const int sensorPin = 2;
const int ledPin = 13;

void setup() {
  pinMode(sensorPin, INPUT);
  pinMode(ledPin, OUTPUT);
}

void loop() {
  if (digitalRead(sensorPin) == HIGH) {
    digitalWrite(ledPin, HIGH);
  } else {
    digitalWrite(ledPin, LOW);
  }
}`,
    wiring: "Conecta VCC y GND del sensor infrarrojo a 5V y GND, OUT a D2 y el LED con resistencia a D13 y GND.",
    observe: "Activa o desactiva la detección del sensor virtual, avanza el simulador y sigue la rama HIGH/LOW hasta la salida del LED.",
  }),
]);
