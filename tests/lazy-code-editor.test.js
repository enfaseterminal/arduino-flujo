// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLazyCodeEditor } from "../src/editor/lazy-code-editor.js";

const editors = [];
const hosts = [];

function createHost() {
  const host = document.createElement("div");
  host.className = "editor-frame";
  document.body.append(host);
  hosts.push(host);
  return host;
}

function makeEditorModule() {
  const createCodeEditor = vi.fn((parent, initialValue, onChange, onLineCount, onSelectionChange) => {
    const view = document.createElement("div");
    view.className = "cm-editor";
    parent.append(view);
    let value = initialValue;
    const mounted = {
      getValue: () => value,
      setValue(nextValue) {
        value = nextValue;
        onChange(value);
        onLineCount(value.split("\n").length);
      },
      setSelection: vi.fn(),
      focus: vi.fn(),
      scrollToLine: vi.fn(),
      clearHighlight: vi.fn(),
      getSelection: () => ({ anchor: 0, head: 0, from: 0, to: 0, empty: true }),
      destroy: vi.fn(() => view.remove()),
    };
    editors.push(mounted);
    return mounted;
  });
  return { createCodeEditor };
}

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  for (const host of hosts.splice(0)) host.remove();
});

describe("lazy CodeMirror editor", () => {
  it("starts with an accessible textarea and does not load CodeMirror", () => {
    const host = createHost();
    const loadCodeEditor = vi.fn(async () => makeEditorModule());
    const onLineCount = vi.fn();
    const editor = createLazyCodeEditor(host, "void setup() {\n}", undefined, onLineCount, undefined, {
      loadCodeEditor,
    });

    expect(host.querySelector("textarea").getAttribute("aria-label")).toBe("Código fuente Arduino");
    expect(host.querySelector(".cm-editor")).toBeNull();
    expect(loadCodeEditor).not.toHaveBeenCalled();
    expect(editor.getValue()).toBe("void setup() {\n}");
    expect(onLineCount).toHaveBeenCalledWith(2);
    editor.destroy();
  });

  it("loads once on focus and transfers the latest text, backward selection, and focus", async () => {
    const host = createHost();
    const module = makeEditorModule();
    let resolveModule;
    const loadCodeEditor = vi.fn(() => new Promise((resolve) => { resolveModule = resolve; }));
    const onChange = vi.fn();
    const editor = createLazyCodeEditor(host, "initial", onChange, () => {}, () => {}, { loadCodeEditor });
    const textarea = host.querySelector("textarea");

    textarea.focus();
    textarea.value = "void setup() {\n  digitalWrite(13, HIGH);\n}";
    textarea.setSelectionRange(8, 15, "backward");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("paste", { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }));
    await Promise.resolve();
    expect(loadCodeEditor).toHaveBeenCalledOnce();
    expect(editor.getValue()).toBe(textarea.value);

    resolveModule(module);
    await editor.whenReady();

    expect(module.createCodeEditor).toHaveBeenCalledOnce();
    expect(module.createCodeEditor.mock.calls[0][1]).toBe(textarea.value);
    expect(editors.at(-1).setSelection).toHaveBeenCalledWith(15, 8);
    expect(editors.at(-1).focus).toHaveBeenCalledOnce();
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.querySelector(".cm-editor")).not.toBeNull();
    expect(editor.getValue()).toBe(textarea.value);
    expect(onChange).toHaveBeenCalledWith(textarea.value);
  });

  it("keeps programmatic values available before CodeMirror finishes loading", async () => {
    const host = createHost();
    let resolveModule;
    const module = makeEditorModule();
    const editor = createLazyCodeEditor(host, "before", () => {}, () => {}, () => {}, {
      loadCodeEditor: () => new Promise((resolve) => { resolveModule = resolve; }),
    });

    editor.setValue("loaded example");
    expect(editor.getValue()).toBe("loaded example");
    expect(host.querySelector("textarea").value).toBe("loaded example");
    await Promise.resolve();
    resolveModule(module);
    await editor.whenReady();
    expect(editor.getValue()).toBe("loaded example");
    expect(module.createCodeEditor.mock.calls[0][1]).toBe("loaded example");
  });

  it("retains an editable textarea and its text when the dynamic import fails", async () => {
    const host = createHost();
    const loadError = new Error("chunk unavailable");
    const onLoadError = vi.fn();
    const editor = createLazyCodeEditor(host, "initial", () => {}, () => {}, () => {}, {
      loadCodeEditor: () => Promise.reject(loadError),
      onLoadError,
    });
    const textarea = host.querySelector("textarea");
    textarea.value = "user text survives";
    textarea.focus();

    await expect(editor.whenReady()).rejects.toBe(loadError);
    expect(host.querySelector("textarea")).toBe(textarea);
    expect(textarea.value).toBe("user text survives");
    expect(editor.getValue()).toBe("user text survives");
    expect(onLoadError).toHaveBeenCalledWith(loadError);
  });
});
