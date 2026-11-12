import { type ReactNode, useState } from "react";
import { format } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "../atoms/button";
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
	gutterAction,
	onLineAction,
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
	/** A control in the gutter of a line of the new file, such as a "+" that starts a comment. Nothing draws it by default. */
	gutterAction?: (line: { path?: string; newLine: number; act: () => void }) => ReactNode;
	/** What `act` of `gutterAction` calls. */
	onLineAction?: (line: { path?: string; newLine: number }) => void;
}) {
	const [all, setAll] = useState(false);
	const lines = parseDiff(text);
	const capped = !!showAllLabel && !all && lines.length > DIFF_LINE_CAP;
	return (
		// A scroll area needs a keyboard stop (axe scrollable-region-focusable).
		// biome-ignore lint/a11y/noNoninteractiveTabindex: a keyboard person scrolls the diff
		<section aria-label={label} tabIndex={0} className="overflow-x-auto font-mono text-12">
			{binary ? <p className="px-3 py-1 text-n-11">{binaryLabel}</p> : null}
			{(capped ? lines.slice(0, DIFF_LINE_CAP) : lines).map((l, i) => {
				const at = l.new;
				const note = at == null ? undefined : notes?.[at];
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: the lines never reorder
					<div key={i}>
						<div data-kind={l.kind} className={cn("flex whitespace-pre", TONE[l.kind])}>
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
									{gutterAction ? (
										<span className="w-5 shrink-0 text-center">
											{at == null
												? null
												: gutterAction({
														path,
														newLine: at,
														act: () => onLineAction?.({ path, newLine: at }),
													})}
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
			})}
			{capped ? (
				<Button variant="ghost" onClick={() => setAll(true)}>
					{format(showAllLabel, { n: lines.length })}
				</Button>
			) : null}
			{truncated ? <p className="px-3 py-1 text-n-11">{truncatedLabel}</p> : null}
		</section>
	);
}
