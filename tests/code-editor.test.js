// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createCodeEditor } from "../src/editor/code-editor.js";

const mounts = [];
const editors = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  for (const mount of mounts.splice(0)) mount.replaceChildren();
});

describe("CodeMirror flowchart navigation", () => {
  it("highlights and scrolls to a source line without changing the code or cursor", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    mounts.push(mount);
    Range.prototype.getClientRects ??= () => [];
    Range.prototype.getBoundingClientRect ??= () => ({
      x: 0,
      y: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      width: 0,
      height: 0,
      toJSON() {},
    });
    const editor = createCodeEditor(mount, "void setup() {\n  pinMode(13, OUTPUT);\n}", () => {}, () => {});
    editors.push(editor);
    const original = editor.getValue();
    const initialSelection = editor.getSelection();

    editor.scrollToLine(2);

    expect(editor.getValue()).toBe(original);
    expect(editor.getSelection()).toEqual(initialSelection);
    expect(mount.querySelector(".cm-flowchart-highlight-line")).not.toBeNull();

    editor.clearHighlight();
    expect(mount.querySelector(".cm-flowchart-highlight-line")).toBeNull();
  });

  it("restores forward and backward selections by anchor and head", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    mounts.push(mount);
    const editor = createCodeEditor(mount, "0123456789", () => {}, () => {});
    editors.push(editor);

    editor.setSelection(8, 3);
    expect(editor.getSelection()).toMatchObject({ anchor: 8, head: 3, from: 3, to: 8 });
    editor.setSelection(2, 7);
    expect(editor.getSelection()).toMatchObject({ anchor: 2, head: 7, from: 2, to: 7 });
  });

  it("inserts Arduino functions and control snippets through the editor API", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    mounts.push(mount);
    const editor = createCodeEditor(mount, "", () => {}, () => {});
    editors.push(editor);

    expect(editor.insertCompletion("digitalWrite")).toBe(true);
    expect(editor.getValue()).toBe("digitalWrite(pin, HIGH);");
    editor.setValue("");
    expect(editor.insertCompletion("if / else")).toBe(true);
    expect(editor.getValue()).toContain("if (condition) {");
    expect(editor.getValue()).toContain("} else {");
    expect(editor.insertCompletion("not-a-completion")).toBe(false);
  });

  it("shows matching catalog entries while typing and accepts the selected suggestion", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    mounts.push(mount);
    const editor = createCodeEditor(mount, "", () => {}, () => {});
    editors.push(editor);
    editor.setValue("mill");
    editor.setSelection(4);
    const popup = mount.querySelector('[role="listbox"]');
    expect(popup.hidden).toBe(false);
    expect(popup.textContent).toContain("millis");
    mount.querySelector(".cm-content").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(editor.getValue()).toBe("millis()");
  });

  it("comments and duplicates the active line, and duplicates a selection", () => {
    const mount = document.createElement("div");
    document.body.append(mount);
    mounts.push(mount);
    const editor = createCodeEditor(mount, "digitalWrite(13, HIGH);\ndelay(100);", () => {}, () => {});
    editors.push(editor);
    const content = mount.querySelector(".cm-content");
    const press = (key, options = {}) => content.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ctrlKey: true, ...options }));

    editor.setSelection(0);
    press("/");
    expect(editor.getValue()).toBe("// digitalWrite(13, HIGH);\ndelay(100);");
    press("/", { shiftKey: true });
    expect(editor.getValue()).toBe("digitalWrite(13, HIGH);\ndelay(100);");

    press("d", { shiftKey: true });
    expect(editor.getValue()).toBe("digitalWrite(13, HIGH);\ndigitalWrite(13, HIGH);\ndelay(100);");
    editor.setSelection(0, 5);
    press("d", { shiftKey: true });
    expect(editor.getValue()).toBe("digitdigitalWrite(13, HIGH);\ndigitalWrite(13, HIGH);\ndelay(100);");
  });
});
