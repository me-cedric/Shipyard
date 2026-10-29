import { cn } from "@/lib/utils";
import { Avatar } from "../atoms/avatar";
import { type Status, StatusDot } from "../atoms/status-dot";

export type WorkCategory = "todo" | "in-progress" | "done";

/** The status shape follows the category: dash, ring, circle. The name of the status is the label. */
const DOT: Record<WorkCategory, Status> = { todo: "idle", "in-progress": "info", done: "success" };

export function CategoryDot({ category, label }: { category: WorkCategory; label: string }) {
	return <StatusDot status={DOT[category]} label={label} />;
}

/** The assignee of a ticket: a small avatar and the name. A name that the team lacks has a warning mark. */
export function Assignee({ name, unknown }: { name: string; unknown?: string }) {
	return (
		<span className="flex min-w-0 items-center gap-1.5 text-ui text-n-11">
			<Avatar name={name} className="size-5 text-[10px]" />
			<span className="truncate">{name}</span>
			{unknown ? <StatusDot status="warning" label={unknown} className="size-2" /> : null}
		</span>
	);
}

/** One mirrored ticket on one 28 px line. The whole line opens the ticket. */
export function TicketRow({
	itemKey,
	title,
	status,
	category,
	assignee,
	unknown,
	claimed,
	selected,
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
	onOpen: () => void;
}) {
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
