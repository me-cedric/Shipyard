import type { ReactNode } from "react";
import { Button } from "../atoms/button";
import { InboxIcon } from "../icons";

/** A muted icon, one short noun title and one action. Ghost rows are for loading only. */
export function EmptyState({
	title,
	action,
}: {
	title: string;
	action: { label: string; icon?: ReactNode; onClick: () => void };
}) {
	return (
		<div className="flex flex-col items-center gap-3 py-8">
			<span aria-hidden="true" className="flex text-n-9">
				<InboxIcon size={28} />
			</span>
			<p className="text-14 font-medium text-n-11">{title}</p>
			<Button variant="primary" onClick={action.onClick}>
				{action.icon}
				{action.label}
			</Button>
		</div>
	);
}
