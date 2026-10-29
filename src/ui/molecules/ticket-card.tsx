import { cn } from "@/lib/utils";
import { StatusDot } from "../atoms/status-dot";
import { Assignee } from "./ticket-row";

/**
 * A card of the board. Drag it to a column, or press Shift with Left or Right to move it one
 * column. Enter opens the ticket.
 */
export function TicketCard({
	itemKey,
	title,
	assignee,
	unknown,
	claimed,
	selected,
	onOpen,
	onMove,
}: {
	itemKey: string;
	title: string;
	assignee?: string;
	unknown?: string;
	claimed?: string;
	selected?: boolean;
	onOpen: () => void;
	/** -1 is the column on the left, 1 the column on the right. */
	onMove: (step: -1 | 1) => void;
}) {
	return (
		<button
			type="button"
			draggable
			aria-current={selected ? "true" : undefined}
			onClick={onOpen}
			onDragStart={(e) => {
				e.dataTransfer.setData("text/plain", itemKey);
				e.dataTransfer.effectAllowed = "move";
			}}
			onKeyDown={(e) => {
				if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
					e.preventDefault();
					onMove(e.key === "ArrowLeft" ? -1 : 1);
				}
			}}
			className={cn(
				"flex w-full flex-col gap-1 rounded-md border border-n-7 bg-n-2 p-2 text-left hover:bg-n-3",
				selected && "bg-n-4",
			)}
		>
			<span className="flex items-center gap-2">
				<span className="flex-1 font-mono text-11 text-n-11">{itemKey}</span>
				{claimed ? <StatusDot status="active" label={claimed} /> : null}
			</span>
			<span className="line-clamp-2 text-ui">{title}</span>
			{assignee ? <Assignee name={assignee} unknown={unknown} /> : null}
		</button>
	);
}
