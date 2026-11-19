import { useGuard } from "@/features/work/guard";
import { useFactoryWrites, useKillSwitch } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { Switch } from "@/ui/atoms/switch";

/**
 * The global kill switch as one toggle in a white pill: on, the agents work; off, every run stops
 * (factory REQ-031, `spec:app-redesign#REQ-016`).
 */
export function AgentsToggle() {
	const { t } = useI18n();
	const f = t.factory;
	const kill = useKillSwitch().data;
	const writes = useFactoryWrites();
	const { error, run } = useGuard();
	if (kill === undefined) return null;
	return (
		<span className="flex items-center gap-2">
			<span className="inline-flex min-h-control items-center rounded-md border border-n-7 bg-surface-2 px-4 font-semibold text-n-12">
				<Switch
					label={kill ? f.agentsStopped : f.agentsOn}
					checked={!kill}
					onCheckedChange={(on) => void run(() => writes.killSwitch(!on))}
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
