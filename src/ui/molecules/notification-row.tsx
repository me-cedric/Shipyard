import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { type Status, StatusDot } from "../atoms/status-dot";

export type NoticeShape = "info" | "error" | "needs-you";

// A shape and a colour together: the kind never relies on colour alone.
export const SHAPE: Record<NoticeShape, Status> = {
	info: "info",
	error: "danger",
	"needs-you": "warning",
};

/** One event: the shape of its kind, the title, the body and the time. */
export function NotificationRow({
	kind,
	kindLabel,
	title,
	body,
	time,
	unread,
	action,
}: {
	kind: NoticeShape;
	/** The accessible name of the kind shape. */
	kindLabel: string;
	title: string;
	body?: string;
	/** Already formatted for the language. */
	time: string;
	unread?: boolean;
	/** The dismiss button of a toast. */
	action?: ReactNode;
}) {
	return (
		<div className="flex items-start gap-2 border-b px-3 py-2 text-ui">
			<span className="mt-1">
				<StatusDot status={SHAPE[kind]} label={kindLabel} />
			</span>
			<div className="min-w-0 flex-1">
				<p className={cn("truncate", unread ? "font-medium text-n-12" : "text-n-11")}>{title}</p>
				{body ? <p className="truncate text-12 text-n-11">{body}</p> : null}
			</div>
			<span className="shrink-0 text-12 text-n-10">{time}</span>
			{action}
		</div>
	);
}
