import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "../atoms/badge";
import { type Status, StatusDot } from "../atoms/status-dot";
import { ContextMenu, type MenuItem } from "./context-menu";

/** The chip tint of a status. */
const TINT: Record<Status, "success" | "warning" | "danger" | "info" | "neutral"> = {
	success: "success",
	warning: "warning",
	danger: "danger",
	info: "info",
	active: "info",
	idle: "neutral",
};

/** A status as a tinted chip. The shape names the state; the text repeats it for the eye. */
function StateChip({ status, label }: { status: Status; label: string }) {
	return (
		<Badge variant={TINT[status]}>
			<StatusDot status={status} label={label} className="size-2" />
			<span aria-hidden="true">{label}</span>
		</Badge>
	);
}

/**
 * One pull request on two lines: its ref, title and draft mark, then the CI and review states as
 * tinted chips and the meta (time, runs). Each state has a shape.
 */
export function PullRow({
	reference,
	title,
	draft,
	ci,
	ciLabel,
	review,
	reviewLabel,
	meta,
	selected,
	onSelect,
	menu,
}: {
	reference: string;
	title: string;
	/** The draft label. Absent when the pull request is ready. */
	draft?: string;
	ci: Status;
	ciLabel: string;
	review: Status;
	reviewLabel: string;
	/** Right of the chips: the update time, the runs. */
	meta?: ReactNode;
	selected?: boolean;
	onSelect: () => void;
	menu?: MenuItem[];
}) {
	return (
		<ContextMenu items={menu}>
			<button
				type="button"
				onClick={onSelect}
				aria-current={selected || undefined}
				className={cn(
					"flex w-full flex-col gap-1.5 border-b px-3 py-2 text-left text-ui transition-colors duration-(--duration-fast) last:border-b-0 hover:bg-n-3",
					selected && "bg-accent-soft",
				)}
			>
				<span className="flex w-full items-center gap-2">
					<span className="shrink-0 font-mono text-12 text-n-11">{reference}</span>
					<span className="min-w-0 flex-1 truncate text-n-12">{title}</span>
					{draft ? <Badge>{draft}</Badge> : null}
				</span>
				<span className="flex w-full items-center gap-1.5">
					<StateChip status={ci} label={ciLabel} />
					<StateChip status={review} label={reviewLabel} />
					<span className="ml-auto flex items-center gap-2 text-12 text-n-11">{meta}</span>
				</span>
			</button>
		</ContextMenu>
	);
}
