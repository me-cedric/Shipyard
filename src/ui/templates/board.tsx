import type { ReactNode } from "react";
import { ListDetail } from "./list-detail";

/** The frame of a board: a toolbar, then the columns side by side. They scroll sideways. */
export function Board({
	title,
	icon,
	count,
	toolbar,
	children,
}: {
	title: string;
	icon?: ReactNode;
	count?: number;
	toolbar?: ReactNode;
	children: ReactNode;
}) {
	return (
		<ListDetail title={title} icon={icon} count={count} toolbar={toolbar}>
			<div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4">{children}</div>
		</ListDetail>
	);
}
