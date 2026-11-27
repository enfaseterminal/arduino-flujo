import { validateCircuitProjectState } from "../lab/circuit-model.js";

export const PROJECT_FORMAT = "arduino-flowchart-project";
export const PROJECT_VERSION = 1;
export const PROJECT_MAX_JSON_LENGTH = 2_000_000;
const PROJECT_KEYS = ["format", "version", "metadata", "sketch", "circuit", "visualLabels"];

function record(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function exactKeys(value, keys) {
  return record(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function fail(message) {
  throw new TypeError(message);
}

export function createProjectDocument({ sketch, circuit, visualLabels, name = "Proyecto educativo", appVersion = "" }) {
  const document = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    metadata: { name, exportedAt: new Date().toISOString(), appVersion },
    sketch: { code: sketch },
    circuit,
    visualLabels: { version: 1, labels: visualLabels },
  };
  return validateProjectDocument(document);
}

export function validateProjectDocument(value) {
  if (!record(value)) fail("El archivo de proyecto debe contener un objeto JSON.");
  if (value.format !== PROJECT_FORMAT) fail("El formato del archivo no es un proyecto de Arduino Flowchart.");
  if (value.version !== PROJECT_VERSION) fail(`Versión de proyecto no compatible: ${String(value.version)}. Se admite la versión ${PROJECT_VERSION}.`);
  if (!exactKeys(value, PROJECT_KEYS)) fail("El proyecto contiene campos ausentes o no admitidos.");
  if (!exactKeys(value.metadata, ["name", "exportedAt", "appVersion"]) ||
      typeof value.metadata.name !== "string" || !value.metadata.name.trim() || value.metadata.name.length > 120 ||
      typeof value.metadata.exportedAt !== "string" || !Number.isFinite(Date.parse(value.metadata.exportedAt)) ||
      typeof value.metadata.appVersion !== "string" || value.metadata.appVersion.length > 32) {
    fail("Los metadatos del proyecto no cumplen el esquema esperado.");
  }
  if (!exactKeys(value.sketch, ["code"]) || typeof value.sketch.code !== "string" || value.sketch.code.length > 1_000_000) {
    fail("El sketch debe ser texto y no superar 1 MB.");
  }
  let circuit;
  try {
    circuit = validateCircuitProjectState(value.circuit);
  } catch {
    fail("El montaje virtual contiene datos o conexiones no válidos.");
  }
  if (!exactKeys(value.visualLabels, ["version", "labels"]) || value.visualLabels.version !== 1 ||
      !record(value.visualLabels.labels) || Object.entries(value.visualLabels.labels).some(([id, label]) =>
        !id || id.length > 200 || typeof label !== "string" || !label.trim() || label.trim().length > 160
      )) {
    fail("Las etiquetas visuales no cumplen el esquema de la versión 1.");
  }
  return structuredClone({ ...value, circuit, visualLabels: { version: 1, labels: value.visualLabels.labels } });
}

export function parseProjectJson(jsonText) {
  if (typeof jsonText !== "string" || jsonText.length > PROJECT_MAX_JSON_LENGTH) {
    fail("El archivo del proyecto está vacío o supera el tamaño máximo de 2 MB.");
  }
  let value;
  try {
    value = JSON.parse(jsonText);
  } catch {
    fail("El archivo no contiene JSON válido.");
  }
  return validateProjectDocument(value);
}

/** Validate completely before applying any part of the imported project. */
export function restoreProjectDocument(value, { editor, circuitModel, visualLabelStore }) {
  const project = validateProjectDocument(value);
  if (!editor || typeof editor.setValue !== "function" ||
      !circuitModel || typeof circuitModel.replaceState !== "function" ||
      !visualLabelStore || typeof visualLabelStore.replaceProjectLabels !== "function") {
    throw new TypeError("No se puede restaurar el proyecto: faltan interfaces de aplicación compatibles.");
  }
  visualLabelStore.replaceProjectLabels(project.sketch.code, project.visualLabels.labels);
  circuitModel.replaceState(project.circuit);
  editor.setValue(project.sketch.code);
  return project;
}

export function serializeProjectDocument(document) {
  return `${JSON.stringify(validateProjectDocument(document), null, 2)}\n`;
}
