import { guidedExamples } from "../examples/guided-examples.js";

export function initializeEditorControls({ editor, elements, setStatus }) {
  let fileName = "arduino-flowchart.ino";

  const exampleSelect = elements.exampleSelect;
  const exampleGuidance = elements.exampleGuidance;
  if (exampleSelect) {
    exampleSelect.replaceChildren(...guidedExamples.map(({ id, title }) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = title;
      return option;
    }));
    exampleSelect.value = guidedExamples[0].id;
  }
  function updateExampleGuidance() {
    const example = guidedExamples.find(({ id }) => id === exampleSelect?.value) ?? guidedExamples[0];
    if (exampleGuidance) {
      exampleGuidance.textContent = `${example.description} ${example.wiring} ${example.observe}`;
    }
  }
  exampleSelect?.addEventListener("change", updateExampleGuidance);
  updateExampleGuidance();

  elements.paste.addEventListener("click", async () => {
    if (!navigator.clipboard?.readText) {
      setStatus("El navegador no permite acceder al portapapeles. Pega el código con Ctrl+V o ⌘V.", "warning");
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      editor.setValue(text);
      setStatus(text ? "Código pegado desde el portapapeles." : "El portapapeles está vacío.", text ? "success" : "warning");
    } catch (error) {
      setStatus(`No se pudo leer el portapapeles: ${error.message}`, "error");
    }
  });

  elements.loadExample.addEventListener("click", () => {
    const example = guidedExamples.find(({ id }) => id === exampleSelect?.value) ?? guidedExamples[0];
    editor.setValue(example.code);
    fileName = `${example.id}.ino`;
    setStatus(`Ejemplo «${example.title}» cargado. ${example.observe}`);
  });

  elements.clear.addEventListener("click", () => {
    editor.setValue("");
    setStatus("Editor limpio.");
  });

  elements.fileInput.addEventListener("change", async (event) => {
    const input = event.currentTarget;
    const [file] = input.files ?? [];
    if (!file) return;

    try {
      const content = await file.text();
      editor.setValue(content);
      fileName = file.name;
      setStatus(`Archivo "${file.name}" cargado correctamente.`);
    } catch (error) {
      setStatus(`No se pudo abrir el archivo: ${error.message}`, "error");
    } finally {
      input.value = "";
    }
  });

  function openCode() {
    elements.fileInput.click();
  }

  function saveCode() {
    const content = editor.getValue();
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus(`Código descargado como "${fileName}".`);
  }

  function newProject() {
    if (editor.getValue().trim() && !window.confirm("¿Crear un proyecto nuevo y descartar el código actual?")) {
      return;
    }
    fileName = "arduino-flowchart.ino";
    editor.setValue("");
    setStatus("Proyecto nuevo creado.");
  }

  return { openCode, saveCode, newProject };
}
