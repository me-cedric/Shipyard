import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Row } from "@/ui/molecules/row";
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

/** The versions of the AI tools and Detect: under the More card of the page, one row each, as the other Setup rows. */
export function RunnersMore() {
	const { t } = useI18n();
	const runners = useQuery({
		queryKey: runnerKeys.list,
		queryFn: () => unwrap(commands.runnersList()),
	});
	const rows = runners.data ?? [];
	return (
		<>
			<SetupRow label={t.connections.group.runner}>
				<Button
					variant="secondary"
					disabled={runners.isFetching}
					onClick={() => void runners.refetch()}
				>
					{t.connections.runner.detect}
				</Button>
			</SetupRow>
			{rows.map((r) => (
				// A plain row: the card of the AI tools above holds the named group of each tool.
				<Row key={r.id}>
					<span className="min-w-0 font-semibold">{r.label}</span>
					<span className="ml-auto text-ui text-n-11">
						{r.version ?? t.connections.runner.state[r.state]}
					</span>
				</Row>
			))}
		</>
	);
}
