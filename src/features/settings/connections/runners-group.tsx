import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { SetupCard, SetupRow, StatePill } from "../parts";
import { runnerKeys } from "./keys";

/**
 * The agent CLIs on this machine, one row each: ready, or missing with its install. No manual
 * step. The versions and Detect are in `RunnersMore`.
 */
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
	const rows = runners.data ?? [];
	return (
		<SetupCard id="connections-runner" title={t.connections.group.runner}>
			<ErrorNotice error={runners.error ?? failure} className="px-6" />
			{rows.map((r) => (
				<SetupRow key={r.id} label={r.label}>
					{r.state === "missing" ? (
						<ConfirmButton
							disabled={busy !== null}
							aria-label={format(t.settings.tools.install, { name: r.label })}
							confirm={format(t.onboarding.setup.action.installConfirm, {
								name: r.label,
								command: r.install,
							})}
							onConfirm={() => void install(r.id)}
						>
							{t.personal.setup.install}
						</ConfirmButton>
					) : (
						<StatePill state="ready" />
					)}
				</SetupRow>
			))}
		</SetupCard>
	);
}

/** The versions of the AI tools and Detect: under the More card of the page, not in the card of the tools. */
export function RunnersMore() {
	const { t } = useI18n();
	const runners = useQuery({
		queryKey: runnerKeys.list,
		queryFn: () => unwrap(commands.runnersList()),
	});
	const rows = runners.data ?? [];
	return (
		<>
			<ul className="flex flex-col gap-1 px-6 pb-2 text-ui text-n-11">
				{rows.map((r) => (
					<li key={r.id}>
						{r.label}: {r.version ?? t.connections.runner.state[r.state]}
					</li>
				))}
			</ul>
			<div className="px-6">
				<Button
					variant="secondary"
					disabled={runners.isFetching}
					onClick={() => void runners.refetch()}
				>
					{t.connections.runner.detect}
				</Button>
			</div>
		</>
	);
}
