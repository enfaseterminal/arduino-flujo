const CODE_EDITOR_MODULE = () => import("./code-editor.js");

function lineCount(value) {
  return String(value).split("\n").length;
}

function selectionFor(textarea) {
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? start;
  const backwards = textarea.selectionDirection === "backward";
  return backwards
    ? { anchor: end, head: start }
    : { anchor: start, head: end };
}

export function createLazyCodeEditor(
  parent,
  initialValue,
  onChange = () => {},
  onLineCount = () => {},
  onSelectionChange = () => {},
  {
    loadCodeEditor = CODE_EDITOR_MODULE,
    onLoadError = () => {},
  } = {},
) {
  const textarea = document.createElement("textarea");
  textarea.className = "editor-fallback";
  textarea.setAttribute("aria-label", "Código fuente Arduino");
  textarea.setAttribute("spellcheck", "false");
  textarea.value = String(initialValue ?? "");
  parent.replaceChildren(textarea);
  onLineCount(lineCount(textarea.value));

  let editor = null;
  let loadingPromise = null;
  let destroyed = false;
  let focusAfterLoad = false;

  function notifySelection() {
    const { head: cursor } = selectionFor(textarea);
    const line = lineCount(textarea.value.slice(0, cursor));
    onSelectionChange({ line, position: cursor });
  }

  function onInput() {
    onChange(textarea.value);
    onLineCount(lineCount(textarea.value));
  }

  function reportLoadError(error) {
    try {
      onLoadError(error);
    } catch {
      // Keep the textarea usable even if the optional error reporter fails.
    }
  }

  function ensureLoaded({ focus = document.activeElement === textarea } = {}) {
    if (editor) {
      if (focus) editor.focus();
      return Promise.resolve(editor);
    }
    if (destroyed) return Promise.resolve(null);
    focusAfterLoad ||= focus;
    if (loadingPromise) return loadingPromise;

    loadingPromise = Promise.resolve()
      .then(() => loadCodeEditor())
      .then((module) => {
        if (destroyed) return null;
        const currentValue = textarea.value;
        const selection = selectionFor(textarea);
        const shouldFocus = focusAfterLoad || document.activeElement === textarea;
        let mounted;
        try {
          mounted = module.createCodeEditor(
            parent,
            currentValue,
            onChange,
            onLineCount,
            onSelectionChange,
          );
          mounted.setSelection(selection.anchor, selection.head);
          if (shouldFocus) mounted.focus();
          textarea.remove();
          editor = mounted;
          return editor;
        } catch (error) {
          mounted?.destroy();
          for (const child of [...parent.children]) {
            if (child !== textarea) child.remove();
          }
          throw error;
        }
      })
      .catch((error) => {
        reportLoadError(error);
        throw error;
      })
      .finally(() => {
        loadingPromise = null;
        focusAfterLoad = false;
      });
    return loadingPromise;
  }

  function requestLoad() {
    void ensureLoaded().catch(() => {});
  }

  function onBlur() {
    focusAfterLoad = false;
  }

  textarea.addEventListener("focus", requestLoad);
  textarea.addEventListener("blur", onBlur);
  textarea.addEventListener("input", onInput);
  textarea.addEventListener("input", requestLoad);
  textarea.addEventListener("keydown", requestLoad);
  textarea.addEventListener("paste", requestLoad);
  textarea.addEventListener("select", notifySelection);
  textarea.addEventListener("keyup", notifySelection);
  textarea.addEventListener("click", notifySelection);

  return {
    getValue: () => editor?.getValue() ?? textarea.value,
    setValue(value) {
      const nextValue = String(value ?? "");
      if (editor) {
        editor.setValue(nextValue);
        return;
      }
      const changed = textarea.value !== nextValue;
      textarea.value = nextValue;
      textarea.setSelectionRange(0, 0);
      if (changed) {
        onChange(textarea.value);
        onLineCount(lineCount(textarea.value));
      }
      focusAfterLoad = true;
      requestLoad();
    },
    scrollToLine(lineNumber) {
      if (editor) return editor.scrollToLine(lineNumber);
      return ensureLoaded().then((mounted) => mounted?.scrollToLine(lineNumber));
    },
    clearHighlight() {
      return editor?.clearHighlight();
    },
    getSelection() {
      if (editor) return editor.getSelection();
      const { anchor, head } = selectionFor(textarea);
      return {
        anchor,
        head,
        from: Math.min(anchor, head),
        to: Math.max(anchor, head),
        empty: anchor === head,
      };
    },
    load: () => ensureLoaded({ focus: document.activeElement === textarea }),
    whenReady: () => loadingPromise ?? Promise.resolve(editor),
    destroy() {
      destroyed = true;
      if (editor) editor.destroy();
      textarea.removeEventListener("focus", requestLoad);
      textarea.removeEventListener("blur", onBlur);
      textarea.removeEventListener("input", onInput);
      textarea.removeEventListener("input", requestLoad);
      textarea.removeEventListener("keydown", requestLoad);
      textarea.removeEventListener("paste", requestLoad);
      textarea.removeEventListener("select", notifySelection);
      textarea.removeEventListener("keyup", notifySelection);
      textarea.removeEventListener("click", notifySelection);
      textarea.remove();
      editor = null;
    },
    focus() {
      if (editor) return editor.focus();
      textarea.focus();
      focusAfterLoad = true;
      return ensureLoaded({ focus: true });
    },
  };
}
