import { useGuard } from "@/features/work/guard";
import { useFactoryWrites, useKillSwitch } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import { Switch } from "@/ui/atoms/switch";

/** The global kill switch as one toggle: on, the agents work; off, every run stops (factory REQ-031). */
export function AgentsToggle() {
	const { t } = useI18n();
	const f = t.factory;
	const kill = useKillSwitch().data;
	const writes = useFactoryWrites();
	const { error, run } = useGuard();
	if (kill === undefined) return null;
	return (
		<span className="flex items-center gap-2">
			<Switch
				label={kill ? f.agentsStopped : f.agentsOn}
				checked={!kill}
				onCheckedChange={(on) => void run(() => writes.killSwitch(!on))}
				className={kill ? "border-danger bg-danger-soft" : undefined}
			/>
			{error ? (
				<span role="alert" className="text-ui text-danger-text">
					{error}
				</span>
			) : null}
		</span>
	);
}
