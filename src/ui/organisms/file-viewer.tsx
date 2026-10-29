import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const LINE = "1.25rem";
// One pass per line: a comment, a string, a number or a keyword.
const TOKEN =
	/(\/\/.*|#.*|--.*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)|\b(\d+(?:\.\d+)?)\b|\b(const|let|var|function|return|if|else|for|while|import|export|from|class|fn|pub|use|struct|impl|enum|async|await|def|type|interface)\b/g;
const TONE = ["", "text-n-10", "text-success-text", "text-warning-text", "text-accent-text"];

/** The tokens of one line. shortcut: one regex, no multi-line comment or string, add a parser when needed. */
export function colour(line: string): { text: string; tone: string }[] {
	const out: { text: string; tone: string }[] = [];
	let at = 0;
	for (const m of line.matchAll(TOKEN)) {
		if (m.index > at) out.push({ text: line.slice(at, m.index), tone: "" });
		const kind = [1, 2, 3, 4].find((i) => m[i] !== undefined) ?? 0;
		out.push({ text: m[0], tone: TONE[kind] ?? "" });
		at = m.index + m[0].length;
	}
	if (at < line.length) out.push({ text: line.slice(at), tone: "" });
	return out;
}

/**
 * A read-only file: line numbers, syntax colour and one marked line that scrolls into view.
 * A binary file shows its size and no content.
 */
export function FileViewer({
	label,
	text,
	line,
	binary,
	binaryLabel,
}: {
	label: string;
	text: string;
	/** 1-based line to mark. */
	line?: number | null;
	binary?: boolean;
	binaryLabel: string;
}) {
	const marked = useRef<HTMLDivElement>(null);
	useEffect(() => {
		marked.current?.scrollIntoView({ block: "center" });
	}, []);
	if (binary) return <p className="px-3 py-2 text-ui text-n-11">{binaryLabel}</p>;
	return (
		<section
			aria-label={label}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: a keyboard person scrolls the file
			tabIndex={0}
			className="max-h-[60vh] overflow-auto rounded-md border border-n-7 bg-n-1 font-mono text-12"
			style={{ lineHeight: LINE }}
		>
			{text.split("\n").map((l, i) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: the lines never reorder
					key={i}
					ref={line === i + 1 ? marked : undefined}
					data-marked={line === i + 1 || undefined}
					className={cn("flex whitespace-pre", line === i + 1 && "bg-warning-subtle")}
				>
					<span
						aria-hidden="true"
						className="w-10 shrink-0 select-none border-r border-n-6 bg-n-2 pr-2 text-right text-n-10"
					>
						{i + 1}
					</span>
					<span className="pl-2">
						{colour(l).map((tk, j) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: the tokens never reorder
							<span key={j} className={tk.tone}>
								{tk.text}
							</span>
						))}
					</span>
				</div>
			))}
		</section>
	);
}
