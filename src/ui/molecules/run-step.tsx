import { useI18n } from "@/lib/i18n";
import { type Status, StatusDot } from "../atoms/status-dot";

export type StepStatus = "pending" | "running" | "gate" | "done" | "failed";

export const STEP_STATUS: Record<StepStatus, Status> = {
	pending: "idle",
	running: "active",
	gate: "warning",
	done: "success",
	failed: "danger",
};

/** One step of a run: its shape and colour for the state, its id, and the units of a `for_each` step. Only a running step moves. */
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
			className="m-0 flex h-row items-center gap-2 rounded-md border border-n-7 bg-n-2 px-2 text-ui"
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
