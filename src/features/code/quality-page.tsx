import { Popover } from "@base-ui/react/popover";
import type { ComponentProps, ReactNode } from "react";
import type { QualityReport } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { StatusDot } from "@/ui/atoms/status-dot";
import { CheckIcon, InformationCircleIcon } from "@/ui/icons";
import { ATTENTION_CHIP, ATTENTION_FRAME } from "@/ui/molecules/attention-card";
import { RunLive } from "./quality-live";

/** The name of the check that verifies all docs, as the backend gives it. */
export const VERIFY_DOCS = "verify all docs";
/** The check that lists the docs that did not follow the code, as the backend names it. */
export const DOCS_FRESH = "docs freshness";

export type Row = {
	name: string;
	label?: string | null;
	command?: string;
	available: boolean;
	last: QualityReport | null;
};

export type GateStatus = "active" | "success" | "warning" | "danger" | "idle";

/** The tool that the app installs, by the program that a failed check could not find. */
export const TOOLS: Record<string, string> = {
	pnpm: "pnpm",
	node: "node",
	npm: "node",
	git: "git",
	cargo: "rust",
};
export const MISSING = /^(\S+) is not installed or not found$/;

/** The info text of a check, by its command. Any other gate command has the generic text. */
export function infoKey(r: Row, kind: "check" | "scanner") {
	if (kind === "scanner") return r.name;
	const id = `${r.label ?? ""} ${r.name}`;
	return r.name === VERIFY_DOCS
		? "verifyDocs"
		: r.name === DOCS_FRESH
			? "docs"
			: /cargo fmt/.test(id)
				? "fmt"
				: /cargo clippy/.test(id)
					? "clippy"
					: /cargo test/.test(id)
						? "cargoTest"
						: /typecheck|tsc/.test(id)
							? "typecheck"
							: /lint/.test(id)
								? "lint"
								: /test/.test(id)
									? "test"
									: "generic";
}

/** A run that passed with findings is a warning; Failed is only for `passed: false`. */
export function statusOf(last: QualityReport | null, live: boolean): GateStatus {
	return live
		? "active"
		: !last
			? "idle"
			: !last.passed
				? "danger"
				: last.findings.length > 0
					? "warning"
					: "success";
}

/** The failing gates come first, then the ones with findings, then the rest. */
export const RANK: Record<GateStatus, number> = {
	danger: 0,
	warning: 1,
	idle: 2,
	active: 2,
	success: 3,
};

/** The mark of a state (screen 17): a warning triangle, a circle with a minus, or the check. */
function StateMark({ status }: { status: GateStatus }) {
	if (status === "success") return <CheckIcon size={20} />;
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			className="size-5"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
		>
			{status === "danger" || status === "warning" ? (
				<path d="M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
			) : (
				<>
					<circle cx="12" cy="12" r="9" />
					<path d="M8 12h8" />
				</>
			)}
		</svg>
	);
}

const TILE = {
	active: "bg-info-soft text-info-text",
	success: "bg-success-soft text-success-text",
	warning: ATTENTION_CHIP,
	danger: ATTENTION_CHIP,
	idle: "bg-n-3 text-n-11",
} as const;

/**
 * One gate as a square tile: the state icon, the name, the state in a pill, the action and the info
 * button. A gate that needs a fix has the attention outline. The command never shows here.
 */
export function GateTile({
	id,
	name,
	info,
	status,
	label,
	live,
	action,
	order,
}: {
	id: string;
	kind: "check" | "scanner";
	name: string;
	info: string[];
	status: GateStatus;
	label: string;
	live?: ComponentProps<typeof RunLive>["run"];
	action: ReactNode;
	/** The place in the grid: the failing tiles come first, whatever the kind. */
	order?: number;
}) {
	const { t } = useI18n();
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset draws a border and a legend; the tile is a labelled group, apart from the region of its detail
		<div
			id={id}
			role="group"
			aria-label={name}
			style={{ order }}
			className={cn(
				"flex min-h-52 flex-col gap-3 rounded-xl bg-surface-2 p-4.5 shadow-2",
				(status === "danger" || status === "warning") && ATTENTION_FRAME,
			)}
		>
			<span
				aria-hidden="true"
				className={cn("flex size-12 items-center justify-center rounded-field", TILE[status])}
			>
				<StateMark status={status} />
			</span>
			<h3 className="min-w-0 truncate text-20 font-semibold text-n-12 first-letter:uppercase">
				{name}
			</h3>
			<Badge
				className="self-start"
				variant={
					status === "idle"
						? "neutral"
						: status === "active"
							? "info"
							: status === "success"
								? "success"
								: "you"
				}
			>
				{/* The design shows the word only: the named image stays for a screen reader. */}
				<span className="sr-only">
					<StatusDot status={status} label={label} />
				</span>
				<span aria-hidden="true">{label}</span>
			</Badge>
			{live ? <RunLive run={live} name={name} /> : null}
			<div className="mt-auto flex items-center gap-2">
				{action}
				<Popover.Root>
					<Popover.Trigger
						aria-label={format(t.forge.quality.about, { name })}
						className="inline-flex size-(--control-h) shrink-0 cursor-pointer items-center justify-center rounded-md border border-n-7 text-n-11 hover:bg-n-3 hover:text-n-12"
					>
						<InformationCircleIcon size={20} />
					</Popover.Trigger>
					<Popover.Portal>
						<Popover.Positioner side="bottom" align="end" sideOffset={4} className="z-50">
							<Popover.Popup
								aria-label={format(t.forge.quality.about, { name })}
								className="flex w-72 flex-col gap-2 rounded-lg border border-n-6 bg-surface-3 p-3 text-ui text-n-12 shadow-3"
							>
								{info.map((line) => (
									<p key={line}>{line}</p>
								))}
							</Popover.Popup>
						</Popover.Positioner>
					</Popover.Portal>
				</Popover.Root>
			</div>
		</div>
	);
}
