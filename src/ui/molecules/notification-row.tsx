import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "../atoms/button";
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
	wrap,
	detail,
	detailLabel,
	onOpen,
	notice,
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
	/** The centre shows the whole body. A toast cuts it to one line. */
	wrap?: boolean;
	/** The long text, in a fold named `detailLabel`. */
	detail?: string;
	detailLabel?: string;
	/** The row opens its target. Without it the row is not a button. */
	onOpen?: () => void;
	/** The button of the notice (Retry, Open, Download). */
	notice?: { label: string; run: () => void };
}) {
	const clip = wrap ? "break-words" : "truncate";
	const text = (
		<>
			<span className={cn("block", clip, unread ? "font-medium text-n-12" : "text-n-11")}>
				{title}
			</span>
			{body ? <span className={cn("block text-12 text-n-11", clip)}>{body}</span> : null}
		</>
	);
	return (
		<div className="flex items-start gap-2 border-b px-3 py-2 text-ui">
			<span className="mt-1">
				<StatusDot status={SHAPE[kind]} label={kindLabel} />
			</span>
			<div className="min-w-0 flex-1">
				{onOpen ? (
					<button type="button" onClick={onOpen} className="block w-full text-left hover:underline">
						{text}
					</button>
				) : (
					<p>{text}</p>
				)}
				{detail ? (
					<details className="text-12 text-n-11">
						<summary className="cursor-pointer">{detailLabel}</summary>
						<pre className="whitespace-pre-wrap break-words font-mono">{detail}</pre>
					</details>
				) : null}
				{notice ? (
					<Button variant="ghost" onClick={notice.run}>
						{notice.label}
					</Button>
				) : null}
			</div>
			<span className="shrink-0 text-12 text-n-10">{time}</span>
			{action}
		</div>
	);
}
