import { useQueryClient } from "@tanstack/react-query";
import { nameOf } from "@/features/factory/runs/run-live";
import { SectionCard } from "@/features/factory/section-card";
import { Fr } from "@/features/factory/workflows/workflow-form";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap, type WriteKind } from "@/lib/ipc";
import { useRights } from "@/lib/rights";
import { syncKeys, useAutomation } from "@/lib/sync";
import { Segmented } from "@/ui/atoms/segmented";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { SettingsRow } from "@/ui/molecules/settings-row";

/**
 * The writes that a recipe makes with no question ("Do not ask again", `recipe_writes` of the
 * automation file). Remove saves the file at once with one kind less: the save only narrows this
 * list. It asks first, because the file is shared with the team. A recipe with no permission shows
 * nothing.
 */
export function RecipePermissions({ recipe }: { recipe: string }) {
	const { t } = useI18n();
	const a = t.sync.automation;
	const qc = useQueryClient();
	const view = useAutomation().data;
	const { failure, run } = useGuard();
	const { gate } = useRights();
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
		<SectionCard title={t.factory.wf.permissions} flush className="shrink-0">
			{kinds.map((kind) => (
				<SettingsRow key={kind} label={a.kind[kind]}>
					<ConfirmButton
						{...gate("project.settings")}
						variant="ghost"
						className="min-h-control"
						aria-label={format(a.removeKind, { kind: a.kind[kind], recipe: nameOf(recipe) })}
						confirm={format(t.factory.wf.removePermission, { kind: a.kind[kind] })}
						onConfirm={() => remove(kind)}
					>
						{a.remove}
					</ConfirmButton>
				</SettingsRow>
			))}
			<ErrorNotice error={failure} className="px-3 py-1" />
		</SectionCard>
	);
}

/**
 * "May write" of a step that opens a pull request (picture 080): Asks first, or Alone once a person
 * answered "Do not ask again". A save only narrows the list, so a recipe that asks first shows the
 * state, and a recipe that writes alone can go back to Asks first (`open_pr` leaves `recipe_writes`).
 */
export function MayWrite({ recipe }: { recipe: string }) {
	const { t } = useI18n();
	const p = t.factory.recipePage;
	const qc = useQueryClient();
	const view = useAutomation().data;
	const { failure, run } = useGuard();
	const { can } = useRights();
	if (!view || view.file === "invalid") return null;
	const all = view.automation.recipe_writes ?? {};
	const kinds = all[recipe] ?? [];
	const alone = kinds.includes("open_pr");
	const askFirst = () =>
		void run(async () => {
			await unwrap(
				commands.syncAutomationSave({
					...view.automation,
					recipe_writes: Object.fromEntries(
						Object.entries({ ...all, [recipe]: kinds.filter((k) => k !== "open_pr") }).filter(
							([, left]) => left.length,
						),
					),
				}),
			);
			await qc.invalidateQueries({ queryKey: syncKeys.all });
		});
	return (
		<Fr label={p.mayWrite}>
			{alone && can("project.settings") ? (
				<div className="w-[min(100%,20rem)]">
					<Segmented
						label={p.mayWrite}
						value="alone"
						onValueChange={(v) => v === "first" && askFirst()}
						items={[
							{ value: "first", label: p.asksFirst },
							{ value: "alone", label: p.alone },
						]}
					/>
				</div>
			) : (
				<span className="font-semibold">{alone ? p.alone : p.asksFirst}</span>
			)}
			<ErrorNotice error={failure} />
		</Fr>
	);
}
