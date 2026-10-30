import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { ArrowPathIcon } from "@/ui/icons";
import { ConnectionRow } from "@/ui/molecules/connection-row";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { runnerKeys } from "./keys";

/** The agent CLIs on this machine: detected with a version, or missing. No manual step. */
export function RunnersGroup() {
	const { t } = useI18n();
	const runners = useQuery({
		queryKey: runnerKeys.list,
		queryFn: () => unwrap(commands.runnersList()),
	});
	const [busy, setBusy] = useState<string | null>(null);
	const [failure, setFailure] = useState<unknown>(null);
	if (!runners.data && !runners.error) return null;
	// One click installs the CLI. Node comes first when the machine lacks it, as in Settings / Health.
	const install = async (id: string) => {
		setBusy(id);
		setFailure(null);
		try {
			await unwrap(commands.runnerInstall(id, true));
			await runners.refetch();
		} catch (e) {
			setFailure(e);
		} finally {
			setBusy(null);
		}
	};
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
			<ErrorNotice error={runners.error ?? failure} className="px-3" />
			{(runners.data ?? []).map((r) => (
				<ConnectionRow
					key={r.id}
					status={r.state === "detected" ? "success" : "idle"}
					statusLabel={t.connections.runner.state[r.state]}
					name={r.label}
					product={r.version ?? undefined}
					actions={
						r.state === "missing" ? (
							<Button disabled={busy !== null} onClick={() => void install(r.id)}>
								{format(t.settings.tools.install, { name: r.label })}
							</Button>
						) : null
					}
				/>
			))}
		</section>
	);
}
