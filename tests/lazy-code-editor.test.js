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
    let selection = { anchor: 0, head: 0, from: 0, to: 0, empty: true };
    const mounted = {
      getValue: () => value,
      setValue(nextValue) {
        value = nextValue;
        onChange(value);
        onLineCount(value.split("\n").length);
      },
      setSelection: vi.fn((anchor, head = anchor) => {
        selection = { anchor, head, from: Math.min(anchor, head), to: Math.max(anchor, head), empty: anchor === head };
      }),
      focus: vi.fn(),
      scrollToLine: vi.fn(),
      clearHighlight: vi.fn(),
      getSelection: () => selection,
      insertCompletion: vi.fn((label) => {
        const insertion = label === "setup / loop" ? "void setup() {\n  \n}\n\nvoid loop() {\n  \n}" : "digitalWrite(pin, HIGH);";
        value = value.slice(0, selection.from) + insertion + value.slice(selection.to);
        selection = { anchor: selection.from + insertion.length, head: selection.from + insertion.length, from: selection.from + insertion.length, to: selection.from + insertion.length, empty: true };
        onChange(value);
        onLineCount(value.split("\n").length);
        return true;
      }),
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

  it("selects and scrolls to a line in the textarea without loading CodeMirror", () => {
    const host = createHost();
    const loadCodeEditor = vi.fn(async () => makeEditorModule());
    const editor = createLazyCodeEditor(host, "one\ntwo\nthree", () => {}, () => {}, () => {}, { loadCodeEditor });
    const textarea = host.querySelector("textarea");

    expect(editor.selectLine(2)).toBe(4);
    expect(textarea.selectionStart).toBe(4);
    expect(textarea.selectionEnd).toBe(4);
    expect(loadCodeEditor).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("applies an early completion after loading against the latest textarea text and selection", async () => {
    const host = createHost();
    const module = makeEditorModule();
    let resolveModule;
    const loadCodeEditor = vi.fn(() => new Promise((resolve) => { resolveModule = resolve; }));
    const onChange = vi.fn();
    const editor = createLazyCodeEditor(host, "inicio", onChange, () => {}, () => {}, { loadCodeEditor });
    const textarea = host.querySelector("textarea");
    textarea.focus();
    await Promise.resolve();
    textarea.value = "// previo\n    viejo()";
    textarea.setSelectionRange(14, 21, "backward");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    const insertion = editor.insertCompletion("digitalWrite");
    expect(loadCodeEditor).toHaveBeenCalledOnce();
    resolveModule(module);

    await expect(insertion).resolves.toBe(true);
    expect(module.createCodeEditor.mock.calls[0][1]).toBe("// previo\n    viejo()");
    expect(editors.at(-1).setSelection).toHaveBeenCalledWith(21, 14);
    expect(editors.at(-1).insertCompletion).toHaveBeenCalledWith("digitalWrite");
    expect(editor.getValue()).toBe("// previo\n    digitalWrite(pin, HIGH);");
    expect(editors.at(-1).focus).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("transfers textarea selection to real CodeMirror and keeps completion and shortcuts usable", async () => {
    const host = createHost();
    const onChange = vi.fn();
    const editor = createLazyCodeEditor(host, "", onChange);
    const textarea = host.querySelector("textarea");
    Range.prototype.getClientRects ??= () => [];
    Range.prototype.getBoundingClientRect ??= () => ({ x: 0, y: 0, top: 0, right: 0, bottom: 0, left: 0, width: 0, height: 0 });
    textarea.focus();
    textarea.value = "mill";
    textarea.setSelectionRange(0, 4, "backward");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await editor.whenReady();

    expect(host.querySelector("textarea")).toBeNull();
    expect(editor.getSelection()).toMatchObject({ anchor: 4, head: 0 });
    editor.setSelection(4);
    const popup = host.querySelector('[role="listbox"]');
    expect(popup.hidden).toBe(false);
    expect(popup.textContent).toContain("millis");
    const content = host.querySelector(".cm-content");
    content.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(editor.getValue()).toBe("millis()");
    content.dispatchEvent(new KeyboardEvent("keydown", { key: "/", ctrlKey: true, bubbles: true, cancelable: true }));
    expect(editor.getValue()).toBe("// millis()");
    content.dispatchEvent(new KeyboardEvent("keydown", { key: "d", ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    expect(editor.getValue()).toBe("// millis()\n// millis()");
    expect(onChange).toHaveBeenCalledTimes(4);
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
