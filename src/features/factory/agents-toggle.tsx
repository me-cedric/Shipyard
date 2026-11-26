import { useGuard } from "@/features/work/guard";
import { useFactoryWrites, useKillSwitch } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { confirmDialog } from "@/lib/ipc";
import { Switch } from "@/ui/atoms/switch";

/** The global kill switch: its state, the write and the failure of the last write (factory REQ-031). */
export function useAgentsSwitch() {
	const kill = useKillSwitch().data;
	const writes = useFactoryWrites();
	const { t } = useI18n();
	const { error, failure, run } = useGuard();
	// Stopping every agent asks first; starting them again does not.
	const set = async (on: boolean) => {
		if (!on && !(await confirmDialog(t.factory.spendPage.confirmStopAll))) return;
		await run(() => writes.killSwitch(!on));
	};
	return { kill, error, failure, set: (on: boolean) => void set(on) };
}

/**
 * The global kill switch as one plain toggle with its label: on, the agents work; off, every run stops
 * (factory REQ-031, `spec:app-redesign#REQ-016`).
 */
export function AgentsToggle() {
	const { t } = useI18n();
	const f = t.factory;
	const { kill, error, set } = useAgentsSwitch();
	if (kill === undefined) return null;
	return (
		<span className="flex items-center gap-2">
			<span className="inline-flex min-h-control items-center font-semibold text-n-12">
				<Switch
					label={kill ? f.agentsStopped : f.agentsOn}
					checked={!kill}
					onCheckedChange={set}
					className={kill ? "border-danger bg-danger-soft" : "data-[checked]:bg-success-text"}
				/>
			</span>
			{error ? (
				<span role="alert" className="text-ui text-danger-text">
					{error}
				</span>
			) : null}
		</span>
	);
}
