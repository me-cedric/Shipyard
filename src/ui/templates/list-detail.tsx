import type { ReactNode } from "react";
import { PageHeader } from "../molecules/page-header";

/**
 * The frame of a Work view: a toolbar, then the list. The detail of a row opens in the inspector
 * of the shell, so the list keeps the whole width. The title and the icon show as the page header
 * of the tab (visual language v2, update-ux-declutter REQ-017).
 */
export function ListDetail({
	title,
	icon,
	count,
	chips,
	action,
	toolbar,
	children,
}: {
	title: string;
	icon: ReactNode;
	count?: number;
	chips?: ReactNode;
	/** The one primary action, in the page header. */
	action?: ReactNode;
	toolbar?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader icon={icon} title={title} count={count} chips={chips} action={action} />
			{toolbar ? (
				<div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2 px-4 pb-3">
					{toolbar}
				</div>
			) : null}
			{children}
		</div>
	);
}
