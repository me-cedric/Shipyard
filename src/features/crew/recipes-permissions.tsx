import { useQueryClient } from "@tanstack/react-query";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap, type WriteKind } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { syncKeys, useAutomation } from "@/lib/sync";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";
import { SettingsRow } from "@/ui/molecules/settings-row";

/**
 * The writes that a recipe makes with no question ("Do not ask again", `recipe_writes` of the
 * automation file). Remove saves the file with one kind less: the save only narrows this list, as
 * the form of Setup does. A recipe with no permission shows nothing.
 */
export function RecipePermissions({ recipe }: { recipe: string }) {
	const { t } = useI18n();
	const a = t.sync.automation;
	const qc = useQueryClient();
	const view = useAutomation().data;
	const { failure, run } = useGuard();
	const all = view?.automation.recipe_writes ?? {};
	const kinds = all[recipe] ?? [];
	// A file that cannot be read has no permission, and a save would replace it.
	if (!view || view.file === "invalid" || kinds.length === 0) return null;
	const remove = (kind: WriteKind) =>
		void run(async () => {
			await unwrap(
				commands.syncAutomationSave({
					...view.automation,
					// A recipe with no kind left goes out.
					recipe_writes: Object.fromEntries(
						Object.entries({ ...all, [recipe]: kinds.filter((k) => k !== kind) }).filter(
							([, left]) => left.length,
						),
					),
				}),
			);
			await qc.invalidateQueries({ queryKey: syncKeys.all });
		});
	return (
		<Panel title={t.factory.wf.permissions} flush className="shrink-0">
			{kinds.map((kind) => (
				<SettingsRow key={kind} label={a.kind[kind]}>
					<RightButton
						right="project.settings"
						variant="ghost"
						className="min-h-control"
						aria-label={format(a.removeKind, { kind: a.kind[kind], recipe })}
						onClick={() => remove(kind)}
					>
						{a.remove}
					</RightButton>
				</SettingsRow>
			))}
			<ErrorNotice error={failure} className="px-3 py-1" />
		</Panel>
	);
}
