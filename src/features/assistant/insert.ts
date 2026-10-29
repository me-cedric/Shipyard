import { type RefObject, useEffect, useState } from "react";

const isEditor = (el: EventTarget | null): el is HTMLElement =>
	el instanceof HTMLTextAreaElement ||
	(el instanceof HTMLInputElement && /^(text|search|url|email)$/.test(el.type)) ||
	(el instanceof HTMLElement && el.isContentEditable);

/** Puts the text at the cursor of the editor, as a person typing it would. */
function insertInto(el: HTMLElement, text: string) {
	el.focus();
	if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
		const at = el.value.length;
		el.setRangeText(text, el.selectionStart ?? at, el.selectionEnd ?? at, "end");
		el.dispatchEvent(new Event("input", { bubbles: true }));
	} else document.execCommand("insertText", false, text);
}

/**
 * The text editor that last had the focus outside the panel. A click on Insert moves the focus,
 * so the panel remembers the editor. A view that closed its editor takes the action away.
 */
export function useEditorTarget(panel: RefObject<HTMLElement | null>) {
	const [editor, setEditor] = useState<HTMLElement | null>(null);
	useEffect(() => {
		const onFocus = (e: FocusEvent) => {
			if (isEditor(e.target) && !panel.current?.contains(e.target)) setEditor(e.target);
		};
		document.addEventListener("focusin", onFocus);
		return () => document.removeEventListener("focusin", onFocus);
	}, [panel]);
	const target = editor?.isConnected ? editor : null;
	return {
		canInsert: target !== null,
		insert: (text: string) => target && insertInto(target, text),
	};
}
