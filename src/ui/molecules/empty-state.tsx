import type { ReactNode } from "react";
import { Button } from "../atoms/button";
import { Skeleton } from "../atoms/skeleton";

const GHOST_ROWS = [0, 1, 2, 3, 4];
const WIDTH = ["w-2/3", "w-1/2", "w-3/4", "w-2/5", "w-3/5"];

/** A still ghost of the real content (five rows or five cards) and one primary action. No sentence of help. */
export function EmptyState({
	action,
	layout = "rows",
}: {
	action: { label: string; icon?: ReactNode; onClick: () => void };
	layout?: "rows" | "cards";
}) {
	return (
		<div className="flex flex-col items-center gap-5 py-4">
			<div
				aria-hidden="true"
				className={
					layout === "cards"
						? "grid w-full max-w-md grid-cols-5 gap-2 mask-b-from-40%"
						: "flex w-full max-w-md flex-col gap-1.5 rounded-lg border border-dashed bg-surface-1 p-3 mask-b-from-30%"
				}
			>
				{GHOST_ROWS.map((i) =>
					layout === "cards" ? (
						<div key={i} className="flex h-20 flex-col gap-1.5 rounded-md border bg-surface-2 p-2">
							<Skeleton className="h-2 w-3/4" />
							<Skeleton className="h-2 w-1/2" />
						</div>
					) : (
						<div key={i} className="flex h-row items-center gap-2 rounded-md px-1">
							<Skeleton className="size-4 rounded-full" />
							<Skeleton className={`h-2 ${WIDTH[i]}`} />
							<Skeleton className="ml-auto h-2 w-8" />
						</div>
					),
				)}
			</div>
			<Button variant="primary" onClick={action.onClick}>
				{action.icon}
				{action.label}
			</Button>
		</div>
	);
}
