import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

const LINE = "1.25rem";

/**
 * A monospace text editor with line numbers. It serves Mermaid, LikeC4, DBML, Gherkin, Markdown
 * and YAML. The error line, when set, shows in the gutter and across the text.
 * shortcut: no syntax colour and no indent keys, add a code editor library when a view needs it.
 */
export function CodeEditor({
	label,
	value,
	onChange,
	errorLine,
	readOnly,
	className,
}: {
	/** The accessible name of the field. */
	label: string;
	value: string;
	onChange?: (value: string) => void;
	/** 1-based line to mark. */
	errorLine?: number | null;
	readOnly?: boolean;
	className?: string;
}) {
	const [top, setTop] = useState(0);
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
				<textarea
					aria-label={label}
					aria-invalid={marked ? true : undefined}
					value={value}
					readOnly={readOnly}
					wrap="off"
					spellCheck={false}
					onChange={(e) => onChange?.(e.target.value)}
					onScroll={(e) => setTop(e.currentTarget.scrollTop)}
					className="relative size-full min-h-40 resize-none overflow-auto bg-transparent px-2 py-2 text-n-12"
					style={{ lineHeight: LINE }}
				/>
			</div>
		</div>
	);
}
