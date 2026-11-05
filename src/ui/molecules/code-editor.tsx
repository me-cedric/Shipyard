import { Fragment, type ReactNode, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { languageFor, type Token } from "./syntax";

export { gherkin, type Token } from "./syntax";

const LINE = "1.25rem";

export const TONE: Record<NonNullable<Token[1]>, string> = {
	keyword: "font-semibold text-accent-text",
	step: "text-info-text",
	tag: "text-warning-text",
	comment: "text-n-10 italic",
	string: "text-success-text",
	ref: "text-accent-text underline decoration-dotted",
};

/** The pieces of one line, each in the colour of its tone. */
export function Tokens({ tokens }: { tokens: Token[] }) {
	return (
		<>
			{tokens.map(([text, tone], j) =>
				tone ? (
					// biome-ignore lint/suspicious/noArrayIndexKey: the pieces never reorder
					<span key={j} className={TONE[tone]}>
						{text}
					</span>
				) : (
					// biome-ignore lint/suspicious/noArrayIndexKey: the pieces never reorder
					<Fragment key={j}>{text}</Fragment>
				),
			)}
		</>
	);
}

/** A line of read-only code in the colours of the editor. `lang` is a file path or a fence language; an unknown one stays plain. */
export function CodeLine({ text, lang }: { text: string; lang?: string }) {
	const hl = languageFor(lang);
	return hl ? <Tokens tokens={hl(text)} /> : text;
}

/**
 * A monospace text editor with line numbers. It serves Mermaid, LikeC4, DBML, Gherkin, Markdown
 * and YAML. The error line, when set, shows in the gutter and across the text.
 * `highlight` colours the text in a layer under a clear text area (Gherkin today).
 * shortcut: no indent keys and no colour for the other languages, add a code editor library when a view needs it.
 */
export function CodeEditor({
	label,
	value,
	onChange,
	errorLine,
	readOnly,
	highlight,
	className,
}: {
	/** The accessible name of the field. */
	label: string;
	value: string;
	onChange?: (value: string) => void;
	/** 1-based line to mark. */
	errorLine?: number | null;
	readOnly?: boolean;
	/** Colours the text, one line at a time. The text area stays the field. */
	highlight?: (line: string) => Token[];
	className?: string;
}) {
	const [top, setTop] = useState(0);
	const [left, setLeft] = useState(0);
	const gutter = useRef<HTMLDivElement>(null);
	const count = value.split("\n").length;
	// A parser can name the line after the last one: mark the last line.
	const marked = errorLine ? Math.min(errorLine, count) : null;
	return (
		<div
			className={cn(
				"relative flex min-h-40 overflow-hidden rounded-md border border-n-7 bg-n-1 font-mono text-12",
				className,
			)}
			style={{ lineHeight: LINE }}
		>
			<div
				ref={gutter}
				aria-hidden="true"
				className="w-10 shrink-0 select-none overflow-hidden border-r border-n-6 bg-n-2 py-2 text-right text-n-10"
			>
				<div style={{ transform: `translateY(${-top}px)` }}>
					{Array.from({ length: count }, (_, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: the numbers never reorder
							key={i}
							data-error={marked === i + 1 || undefined}
							className="pr-2 data-[error]:bg-danger-subtle data-[error]:font-medium data-[error]:text-danger-text"
						>
							{i + 1}
						</div>
					))}
				</div>
			</div>
			<div className="relative min-w-0 flex-1">
				{marked ? (
					<div
						aria-hidden="true"
						data-testid="error-line"
						className="pointer-events-none absolute inset-x-0 bg-danger-subtle"
						style={{ top: `calc(0.5rem + ${(marked - 1) * 1.25}rem - ${top}px)`, height: LINE }}
					/>
				) : null}
				{highlight ? (
					<pre
						aria-hidden="true"
						className="pointer-events-none absolute inset-0 m-0 overflow-hidden px-2 py-2 text-n-12"
						style={{ lineHeight: LINE }}
					>
						<div style={{ transform: `translate(${-left}px, ${-top}px)` }}>
							{value.split("\n").map((l, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: one row per line, in order
								<div key={i} className="min-h-5 whitespace-pre">
									{highlight(l).map(
										([text, tone], j): ReactNode =>
											tone ? (
												// biome-ignore lint/suspicious/noArrayIndexKey: pieces of one line, in order
												<span key={j} className={TONE[tone]}>
													{text}
												</span>
											) : (
												text
											),
									)}
								</div>
							))}
						</div>
					</pre>
				) : null}
				<textarea
					aria-label={label}
					aria-invalid={marked ? true : undefined}
					value={value}
					readOnly={readOnly}
					wrap="off"
					spellCheck={false}
					onChange={(e) => onChange?.(e.target.value)}
					onScroll={(e) => {
						setTop(e.currentTarget.scrollTop);
						setLeft(e.currentTarget.scrollLeft);
					}}
					className={cn(
						"relative size-full min-h-40 resize-none overflow-auto bg-transparent px-2 py-2 text-n-12",
						highlight && "text-transparent caret-n-12 selection:bg-accent-soft",
					)}
					style={{ lineHeight: LINE }}
				/>
			</div>
		</div>
	);
}
