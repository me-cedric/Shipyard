import type { ReactNode } from "react";
import { Button } from "../atoms/button";
import { InboxIcon } from "../icons";

/** A muted icon, one short noun title and one action. Ghost rows are for loading only. */
export function EmptyState({
	title,
	action,
	icon,
}: {
	title: string;
	action: { label: string; icon?: ReactNode; onClick: () => void };
	/** The icon of the page, so that two empty pages do not look the same. */
	icon?: ReactNode;
}) {
	return (
		<div className="flex flex-col items-center gap-3 py-8">
			<span aria-hidden="true" className="flex text-n-9">
				{icon ?? <InboxIcon size={28} />}
			</span>
			<p className="text-14 font-medium text-n-11">{title}</p>
			<Button variant="primary" onClick={action.onClick}>
				{action.icon}
				{action.label}
			</Button>
		</div>
	);
}
