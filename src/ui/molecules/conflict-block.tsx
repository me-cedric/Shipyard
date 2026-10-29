import { cn } from "@/lib/utils";

export type ConflictChoice = "ours" | "theirs" | "both" | "neither";
const CHOICES: ConflictChoice[] = ["ours", "theirs", "both", "neither"];

/** One conflict block: the two texts side by side and the four choices. */
export function ConflictBlock({
	title,
	ours,
	theirs,
	choice,
	onChoose,
	labels,
}: {
	title: string;
	ours: string;
	theirs: string;
	choice: ConflictChoice | null;
	onChoose: (choice: ConflictChoice) => void;
	labels: Record<ConflictChoice, string>;
}) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
		<div role="group" aria-label={title} className="border-b">
			<div className="grid grid-cols-2 gap-px bg-n-6 font-mono text-12">
				<pre className="min-h-row overflow-x-auto bg-success-subtle px-3 py-1 text-success-text">
					{ours}
				</pre>
				<pre className="min-h-row overflow-x-auto bg-info-subtle px-3 py-1 text-info-text">
					{theirs}
				</pre>
			</div>
			<div className="flex gap-1 px-3 py-1">
				{CHOICES.map((c) => (
					<button
						key={c}
						type="button"
						aria-pressed={choice === c}
						onClick={() => onChoose(c)}
						className={cn(
							"inline-flex h-row items-center rounded-md border border-n-7 px-2 text-ui text-n-11 hover:bg-n-3",
							choice === c && "border-transparent bg-accent-subtle text-accent-text",
						)}
					>
						{labels[c]}
					</button>
				))}
			</div>
		</div>
	);
}
