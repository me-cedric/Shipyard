import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { type Status, StatusDot } from "../atoms/status-dot";

export type StepStatus = "pending" | "running" | "gate" | "done" | "failed";

export const STEP_STATUS: Record<StepStatus, Status> = {
	pending: "idle",
	running: "active",
	gate: "warning",
	done: "success",
	failed: "danger",
};

const RING: Record<StepStatus, string> = {
	pending: "border-n-7 bg-n-2 text-n-11",
	running: "border-accent bg-surface-2 text-n-12 shadow-glow",
	gate: "border-warning bg-warning-soft text-n-12",
	done: "border-success/60 bg-success-soft text-n-12",
	failed: "border-danger bg-danger-soft text-n-12",
};

/** One step of a run: its shape and colour for the state, its id, and the units of a `for_each` step. Only a running step moves and glows. */
export function RunStep({
	id,
	state,
	units,
}: {
	id: string;
	state: StepStatus;
	/** The number of children of a `for_each` step. Omit it for another step. */
	units?: number;
}) {
	const { t } = useI18n();
	return (
		<figure
			aria-label={id}
			data-state={state}
			className={cn(
				"m-0 flex h-8 items-center gap-2 rounded-md border px-2.5 text-ui",
				RING[state],
			)}
		>
			<StatusDot status={STEP_STATUS[state]} label={t.factory.step[state]} />
			<span className="font-mono text-12">{id}</span>
			{units ? (
				<span className="font-mono text-11 text-n-11">
					{t.factory.units} {units}
				</span>
			) : null}
		</figure>
	);
}
