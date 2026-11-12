import type { ReactNode } from "react";
import { Button } from "../atoms/button";
import { InboxIcon } from "../icons";

/** A muted icon, one short noun title and one action. Ghost rows are for loading only. */
export function EmptyState({
	title,
	action,
	extra,
	icon,
}: {
	title: ReactNode;
	action: { id?: string; label: string; icon?: ReactNode; onClick: () => void; busy?: boolean };
	/** More actions beside the main one. */
	extra?: ReactNode;
	/** The icon of the page, so that two empty pages do not look the same. */
	icon?: ReactNode;
}) {
	return (
		<div className="flex flex-col items-center gap-3 py-8">
			<span aria-hidden="true" className="flex text-n-9">
				{icon ?? <InboxIcon size={28} />}
			</span>
			<p className="text-14 font-medium text-n-11">{title}</p>
			<div className="flex flex-wrap justify-center gap-2">
				<Button
					id={action.id}
					variant="primary"
					disabled={action.busy}
					aria-busy={action.busy}
					onClick={action.onClick}
				>
					{action.icon}
					{action.label}
				</Button>
				{extra}
			</div>
		</div>
	);
}
