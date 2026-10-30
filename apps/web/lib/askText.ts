/**
 * In-app replacement for window.prompt, which the desktop (Electron) app does not support.
 * Shows a small dialog with one text field; resolves with the text, or null when cancelled.
 */
export function askText(question: string, labels: { ok: string; cancel: string }): Promise<string | null> {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop ask-text";
    const form = document.createElement("form");
    form.className = "ask-text-box";
    const text = document.createElement("label");
    text.textContent = question;
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    text.appendChild(input);
    const actions = document.createElement("div");
    actions.className = "ask-text-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "secondary";
    cancel.textContent = labels.cancel;
    const ok = document.createElement("button");
    ok.type = "submit";
    ok.className = "primary";
    ok.textContent = labels.ok;
    actions.append(cancel, ok);
    form.append(text, actions);
    backdrop.appendChild(form);

    const close = (value: string | null) => {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      resolve(value);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(null); };
    form.addEventListener("submit", (event) => { event.preventDefault(); close(input.value); });
    cancel.addEventListener("click", () => close(null));
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(null); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(backdrop);
    input.focus();
  });
}
