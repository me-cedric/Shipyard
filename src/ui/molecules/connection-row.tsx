import type { ReactNode } from "react";
import { Badge } from "../atoms/badge";
import { type Status, StatusDot } from "../atoms/status-dot";

/** One connection: its state shape, its name, its product, its flags and its actions. */
export function ConnectionRow({
	status,
	statusLabel,
	name,
	product,
	flags,
	actions,
	children,
}: {
	status: Status;
	/** Replaces the generic name of the status shape. */
	statusLabel: string;
	name: string;
	product?: string;
	flags?: ReactNode;
	actions: ReactNode;
	/** Under the row: a test result, a form or a list. */
	children?: ReactNode;
}) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
		<div role="group" aria-label={name} className="border-b">
			<div className="flex min-h-row flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1">
				<StatusDot status={status} label={statusLabel} />
				<span className="min-w-24 flex-1 text-ui">{name}</span>
				{product ? <Badge>{product}</Badge> : null}
				{flags}
				<span className="flex items-center gap-1">{actions}</span>
			</div>
			{children}
		</div>
	);
}
