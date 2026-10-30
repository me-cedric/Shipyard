import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "../atoms/badge";
import { LiveDot } from "../atoms/live-dot";
import { type Status, StatusDot } from "../atoms/status-dot";
import { ContextMenu, type MenuItem } from "./context-menu";

/** The tint of the logo tile and of the state chip, from the state shape. */
const TONE: Record<
	Status,
	{ tile: string; chip: "success" | "warning" | "danger" | "info" | "neutral" }
> = {
	success: { tile: "bg-success-soft text-success-text", chip: "success" },
	warning: { tile: "bg-warning-soft text-warning-text", chip: "warning" },
	danger: { tile: "bg-danger-soft text-danger-text", chip: "danger" },
	info: { tile: "bg-info-soft text-info-text", chip: "info" },
	active: { tile: "bg-accent-soft text-accent-text", chip: "info" },
	idle: { tile: "bg-n-3 text-n-11", chip: "neutral" },
};

/**
 * One connection as a card: a logo glyph (the first letter of the product or the name), the name
 * and the product, the live state, the flags and the actions.
 */
export function ConnectionRow({
	status,
	statusLabel,
	name,
	product,
	flags,
	actions,
	children,
	menu,
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
	menu?: MenuItem[];
}) {
	const tone = TONE[status] ?? TONE.idle;
	const glyph = (product && /^\p{L}/u.test(product) ? product : name).slice(0, 1).toUpperCase();
	return (
		<ContextMenu items={menu}>
			{/* biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box */}
			<div
				role="group"
				aria-label={name}
				className="rounded-lg border bg-surface-2 shadow-1 transition-shadow duration-(--duration-base) hover:shadow-2"
			>
				<div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
					<span
						aria-hidden="true"
						className={cn(
							"flex size-8 shrink-0 items-center justify-center rounded-md font-mono text-14",
							tone.tile,
						)}
					>
						{glyph}
					</span>
					<span className="flex min-w-24 flex-1 flex-col">
						<span className="text-ui font-medium text-n-12">{name}</span>
						{product ? <span className="text-12 text-n-11">{product}</span> : null}
					</span>
					<Badge variant={tone.chip} className="gap-1.5">
						{status === "success" ? (
							<LiveDot label={statusLabel} className="bg-success" />
						) : (
							<StatusDot status={status} label={statusLabel} />
						)}
						<span aria-hidden="true">{statusLabel}</span>
					</Badge>
					<span className="flex items-center gap-1">{actions}</span>
				</div>
				{flags ? <div className="border-t px-3 py-1.5">{flags}</div> : null}
				{children}
			</div>
		</ContextMenu>
	);
}
