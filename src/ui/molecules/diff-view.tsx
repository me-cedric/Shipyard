import {
	type KeyboardEvent,
	memo,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { format } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "../atoms/button";
import { PlusIcon } from "../icons";
import { CodeLine } from "./code-editor";

type Kind = "add" | "del" | "hunk" | "ctx";

const SIGN: Record<Kind, string> = { add: "+", del: "−", hunk: "", ctx: " " };
const TONE: Record<Kind, string> = {
	add: "bg-success-subtle text-success-text",
	del: "bg-danger-subtle text-danger-text",
	hunk: "bg-n-3 text-n-10",
	ctx: "text-n-12",
};

type Line = { kind: Kind; text: string; old: number | null; new: number | null };

/** The lines after the first hunk header, with their numbers in the old and the new file. The file headers above it are dropped. */
export function parseDiff(text: string): Line[] {
	const out: Line[] = [];
	let inHunk = false;
	let o = 0;
	let n = 0;
	// The lines that the hunk header still promises in the old and the new file.
	let ro = 0;
	let rn = 0;
	for (const line of text.split("\n")) {
		if (line.startsWith("@@")) {
			inHunk = true;
			o = Number(/-(\d+)/.exec(line)?.[1] ?? 0);
			n = Number(/\+(\d+)/.exec(line)?.[1] ?? 0);
			const counts = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
			ro = counts ? Number(counts[1] ?? 1) : 0;
			rn = counts ? Number(counts[2] ?? 1) : 0;
			out.push({ kind: "hunk", text: line, old: null, new: null });
		} else if (!inHunk || line.startsWith("\\")) {
		} else if (line.startsWith("+")) {
			rn--;
			out.push({ kind: "add", text: line.slice(1), old: null, new: n++ });
		} else if (line.startsWith("-")) {
			ro--;
			out.push({ kind: "del", text: line.slice(1), old: o++, new: null });
		} else if (line.startsWith(" ") || (line === "" && ro > 0 && rn > 0)) {
			// A blank context line may lose its leading space on the way: the hunk counts say it is still there.
			ro--;
			rn--;
			out.push({ kind: "ctx", text: line.slice(1), old: o++, new: n++ });
		}
	}
	return out;
}

/** The lines of the new file that a diff shows: the added lines and the context lines. */
export function shownLines(text: string): Set<number> {
	return new Set(parseDiff(text).flatMap((l) => (l.new == null ? [] : [l.new])));
}

/** The most lines that a diff draws before its "Show all" button, when `showAllLabel` is set. */
export const DIFF_LINE_CAP = 2000;

const NUM = "w-10 shrink-0 pr-1 text-right text-n-9 tabular-nums select-none";

/** One line. It is memoised: a note that opens under one line does not draw the others again. */
const LineRow = memo(function LineRow({
	l,
	path,
	note,
	actionLabel,
	actionOff,
	showAction,
	tabbable,
	onAct,
	onActive,
	onHover,
}: {
	l: Line;
	path?: string;
	note?: ReactNode;
	actionLabel?: string;
	/** The reason that the "+" is off. The button stays in the tab order and says why. */
	actionOff?: string;
	/** Only the active row draws its "+": the hovered one and the keyboard current one. */
	showAction: boolean;
	tabbable: boolean;
	onAct: (newLine: number) => void;
	onActive: (newLine: number) => void;
	onHover: (newLine: number) => void;
}) {
	const at = l.new;
	return (
		<div>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: hover only moves the "+" to this row; the keyboard path has its own keys */}
			<div
				data-kind={l.kind}
				onMouseEnter={at == null || !actionLabel ? undefined : () => onHover(at)}
				className={cn("group flex whitespace-pre", TONE[l.kind])}
			>
				{l.kind === "hunk" ? (
					<span className="px-2">{l.text}</span>
				) : (
					<>
						<span aria-hidden="true" className={NUM}>
							{l.old}
						</span>
						<span aria-hidden="true" className={NUM}>
							{l.new}
						</span>
						{actionLabel ? (
							<span className="w-5 shrink-0 text-center">
								{at == null || !showAction ? null : (
									<button
										type="button"
										data-line-action={at}
										tabIndex={tabbable ? 0 : -1}
										aria-label={format(actionLabel, { n: at })}
										aria-disabled={actionOff ? true : undefined}
										aria-description={actionOff}
										title={actionOff}
										onFocus={() => onActive(at)}
										onClick={() => !actionOff && onAct(at)}
										className="inline-flex size-4 items-center justify-center rounded-sm text-n-11 opacity-0 transition-opacity duration-(--duration-fast) hover:bg-n-4 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:shadow-glow"
									>
										<PlusIcon size={12} />
									</button>
								)}
							</span>
						) : null}
						<span aria-hidden="true" className="w-5 shrink-0 text-center select-none">
							{SIGN[l.kind]}
						</span>
						<span className="pr-3">
							<CodeLine text={l.text} lang={path} />
						</span>
					</>
				)}
			</div>
			{note ? <div className="px-5 py-1 font-sans whitespace-normal">{note}</div> : null}
		</div>
	);
});

/** A unified diff. Two line numbers, a sign in the gutter and a tint mark each changed line. */
export function DiffView({
	text,
	path,
	binary,
	truncated,
	label,
	binaryLabel,
	truncatedLabel,
	notes,
	showAllLabel,
	lineActionLabel,
	onLineAction,
	lineActionDisabled,
	hiddenNotesLabel,
}: {
	text: string;
	/** The file path: its type picks the colours of the lines. */
	path?: string;
	binary?: boolean;
	truncated?: boolean;
	/** The accessible name of the region. */
	label: string;
	binaryLabel: string;
	truncatedLabel: string;
	/** A note under the line of the new file with this number: a finding of a review. */
	notes?: Record<number, ReactNode>;
	/** With it, a diff of more than `DIFF_LINE_CAP` lines shows the first ones and this button. `{n}` is the line count. */
	showAllLabel?: string;
	/** With `onLineAction`, a "+" button shows in the gutter of each added and context line. Its accessible name; `{n}` is the line number. */
	lineActionLabel?: string;
	/** What the "+" button of a line calls. Arrow keys move between the buttons: the diff is one tab stop. */
	onLineAction?: (line: { path?: string; newLine: number }) => void;
	/** The reason that the "+" buttons are off: they stay focusable and say why. The diff does not know the rights. */
	lineActionDisabled?: string;
	/** Under the cap, a note says how many lines with a note wait for Show all. `{n}` is that count. */
	hiddenNotesLabel?: string;
}) {
	const [all, setAll] = useState(false);
	const [active, setActive] = useState<number | null>(null);
	// The hovered row keeps its button until another row is hovered: it is invisible without the hover.
	const [hover, setHover] = useState<number | null>(null);
	const section = useRef<HTMLElement>(null);
	// The row that the arrow keys moved to: its "+" takes the focus once it is drawn.
	const focusAt = useRef<number | null>(null);
	const lines = useMemo(() => parseDiff(text), [text]);
	const capped = !!showAllLabel && !all && lines.length > DIFF_LINE_CAP;
	const actionLabel = onLineAction ? lineActionLabel : undefined;
	// shortcut: counts the lines that hold a note, not each comment, upgrade when a note needs its own count
	const hidden = capped
		? lines.slice(DIFF_LINE_CAP).filter((l) => l.new != null && notes?.[l.new]).length
		: 0;
	// The one line button in the tab order: the last focused one, else the first.
	const stop = useMemo(
		() =>
			active != null && lines.some((l) => l.new === active)
				? active
				: (lines.find((l) => l.new != null)?.new ?? null),
		[lines, active],
	);
	const latest = useRef(onLineAction);
	latest.current = onLineAction;
	useEffect(() => {
		if (focusAt.current === null || focusAt.current !== stop) return;
		section.current?.querySelector<HTMLElement>(`[data-line-action="${stop}"]`)?.focus();
		focusAt.current = null;
	}, [stop]);
	const onAct = useCallback((newLine: number) => latest.current?.({ path, newLine }), [path]);
	const move = (e: KeyboardEvent<HTMLElement>) => {
		if (!(e.target instanceof HTMLElement) || e.target.dataset.lineAction === undefined) return;
		if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
		e.preventDefault();
		const rows = (capped ? lines.slice(0, DIFF_LINE_CAP) : lines).flatMap((l) =>
			l.new == null ? [] : [l.new],
		);
		const to = rows[rows.indexOf(stop ?? -1) + (e.key === "ArrowDown" ? 1 : -1)];
		if (to === undefined) return;
		focusAt.current = to;
		setActive(to);
	};
	return (
		// A scroll area needs a keyboard stop (axe scrollable-region-focusable).
		<section
			ref={section}
			aria-label={label}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: a keyboard person scrolls the diff
			tabIndex={0}
			onKeyDown={actionLabel ? move : undefined}
			className="overflow-x-auto font-mono text-12"
		>
			{binary ? <p className="px-3 py-1 text-n-11">{binaryLabel}</p> : null}
			{(capped ? lines.slice(0, DIFF_LINE_CAP) : lines).map((l, i) => (
				<LineRow
					// biome-ignore lint/suspicious/noArrayIndexKey: the lines never reorder
					key={i}
					l={l}
					path={path}
					note={l.new == null ? undefined : notes?.[l.new]}
					actionLabel={actionLabel}
					actionOff={lineActionDisabled}
					showAction={l.new != null && (l.new === stop || l.new === hover)}
					tabbable={l.new != null && l.new === stop}
					onAct={onAct}
					onActive={setActive}
					onHover={setHover}
				/>
			))}
			{capped && hidden > 0 && hiddenNotesLabel ? (
				<p role="status" className="px-3 py-1 text-n-11">
					{format(hiddenNotesLabel, { n: hidden })}
				</p>
			) : null}
			{capped ? (
				<Button variant="ghost" onClick={() => setAll(true)}>
					{format(showAllLabel, { n: lines.length })}
				</Button>
			) : null}
			{truncated ? <p className="px-3 py-1 text-n-11">{truncatedLabel}</p> : null}
		</section>
	);
}
