import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { CodeLine } from "../molecules/code-editor";

const LINE = "1.25rem";
/**
 * A read-only file: line numbers, syntax colour and one marked line that scrolls into view.
 * A binary file shows its size and no content.
 */
export function FileViewer({
	label,
	text,
	line,
	path,
	binary,
	binaryLabel,
}: {
	label: string;
	text: string;
	/** 1-based line to mark. */
	line?: number | null;
	/** The file path: its type picks the colours. Without it the text stays plain. */
	path?: string;
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
						<CodeLine text={l} lang={path} />
					</span>
				</div>
			))}
		</section>
	);
}
