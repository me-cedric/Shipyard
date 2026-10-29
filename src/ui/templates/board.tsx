import type { ReactNode } from "react";
import { ListDetail } from "./list-detail";

/** The frame of a board: a toolbar, then the columns side by side. They scroll sideways. */
export function Board({
	title,
	toolbar,
	children,
}: {
	title: string;
	toolbar?: ReactNode;
	children: ReactNode;
}) {
	return (
		<ListDetail title={title} toolbar={toolbar}>
			<div className="flex min-h-0 flex-1 gap-2 overflow-x-auto p-2">{children}</div>
		</ListDetail>
	);
}
