import { indentWithTab, toggleLineComment } from "@codemirror/commands";
import { applyCompletion, getCompletions } from "./arduino-completions.js";
import { cpp } from "@codemirror/lang-cpp";
import { indentUnit, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";
import {
  Decoration,
  drawSelection,
  EditorView,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  ViewPlugin,
} from "@codemirror/view";

const setFlowchartHighlight = StateEffect.define();
const flowchartHighlight = StateField.define({
  create: () => Decoration.none,
  update(value, transaction) {
    if (transaction.docChanged || transaction.selectionSet) return Decoration.none;
    for (const effect of transaction.effects) {
      if (!effect.is(setFlowchartHighlight)) continue;
      if (effect.value === null) return Decoration.none;
      const lineNumber = Math.max(1, Math.min(transaction.state.doc.lines, effect.value));
      const line = transaction.state.doc.line(lineNumber);
      return Decoration.set(Decoration.line({ class: "cm-flowchart-highlight-line" }).range(line.from));
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const arduinoHighlighting = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword], color: "var(--syntax-keyword)" },
  { tag: [t.typeName, t.standard(t.typeName)], color: "var(--syntax-type)" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "var(--syntax-function)" },
  { tag: [t.variableName, t.propertyName], color: "var(--syntax-variable)" },
  { tag: [t.string, t.special(t.string)], color: "var(--syntax-string)" },
  { tag: [t.number, t.bool, t.null], color: "var(--syntax-number)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: [t.operator, t.punctuation], color: "var(--syntax-operator)" },
]);

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--text-primary)",
    backgroundColor: "var(--editor-background)",
    fontSize: "13px",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    lineHeight: "1.7",
  },
  ".cm-content": {
    padding: "18px 0",
    caretColor: "var(--accent)",
  },
  ".cm-line": {
    padding: "0 16px",
  },
  ".cm-gutters": {
    color: "var(--text-muted)",
    backgroundColor: "var(--editor-gutter)",
    border: "none",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLineGutter": {
    color: "var(--text-primary)",
    backgroundColor: "var(--editor-active-line)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--editor-active-line)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--selection-background) !important",
  },
});

const completionPopup = ViewPlugin.fromClass(class {
  constructor(view) {
    this.view = view;
    this.items = [];
    this.selected = 0;
    this.dom = document.createElement("div");
    this.dom.className = "cm-arduino-completions";
    this.dom.setAttribute("role", "listbox");
    this.dom.setAttribute("aria-label", "Sugerencias de Arduino");
    this.dom.hidden = true;
    view.dom.append(this.dom);
    this.refresh();
  }

  update(update) {
    if (update.docChanged || update.selectionSet) this.refresh();
  }

  refresh() {
    const selection = this.view.state.selection.main;
    const line = this.view.state.doc.lineAt(selection.head);
    const before = this.view.state.sliceDoc(line.from, selection.head);
    const match = before.match(/[\w.\/]+$/);
    if (!selection.empty || !match) return this.hide();
    const query = match[0];
    const items = getCompletions(query);
    if (!items.length) return this.hide();
    this.from = selection.head - query.length;
    this.to = selection.head;
    this.items = items;
    this.selected = 0;
    this.render();
  }

  render() {
    this.dom.replaceChildren();
    this.items.forEach((item, index) => {
      const option = document.createElement("div");
      option.className = "cm-arduino-completion-option";
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(index === this.selected));
      option.id = `cm-arduino-completion-${index}`;
      const label = document.createElement("strong");
      label.textContent = item.label;
      const detail = document.createElement("span");
      detail.textContent = item.detail;
      option.append(label, detail);
      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.selected = index;
        this.accept();
      });
      this.dom.append(option);
    });
    this.dom.hidden = false;
    this.dom.setAttribute("aria-activedescendant", `cm-arduino-completion-${this.selected}`);
    const target = this.to;
    this.view.requestMeasure({
      read: (view) => {
        const coords = view.coordsAtPos(Math.min(target, view.state.doc.length));
        const bounds = view.dom.getBoundingClientRect();
        return coords ? { left: coords.left - bounds.left, top: coords.bottom - bounds.top } : null;
      },
      write: (position) => {
        if (position && !this.dom.hidden) {
          this.dom.style.left = `${position.left}px`;
          this.dom.style.top = `${position.top}px`;
        }
      },
    });
  }

  hide() {
    this.items = [];
    this.dom.hidden = true;
    this.dom.removeAttribute("aria-activedescendant");
  }

  accept() {
    const item = this.items[this.selected];
    if (!item) return false;
    const result = applyCompletion(this.view.state.doc.toString(), item, this.from, this.to);
    this.view.dispatch({ changes: { from: this.from, to: this.to, insert: result.text.slice(this.from, this.from + result.text.length - this.view.state.doc.length + (this.to - this.from)) }, selection: { anchor: result.cursor }, userEvent: "input.complete" });
    this.hide();
    this.view.focus();
    return true;
  }

  destroy() { this.dom.remove(); }
});

const arduinoKeymap = [
  { key: "Mod-Shift-d", run: duplicateCurrent },
  { key: "Mod-Shift-D", run: duplicateCurrent },
  { key: "Mod-/", run: (view) => toggleLineComment(view) },
  { key: "Escape", run(view) { const popup = view.plugin(completionPopup); if (!popup?.items.length) return false; popup.hide(); return true; } },
  { key: "ArrowDown", run(view) { const popup = view.plugin(completionPopup); if (!popup?.items.length) return false; popup.selected = (popup.selected + 1) % popup.items.length; popup.render(); return true; } },
  { key: "ArrowUp", run(view) { const popup = view.plugin(completionPopup); if (!popup?.items.length) return false; popup.selected = (popup.selected + popup.items.length - 1) % popup.items.length; popup.render(); return true; } },
  { key: "Enter", run(view) { const popup = view.plugin(completionPopup); return popup?.items.length ? popup.accept() : false; } },
  { key: "Tab", run(view) { const popup = view.plugin(completionPopup); return popup?.items.length ? popup.accept() : false; } },
];

function duplicateCurrent(view) {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    const selected = view.state.sliceDoc(selection.from, selection.to);
    view.dispatch({ changes: { from: selection.to, insert: selected }, selection: { anchor: selection.to + selected.length, head: selection.to + selected.length } });
    return true;
  }
  const line = view.state.doc.lineAt(selection.head);
  const insert = `\n${line.text}`;
  view.dispatch({ changes: { from: line.to, insert }, selection: { anchor: line.to + insert.length } });
  return true;
}

export function createCodeEditor(parent, initialValue, onChange, onLineCount, onSelectionChange = () => {}) {
  const state = EditorState.create({
    doc: initialValue,
    extensions: [
      lineNumbers(),
      highlightActiveLineGutter(),
      drawSelection(),
      flowchartHighlight,
      indentUnit.of("  "),
      cpp(),
      syntaxHighlighting(arduinoHighlighting),
      editorTheme,
      completionPopup,
      EditorView.lineWrapping,
      keymap.of([...arduinoKeymap, indentWithTab]),
      EditorView.contentAttributes.of({ "aria-label": "Código fuente Arduino" }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChange(update.state.doc.toString());
          onLineCount(update.state.doc.lines);
        }
        if (update.selectionSet || update.docChanged) {
          const position = update.state.selection.main.head;
          onSelectionChange({
            line: update.state.doc.lineAt(position).number,
            position,
          });
          if (update.selectionSet && !update.docChanged) {
            queueMicrotask(() => {
              if (!destroyed) view.dispatch({ effects: setFlowchartHighlight.of(null) });
            });
          }
        }
      }),
    ],
  });

  const view = new EditorView({ state, parent });
  let destroyed = false;
  onLineCount(view.state.doc.lines);

  return {
    getValue: () => view.state.doc.toString(),
    setValue(value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        selection: { anchor: 0 },
      });
      view.focus();
    },
    scrollToLine(lineNumber) {
      const safeLine = Math.max(1, Math.min(view.state.doc.lines, lineNumber));
      const position = view.state.doc.line(safeLine).from;
      view.dispatch({
        effects: [
          setFlowchartHighlight.of(safeLine),
          EditorView.scrollIntoView(position, { y: "center" }),
        ],
      });
    },
    selectLine(lineNumber) {
      const safeLine = Math.max(1, Math.min(view.state.doc.lines, Math.trunc(lineNumber) || 1));
      const position = view.state.doc.line(safeLine).from;
      this.setSelection(position);
      this.scrollToLine(safeLine);
      return position;
    },
    clearHighlight() {
      view.dispatch({ effects: setFlowchartHighlight.of(null) });
    },
    getSelection: () => view.state.selection.main,
    setSelection(anchor, head = anchor) {
      const length = view.state.doc.length;
      const safeAnchor = Math.max(0, Math.min(length, anchor));
      const safeHead = Math.max(0, Math.min(length, head));
      view.dispatch({ selection: { anchor: safeAnchor, head: safeHead } });
    },
    destroy() {
      destroyed = true;
      view.destroy();
    },
    focus: () => view.focus(),
    insertCompletion(label) {
      const item = getCompletions(label).find((candidate) => candidate.label === label);
      if (!item) return false;
      const selection = view.state.selection.main;
      const result = applyCompletion(view.state.doc.toString(), item, selection.from, selection.to);
      const insertedLength = result.text.length - view.state.doc.length + (selection.to - selection.from);
      view.dispatch({ changes: { from: selection.from, to: selection.to, insert: result.text.slice(selection.from, selection.from + insertedLength) }, selection: { anchor: result.cursor } });
      view.focus();
      return true;
    },
    openCompletions() { view.focus(); return view.plugin(completionPopup)?.items.length > 0; },
  };
}
