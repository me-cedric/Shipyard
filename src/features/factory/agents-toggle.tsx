import { useGuard } from "@/features/work/guard";
import { useFactoryWrites, useKillSwitch } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { Switch } from "@/ui/atoms/switch";

/** The global kill switch: its state, the write and the failure of the last write (factory REQ-031). */
export function useAgentsSwitch() {
	const kill = useKillSwitch().data;
	const writes = useFactoryWrites();
	const { error, failure, run } = useGuard();
	return { kill, error, failure, set: (on: boolean) => void run(() => writes.killSwitch(!on)) };
}

/**
 * The global kill switch as one toggle in a white pill: on, the agents work; off, every run stops
 * (factory REQ-031, `spec:app-redesign#REQ-016`).
 */
export function AgentsToggle() {
	const { t } = useI18n();
	const f = t.factory;
	const { kill, error, set } = useAgentsSwitch();
	if (kill === undefined) return null;
	return (
		<span className="flex items-center gap-2">
			<span className="inline-flex min-h-control items-center rounded-md border border-n-7 bg-surface-2 px-4 font-semibold text-n-12">
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
