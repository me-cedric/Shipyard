import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuard } from "@/features/work/guard";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { Switch } from "@/ui/atoms/switch";
import { SettingsRow } from "@/ui/molecules/settings-row";

const key = ["auto-commit"] as const;

/**
 * Settings / Project: commit the pending changes before a sync and when the window closes
 * (Legacy `set_auto_commit`). The choice is personal, so it is kept in the app data folder.
 */
export function AutoCommit() {
	const { t } = useI18n();
	const qc = useQueryClient();
	const { error, run } = useGuard();
	const on = useQuery({ queryKey: key, queryFn: () => unwrap(commands.autoCommitGet()) });
	return (
		<>
			<SettingsRow label={t.ui.autoCommit}>
				<Switch
					label={t.ui.autoCommit}
					iconOnly
					checked={on.data === true}
					onCheckedChange={(next) =>
						void run(async () => {
							qc.setQueryData(key, await unwrap(commands.autoCommitSet(next)));
						})
					}
				/>
			</SettingsRow>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</>
	);
}
