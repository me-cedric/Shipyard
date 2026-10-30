import type { ReactNode } from "react";
import { PageHeader } from "../molecules/page-header";

/**
 * The frame of a Work view: a toolbar, then the list. The detail of a row opens in the inspector
 * of the shell, so the list keeps the whole width. With an `icon` the title shows as a page header
 * (visual language v2); without one it is for assistive tools only.
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
	/** The name of the view for assistive tools. */
	title: string;
	icon?: ReactNode;
	count?: number;
	chips?: ReactNode;
	/** The one primary action, in the page header. Needs an `icon`. */
	action?: ReactNode;
	toolbar?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{icon ? (
				<PageHeader icon={icon} title={title} count={count} chips={chips} action={action} />
			) : (
				<h1 className="sr-only">{title}</h1>
			)}
			{toolbar ? (
				<div
					className={
						icon
							? "flex min-h-9 shrink-0 flex-wrap items-center gap-2 px-4 pb-3"
							: "flex min-h-9 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1"
					}
				>
					{toolbar}
				</div>
			) : null}
			{children}
		</div>
	);
}
