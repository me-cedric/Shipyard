import { useQuery } from "@tanstack/react-query";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { IconButton } from "@/ui/atoms/icon-button";
import { ArrowPathIcon } from "@/ui/icons";
import { ConnectionRow } from "@/ui/molecules/connection-row";
import { message, runnerKeys } from "./keys";

/** The agent CLIs on this machine: detected with a version, or missing. No manual step. */
export function RunnersGroup() {
	const { t } = useI18n();
	const runners = useQuery({
		queryKey: runnerKeys.list,
		queryFn: () => unwrap(commands.runnersList()),
	});
	if (!runners.data && !runners.error) return null;
	return (
		<section aria-labelledby="connections-runner" className="flex flex-col gap-2">
			<div className="flex items-center justify-between px-1">
				<h2 id="connections-runner" className="py-1 text-12 font-medium text-n-11">
					{format(t.count, {
						name: t.connections.group.runner,
						count: runners.data?.length ?? 0,
					})}
				</h2>
				<IconButton
					label={t.connections.runner.detect}
					disabled={runners.isFetching}
					onClick={() => void runners.refetch()}
				>
					<ArrowPathIcon size={14} />
				</IconButton>
			</div>
			{runners.error ? (
				<p role="alert" className="px-3 text-ui text-danger-text">
					{message(runners.error)}
				</p>
			) : null}
			{(runners.data ?? []).map((r) => (
				<ConnectionRow
					key={r.id}
					status={r.state === "detected" ? "success" : "idle"}
					statusLabel={t.connections.runner.state[r.state]}
					name={r.label}
					product={r.version ?? undefined}
					actions={null}
				/>
			))}
		</section>
	);
}
