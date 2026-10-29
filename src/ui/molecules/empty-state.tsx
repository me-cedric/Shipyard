import type { ReactNode } from "react";
import { Button } from "../atoms/button";
import { Skeleton } from "../atoms/skeleton";

const GHOST_ROWS = [0, 1, 2, 3, 4];

/** Five static ghost rows and one primary action. No sentence of help. */
export function EmptyState({
	action,
}: {
	action: { label: string; icon?: ReactNode; onClick: () => void };
}) {
	return (
		<div className="flex flex-col items-center gap-4">
			<div aria-hidden="true" className="flex w-full max-w-sm flex-col gap-1">
				{GHOST_ROWS.map((i) => (
					<Skeleton key={i} className="h-row" style={{ opacity: 1 - i * 0.18 }} />
				))}
			</div>
			<Button variant="primary" onClick={action.onClick}>
				{action.icon}
				{action.label}
			</Button>
		</div>
	);
}
