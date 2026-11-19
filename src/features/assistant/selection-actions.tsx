import { type ReactNode, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/ui/atoms/button";
import { ArrowUpTrayIcon, BookOpenIcon, PencilIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import type { Assistant } from "./use-assistant";

const MIN = 3;
const MAX = 4000;

/**
 * The text that the person selected in the page, and where it ends. Text in a field is left out.
 * The Ask page has a card for its selection: `page` reads only there, and the toolbar skips it.
 */
function readSelection(page = false): { text: string; x: number; y: number } | null {
	const s = document.getSelection();
	const text = s?.toString().trim() ?? "";
	if (!s || s.rangeCount === 0 || text.length < MIN || text.length > MAX) return null;
	const node = s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement;
	if (node?.closest("input, textarea, [data-selection-actions]")) return null;
	if (Boolean(node?.closest("[data-selection-page]")) !== page) return null;
	const rect = s.getRangeAt(0).getBoundingClientRect();
	return { text, x: Math.max(8, rect.left), y: rect.bottom + 6 };
}

/**
 * The toolbar of a selection: explain, fix, or send it to the
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

/**
 * The card "On a selection" of the Ask page: the text that the person selected in the page, and the
 * same three actions as the toolbar. With no selection, Explain explains the item of the context.
 */
export function SelectionCard({ a }: { a: Assistant }): ReactNode {
	const { t } = useI18n();
	const [quote, setQuote] = useState("");
	useEffect(() => {
		const read = () => {
			const sel = readSelection(true);
			if (sel) setQuote(sel.text);
		};
		document.addEventListener("mouseup", read);
		return () => document.removeEventListener("mouseup", read);
	}, []);
	const s = t.assistant.selection;
	const refs = a.current?.thread.context.refs ?? [];
	const target = (a.dropped.selected ? null : a.selected) ?? refs.at(-1) ?? null;
	const ask = (prompt: string) => () => {
		a.setDraft(`${prompt}\n${quote.replace(/^/gm, "> ")}\n`);
		setQuote("");
	};
	return (
		<Card pad className="flex flex-col gap-3.5">
			<h2 className="font-semibold text-13 text-n-11">{t.assistant.page.onSelection}</h2>
			{quote ? (
				<p className="line-clamp-4 rounded-field bg-surface-0 p-4 text-17">“{quote}”</p>
			) : null}
			<Button
				disabled={quote ? !a.current : !target || a.busy}
				onClick={quote ? ask(s.promptExplain) : () => target && void a.explain(target)}
			>
				{s.explain}
			</Button>
			<Button disabled={!quote || !a.current} onClick={ask(s.promptFix)}>
				{s.fix}
			</Button>
			<Button disabled={!quote || !a.current} onClick={ask(s.promptFactory)}>
				{s.factory}
			</Button>
		</Card>
	);
}
