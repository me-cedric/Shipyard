import { type ReactNode, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/ui/atoms/button";
import { ArrowUpTrayIcon, BookOpenIcon, PencilIcon } from "@/ui/icons";

const MIN = 3;
const MAX = 4000;

/** The text that the person selected in the page, and where it ends. Text in a field is left out. */
function readSelection(): { text: string; x: number; y: number } | null {
	const s = document.getSelection();
	const text = s?.toString().trim() ?? "";
	if (!s || s.rangeCount === 0 || text.length < MIN || text.length > MAX) return null;
	const node = s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement;
	if (node?.closest("input, textarea, [data-selection-actions]")) return null;
	const rect = s.getRangeAt(0).getBoundingClientRect();
	return { text, x: Math.max(8, rect.left), y: rect.bottom + 6 };
}

/**
 * The toolbar of a selection (Legacy `selection-actions.tsx`): explain, fix, or send it to the
 * factory. Each action opens the assistant with a prompt and the quoted text in the draft. The
 * person reads it and sends it. The keyboard path is the slash commands of the composer.
 */
export function SelectionActions({ onAsk }: { onAsk: (text: string) => void }): ReactNode {
	const { t } = useI18n();
	const [sel, setSel] = useState<ReturnType<typeof readSelection>>(null);
	useEffect(() => {
		const read = () => setSel(readSelection());
		const clear = (e: Event) => {
			if (!(e.target as Element | null)?.closest?.("[data-selection-actions]")) setSel(null);
		};
		document.addEventListener("mouseup", read);
		document.addEventListener("mousedown", clear);
		return () => {
			document.removeEventListener("mouseup", read);
			document.removeEventListener("mousedown", clear);
		};
	}, []);
	if (!sel) return null;
	const s = t.assistant.selection;
	const ask = (prompt: string) => () => {
		onAsk(`${prompt}\n${sel.text.replace(/^/gm, "> ")}\n`);
		document.getSelection()?.removeAllRanges();
		setSel(null);
	};
	return (
		<div
			role="toolbar"
			aria-label={s.label}
			data-selection-actions=""
			// The mouse down keeps the selection.
			onMouseDown={(e) => e.preventDefault()}
			style={{ left: sel.x, top: sel.y }}
			className="fixed z-30 flex gap-1 rounded-lg border bg-surface-3 p-1 shadow-3"
		>
			<Button variant="ghost" onClick={ask(s.promptExplain)}>
				<BookOpenIcon size={14} />
				{s.explain}
			</Button>
			<Button variant="ghost" onClick={ask(s.promptFix)}>
				<PencilIcon size={14} />
				{s.fix}
			</Button>
			<Button variant="ghost" onClick={ask(s.promptFactory)}>
				<ArrowUpTrayIcon size={14} />
				{s.factory}
			</Button>
		</div>
	);
}
