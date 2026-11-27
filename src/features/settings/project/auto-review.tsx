import { useQueryClient } from "@tanstack/react-query";
import { useGuard } from "@/features/work/guard";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { type Automation, syncKeys, useAutomation } from "@/lib/sync";
import { Segmented } from "@/ui/atoms/segmented";
import { Switch } from "@/ui/atoms/switch";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { SetupRow } from "@/ui/molecules/setup-card";
import { Toggle } from "@/ui/molecules/setup-controls";

type Choice = "off" | "draft" | "post";

/**
 * Setup / This project: the agent review of each new pull request and head commit. It is one choice
 * of `.shipyard/automation.yaml`: off, Draft (the draft waits on the page) or Post (a comment
 * review, never an approval). The switch turns it on as a draft.
 */
export function AutoReview({ inline }: { inline?: boolean }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const { failure, run } = useGuard();
	const view = useAutomation().data;
	const label = t.forge.agent.auto;
	const value: Choice = view?.automation.auto_review ?? "off";
	const save = (next: Choice) =>
		void run(async () => {
			if (!view) return;
			const automation: Automation = { ...view.automation, auto_review: next };
			await unwrap(commands.syncAutomationSave(automation));
			await qc.invalidateQueries({ queryKey: syncKeys.all });
		});
	const mode =
		value === "off" ? null : (
			<span className="w-44">
				<Segmented
					label={t.doctor.project.reviewMode}
					value={value}
					onValueChange={save}
					items={(["draft", "post"] as const).map((o) => ({
						value: o,
						label: t.forge.agent.autoOptions[o],
					}))}
				/>
			</span>
		);
	const control = {
		label,
		checked: value !== "off",
		onCheckedChange: (on: boolean) => save(on ? "draft" : "off"),
	};
	return (
		<>
			{inline ? (
				<>
					<Switch size="sm" {...control} label={t.doctor.project.autoReview} />
					{mode}
				</>
			) : (
				<SetupRow label={t.doctor.project.autoReview}>
					{mode}
					<Toggle {...control} />
				</SetupRow>
			)}
			<ErrorNotice error={failure} className="px-6 pb-2" />
		</>
	);
}
