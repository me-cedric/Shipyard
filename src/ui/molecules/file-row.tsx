import type { VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Badge, type badgeVariants } from "../atoms/badge";
import { Checkbox } from "../atoms/checkbox";

export type FileState =
	| "added"
	| "modified"
	| "deleted"
	| "renamed"
	| "typechange"
	| "untracked"
	| "conflicted";

// A letter and a colour together, so the mark never relies on colour alone.
const MARK: Record<
	FileState,
	{ letter: string; variant: NonNullable<VariantProps<typeof badgeVariants>["variant"]> }
> = {
	added: { letter: "A", variant: "success" },
	modified: { letter: "M", variant: "info" },
	deleted: { letter: "D", variant: "danger" },
	renamed: { letter: "R", variant: "accent" },
	typechange: { letter: "T", variant: "neutral" },
	untracked: { letter: "U", variant: "neutral" },
	conflicted: { letter: "!", variant: "warning" },
};

/**
 * One changed file, or one folder when `state` is absent. The row selects the file for its diff.
 * The checkbox adds it to a selection.
 */
export function FileRow({
	name,
	state,
	stateLabel,
	depth = 0,
	selected,
	onSelect,
	check,
}: {
	name: string;
	state?: FileState;
	/** The accessible name of the state mark. */
	stateLabel?: string;
	/** Folder levels above the row. */
	depth?: number;
	selected?: boolean;
	onSelect?: () => void;
	check?: { checked: boolean; label: string; onChange: (checked: boolean) => void };
}) {
	const mark = state ? MARK[state] : null;
	return (
		<div
			data-selected={selected || undefined}
			className="flex min-h-row items-center gap-2 pr-2 data-[selected]:bg-n-4 hover:bg-n-3"
			style={{ paddingLeft: `${0.5 + depth}rem` }}
		>
			{check ? (
				<Checkbox
					hideLabel
					label={check.label}
					checked={check.checked}
					onCheckedChange={(v) => check.onChange(v === true)}
				/>
			) : null}
			{mark ? (
				<Badge
					variant={mark.variant}
					role="img"
					aria-label={stateLabel}
					className="w-5 justify-center px-0"
				>
					{mark.letter}
				</Badge>
			) : null}
			<button
				type="button"
				onClick={onSelect}
				aria-current={selected || undefined}
				className={cn(
					"min-w-0 flex-1 truncate text-left text-ui",
					state ? "text-n-12" : "text-n-11",
				)}
			>
				{name}
			</button>
		</div>
	);
}
