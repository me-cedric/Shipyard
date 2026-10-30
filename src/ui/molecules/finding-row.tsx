import type { ReactNode } from "react";
import { Button } from "../atoms/button";
import { type Status, StatusDot } from "../atoms/status-dot";

/** One finding: its severity shape, its text, an optional source chip and an optional fix action. */
export function FindingRow({
	status,
	title,
	source,
	action,
	children,
}: {
	status: Status;
	title: string;
	source?: ReactNode;
	action?: { label: string; onClick: () => void };
	/** The preview of a fix, shown under the row. */
	children?: ReactNode;
}) {
	return (
		<div className="border-b last:border-b-0">
			<div className="flex min-h-11 items-center gap-3 px-3 py-1.5">
				<StatusDot status={status} />
				<span className="flex-1 text-ui text-n-12">{title}</span>
				{source}
				{action ? (
					<Button variant="ghost" className="border-n-7" onClick={action.onClick}>
						{action.label}
					</Button>
				) : null}
			</div>
			{children}
		</div>
	);
}
