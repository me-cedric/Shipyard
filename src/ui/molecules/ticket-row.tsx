import { cn } from "@/lib/utils";
import { Avatar } from "../atoms/avatar";
import { Badge } from "../atoms/badge";
import { type Status, StatusDot } from "../atoms/status-dot";

export type WorkCategory = "todo" | "in-progress" | "done";

const RUN_BADGE = {
	active: "accent",
	success: "success",
	warning: "warning",
	danger: "danger",
	info: "info",
	idle: "neutral",
} as const satisfies Record<Status, string>;

/** The status shape follows the category: dash, ring, circle. The name of the status is the label. */
const DOT: Record<WorkCategory, Status> = { todo: "idle", "in-progress": "info", done: "success" };

export function CategoryDot({ category, label }: { category: WorkCategory; label: string }) {
	return <StatusDot status={DOT[category]} label={label} />;
}

/** The assignee of a ticket: a small avatar and the name. A name that the team lacks has a warning mark. */
export function Assignee({ name, unknown }: { name: string; unknown?: string }) {
	return (
		<span className="flex min-w-0 items-center gap-1.5 text-ui text-n-11">
			<Avatar name={name} className="size-5 text-11" />
			<span className="truncate">{name}</span>
			{unknown ? <StatusDot status="warning" label={unknown} className="size-2" /> : null}
		</span>
	);
}

/** 0 is urgent, 3 is low. */
export type PriorityLevel = 0 | 1 | 2 | 3;

const PRIORITY: [RegExp, PriorityLevel][] = [
	[/^(p0|urgent|critical|blocker|highest)$/, 0],
	[/^(p1|high)$/, 1],
	[/^(p2|medium|normal)$/, 2],
	[/^(p3|p4|low|lowest|minor)$/, 3],
];

/** The priority that the labels of a ticket carry (`p1`, `priority:high`, `urgent`), or null. */
export function priorityOf(labels: string[]): PriorityLevel | null {
	for (const l of labels) {
		const v = l.toLowerCase().replace(/^priority[:/ _-]?/, "");
		for (const [re, level] of PRIORITY) if (re.test(v)) return level;
	}
	return null;
}

/** Three bars, filled by priority; urgent is a red square with a mark. */
export function PriorityGlyph({ level, label }: { level: PriorityLevel; label: string }) {
	return (
		<svg role="img" aria-label={label} viewBox="0 0 12 12" className="size-3 shrink-0">
			{level === 0 ? (
				<>
					<rect x="0.5" y="0.5" width="11" height="11" rx="2.5" className="fill-danger" />
					<rect x="5.25" y="2.5" width="1.5" height="4.5" rx="0.75" className="fill-surface-0" />
					<rect x="5.25" y="8.25" width="1.5" height="1.5" rx="0.75" className="fill-surface-0" />
				</>
			) : (
				[0, 1, 2].map((i) => (
					<rect
						key={i}
						x={1 + i * 3.75}
						y={8 - i * 3}
						width="2.5"
						height={3 + i * 3}
						rx="0.75"
						className={i < 4 - level ? "fill-n-11" : "fill-n-6"}
					/>
				))
			)}
		</svg>
	);
}

/** One mirrored ticket on one line. The whole line opens the ticket. A `rich` row is 40 px and shows the labels, the run, the estimate and the priority. */
export function TicketRow({
	itemKey,
	title,
	status,
	category,
	assignee,
	unknown,
	claimed,
	selected,
	rich,
	labels,
	priority,
	run,
	estimate,
	onOpen,
}: {
	itemKey: string;
	title: string;
	status: string;
	category: WorkCategory;
	assignee?: string;
	/** The accessible name of the warning for an assignee that the team lacks. */
	unknown?: string;
	/** The accessible name of the run mark. A claimed ticket shows it. */
	claimed?: string;
	selected?: boolean;
	rich?: boolean;
	labels?: string[];
	priority?: { level: PriorityLevel; label: string };
	/** The state of the last run on the ticket. */
	run?: { label: string; status: Status };
	/** The estimate as text: `3 d`. */
	estimate?: string;
	onOpen: () => void;
}) {
	if (rich)
		return (
			// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
			<div
				role="group"
				aria-label={itemKey}
				className={cn(
					"relative flex h-10 items-center border-b transition-colors duration-(--duration-fast) hover:bg-n-3",
					selected && "bg-accent-soft",
				)}
			>
				{selected ? (
					<span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent-gradient" />
				) : null}
				<button
					type="button"
					data-nav=""
					aria-current={selected ? "true" : undefined}
					onClick={onOpen}
					className="flex h-full min-w-0 flex-1 items-center gap-3 px-4 text-left"
				>
					<span className="flex w-3 shrink-0 justify-center">
						{priority ? <PriorityGlyph level={priority.level} label={priority.label} /> : null}
					</span>
					<CategoryDot category={category} label={status} />
					<span className="w-20 shrink-0 truncate font-mono text-11 text-n-11">{itemKey}</span>
					<span className="min-w-0 truncate text-ui text-n-12">{title}</span>
					<span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
						{labels?.map((l) => (
							<Badge key={l} className="rounded-full">
								{l}
							</Badge>
						))}
					</span>
					{claimed ? <StatusDot status="active" label={claimed} /> : null}
					{run ? (
						<Badge variant={RUN_BADGE[run.status]}>
							<StatusDot status={run.status} label={run.label} className="size-2" />
							{run.label}
						</Badge>
					) : null}
					<span className="w-12 shrink-0 text-right font-mono text-11 text-n-11">
						{estimate ?? ""}
					</span>
					<span className="flex w-36 shrink-0 justify-end">
						{assignee ? <Assignee name={assignee} unknown={unknown} /> : null}
					</span>
				</button>
			</div>
		);
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
		<div
			role="group"
			aria-label={itemKey}
			className={cn("flex h-row items-center border-b hover:bg-n-3", selected && "bg-n-4")}
		>
			<button
				type="button"
				data-nav=""
				aria-current={selected ? "true" : undefined}
				onClick={onOpen}
				className="flex h-full min-w-0 flex-1 items-center gap-3 px-3 text-left"
			>
				<CategoryDot category={category} label={status} />
				<span className="w-20 shrink-0 truncate font-mono text-11 text-n-11">{itemKey}</span>
				<span className="min-w-0 flex-1 truncate text-ui">{title}</span>
				{claimed ? <StatusDot status="active" label={claimed} /> : null}
				{assignee ? <Assignee name={assignee} unknown={unknown} /> : null}
			</button>
		</div>
	);
}
