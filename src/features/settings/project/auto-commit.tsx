import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGuard } from "@/features/work/guard";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useRights } from "@/lib/rights";
import { Switch } from "@/ui/atoms/switch";
import { SetupRow, Toggle } from "../parts";

const key = ["auto-commit"] as const;

/**
 * Settings / Project: commit the pending changes before a sync and when the window closes
 *. The choice is personal, so it is kept in the app data folder.
 */
export function AutoCommit({ inline }: { inline?: boolean }) {
	const { t } = useI18n();
	const { gate } = useRights();
	const qc = useQueryClient();
	const { error, run } = useGuard();
	const on = useQuery({ queryKey: key, queryFn: () => unwrap(commands.autoCommitGet()) });
	const control = {
		label: t.ui.autoCommit,
		// Off only takes a write away: it needs no right.
		...(on.data === true ? {} : gate("code.write")),
		checked: on.data === true,
		onCheckedChange: (next: boolean) =>
			void run(async () => {
				qc.setQueryData(key, await unwrap(commands.autoCommitSet(next)));
			}),
	};
	return (
		<>
			{inline ? (
				<Switch size="sm" {...control} />
			) : (
				<SetupRow label={t.ui.autoCommit}>
					<Toggle {...control} />
				</SetupRow>
			)}
			{error ? (
				<p role="alert" className="px-6 pb-2 text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</>
	);
}
