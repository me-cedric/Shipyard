import { useQueryClient } from "@tanstack/react-query";
import { useGuard } from "@/features/work/guard";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { type Automation, syncKeys, useAutomation } from "@/lib/sync";
import { Select } from "@/ui/atoms/select";
import { SettingsRow } from "@/ui/molecules/settings-row";

const OPTIONS = ["off", "draft", "post"] as const;

/**
 * Settings / Project: the agent review of each new pull request and head commit. It is one choice
 * of `.shipyard/automation.yaml`: Off, Draft (the draft waits on the page) or Post (a comment
 * review, never an approval).
 */
export function AutoReview() {
	const { t } = useI18n();
	const qc = useQueryClient();
	const { error, run } = useGuard();
	const view = useAutomation().data;
	const label = t.forge.agent.auto;
	const save = (next: (typeof OPTIONS)[number]) =>
		void run(async () => {
			if (!view) return;
			const automation: Automation = { ...view.automation, auto_review: next };
			await unwrap(commands.syncAutomationSave(automation));
			await qc.invalidateQueries({ queryKey: syncKeys.all });
		});
	return (
		<>
			<SettingsRow label={label}>
				<Select
					label={label}
					value={view?.automation.auto_review ?? "off"}
					onValueChange={(v) => save(v as (typeof OPTIONS)[number])}
					items={OPTIONS.map((o) => ({ value: o, label: t.forge.agent.autoOptions[o] }))}
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
