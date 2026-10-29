import type { ReactNode } from "react";
import { Badge } from "../atoms/badge";
import { StatusDot } from "../atoms/status-dot";

export type WorkCategory = "todo" | "in-progress" | "done";

// The status name always shows as text, so the colour never carries the state alone.
const VARIANT = { todo: "neutral", "in-progress": "info", done: "success" } as const;

/** One mirrored ticket: key, title, status, assignee, and the actions of the row. */
export function WorkItemRow({
	itemKey,
	title,
	status,
	category,
	assignee,
	claimed,
	linked,
	actions,
	children,
}: {
	itemKey: string;
	title: string;
	status: string;
	category: WorkCategory;
	assignee?: string;
	/** The accessible name of the claim mark. A claimed ticket shows the mark. */
	claimed?: string;
	/** The ref chip of the local item that the ticket is linked to. */
	linked?: ReactNode;
	actions?: ReactNode;
	/** Under the row: a form. */
	children?: ReactNode;
}) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
		<div role="group" aria-label={itemKey} className="border-b">
			<div className="flex min-h-row flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1">
				{claimed ? <StatusDot status="active" label={claimed} /> : null}
				<span className="font-mono text-11 text-n-11">{itemKey}</span>
				<span className="min-w-32 flex-1 truncate text-ui">{title}</span>
				<Badge variant={VARIANT[category]}>{status}</Badge>
				{assignee ? <span className="text-ui text-n-11">{assignee}</span> : null}
				{linked}
				<span className="flex items-center gap-1">{actions}</span>
			</div>
			{children}
		</div>
	);
}
