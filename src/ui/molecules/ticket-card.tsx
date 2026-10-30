import { motion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "../atoms/badge";
import { type Status, StatusDot } from "../atoms/status-dot";
import { SPRING } from "../motion";
import { ContextMenu, type MenuItem } from "./context-menu";
import { Assignee, PriorityGlyph, type PriorityLevel } from "./ticket-row";

const RUN_BADGE = {
	active: "accent",
	success: "success",
	warning: "warning",
	danger: "danger",
	info: "info",
	idle: "neutral",
} as const satisfies Record<Status, string>;

/**
 * A card of the board. Drag it to a column, or press Shift with Left or Right to move it one
 * column. Enter opens the ticket. A move springs the card to its new place.
 */
export function TicketCard({
	itemKey,
	title,
	assignee,
	unknown,
	claimed,
	selected,
	labels,
	priority,
	run,
	estimate,
	onOpen,
	onMove,
	menu,
}: {
	itemKey: string;
	title: string;
	assignee?: string;
	unknown?: string;
	claimed?: string;
	selected?: boolean;
	labels?: string[];
	priority?: { level: PriorityLevel; label: string };
	run?: { label: string; status: Status };
	/** The estimate as text: `3 d`. */
	estimate?: string;
	onOpen: () => void;
	/** -1 is the column on the left, 1 the column on the right. */
	onMove: (step: -1 | 1) => void;
	menu?: MenuItem[];
}) {
	const [dragging, setDragging] = useState(false);
	return (
		<ContextMenu items={menu}>
			<motion.div
				layout
				layoutId={itemKey}
				transition={SPRING.smooth}
				whileHover={{ y: -2 }}
				whileTap={{ scale: 0.98 }}
				animate={{ opacity: dragging ? 0.45 : 1, scale: dragging ? 0.97 : 1 }}
				className="shrink-0"
			>
				<button
					type="button"
					draggable
					aria-current={selected ? "true" : undefined}
					onClick={onOpen}
					onDragStart={(e) => {
						e.dataTransfer.setData("text/plain", itemKey);
						e.dataTransfer.effectAllowed = "move";
						setDragging(true);
					}}
					onDragEnd={() => setDragging(false)}
					onKeyDown={(e) => {
						if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
							e.preventDefault();
							onMove(e.key === "ArrowLeft" ? -1 : 1);
						}
					}}
					className={cn(
						"flex w-full cursor-grab flex-col gap-2 rounded-lg border bg-surface-2 p-2.5 text-left shadow-1 transition-shadow duration-(--duration-base) hover:shadow-2 focus-visible:shadow-glow active:cursor-grabbing",
						selected && "border-accent shadow-glow",
					)}
				>
					{/* The title leads; the ref stays for assistive tools and behind Copy reference in the menu. */}
					<span className="flex items-start gap-2">
						{priority ? (
							<span className="flex h-5 items-center">
								<PriorityGlyph level={priority.level} label={priority.label} />
							</span>
						) : null}
						<span className="line-clamp-2 flex-1 text-ui font-medium text-n-12">
							{title}
							<span className="sr-only"> {itemKey}</span>
						</span>
						{claimed ? <StatusDot status="active" label={claimed} /> : null}
					</span>
					{run ? (
						<span className="flex">
							<Badge variant={RUN_BADGE[run.status]}>
								<StatusDot status={run.status} label={run.label} className="size-2" />
								{run.label}
							</Badge>
						</span>
					) : null}
					{labels?.length ? (
						<span className="flex flex-wrap gap-1">
							{labels.map((l) => (
								<Badge key={l} className="rounded-full">
									{l}
								</Badge>
							))}
						</span>
					) : null}
					{assignee || estimate ? (
						<span className="flex items-center gap-2">
							<span className="min-w-0 flex-1">
								{assignee ? <Assignee name={assignee} unknown={unknown} /> : null}
							</span>
							{estimate ? <Badge className="font-mono">{estimate}</Badge> : null}
						</span>
					) : null}
				</button>
			</motion.div>
		</ContextMenu>
	);
}
