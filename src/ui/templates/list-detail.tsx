import type { ReactNode } from "react";

/**
 * The frame of a Work view: a toolbar, then the list. The detail of a row opens in the inspector
 * of the shell, so the list keeps the whole width.
 */
export function ListDetail({
	title,
	toolbar,
	children,
}: {
	/** The name of the view for assistive tools. */
	title: string;
	toolbar?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<h1 className="sr-only">{title}</h1>
			{toolbar ? (
				<div className="flex min-h-9 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1">
					{toolbar}
				</div>
			) : null}
			{children}
		</div>
	);
}
