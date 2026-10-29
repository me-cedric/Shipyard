import { cn } from "@/lib/utils";

type Kind = "add" | "del" | "hunk" | "ctx";

const SIGN: Record<Kind, string> = { add: "+", del: "−", hunk: "", ctx: " " };
const TONE: Record<Kind, string> = {
	add: "bg-success-subtle text-success-text",
	del: "bg-danger-subtle text-danger-text",
	hunk: "bg-n-3 text-n-10",
	ctx: "text-n-12",
};

/** The lines after the first hunk header. The file headers above it are dropped. */
export function parseDiff(text: string): { kind: Kind; text: string }[] {
	const out: { kind: Kind; text: string }[] = [];
	let inHunk = false;
	for (const line of text.split("\n")) {
		if (line.startsWith("@@")) {
			inHunk = true;
			out.push({ kind: "hunk", text: line });
		} else if (!inHunk || line.startsWith("\\")) {
		} else if (line.startsWith("+")) out.push({ kind: "add", text: line.slice(1) });
		else if (line.startsWith("-")) out.push({ kind: "del", text: line.slice(1) });
		else if (line.startsWith(" ")) out.push({ kind: "ctx", text: line.slice(1) });
	}
	return out;
}

/** A unified diff. A sign in the gutter and a tint mark each changed line. */
export function DiffView({
	text,
	binary,
	truncated,
	label,
	binaryLabel,
	truncatedLabel,
}: {
	text: string;
	binary?: boolean;
	truncated?: boolean;
	/** The accessible name of the region. */
	label: string;
	binaryLabel: string;
	truncatedLabel: string;
}) {
	const lines = parseDiff(text);
	return (
		<section aria-label={label} className="overflow-x-auto font-mono text-12">
			{binary ? <p className="px-3 py-1 text-n-11">{binaryLabel}</p> : null}
			{lines.map((l, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: the lines never reorder
				<div key={i} data-kind={l.kind} className={cn("flex whitespace-pre", TONE[l.kind])}>
					<span aria-hidden="true" className="w-5 shrink-0 text-center select-none">
						{SIGN[l.kind]}
					</span>
					<span className="pr-3">{l.text}</span>
				</div>
			))}
			{truncated ? <p className="px-3 py-1 text-n-11">{truncatedLabel}</p> : null}
		</section>
	);
}
