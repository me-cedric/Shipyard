import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import { commands, type RunnerTiers_Serialize, unwrap } from "@/lib/ipc";
import { Caption, Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { Panel } from "@/ui/molecules/panel";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { runnerKeys } from "./connections/keys";
import { Compass } from "./extensions/compass";

const TIERS = ["top", "mid", "small"] as const;
const EFFORT = { top: "topEffort", mid: "midEffort", small: "smallEffort" } as const;
const tiersKey = ["tiers"] as const;
/** The Select has no empty value: this one stands for "the tool decides". */
const AUTO = "auto";

/**
 * One runner: a model and an effort for each tier. A detected tool gives its models and the levels
 * that each model accepts; the effort shows only for a model that accepts one. A tool that lists
 * no model, or one that is not installed, keeps a free text field. A choice saves at once, a typed
 * model when the field loses focus.
 */
function TierRow({ row, detected }: { row: RunnerTiers_Serialize; detected: boolean }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const { error, run } = useGuard();
	const [draft, setDraft] = useState(row);
	const catalog = useQuery({
		queryKey: ["runner-catalog", row.runner],
		queryFn: () => unwrap(commands.runnersCatalog(row.runner)),
		enabled: detected,
		staleTime: 5 * 60_000,
	}).data;
	const save = (next: RunnerTiers_Serialize) =>
		run(async () => {
			qc.setQueryData(tiersKey, await unwrap(commands.tiersSet(next)));
		});
	/** The levels of the model of a tier: its own, or the tool's for the default model. */
	const levels = (model: string) =>
		model === ""
			? (catalog?.efforts ?? [])
			: (catalog?.models.find((m) => m.id === model)?.efforts ?? []);
	const pick = (tier: (typeof TIERS)[number], model: string) => {
		const next = { ...draft, [tier]: model };
		if (!levels(model).includes(next[EFFORT[tier]])) next[EFFORT[tier]] = "";
		setDraft(next);
		void save(next);
	};
	const listed = detected && (catalog?.models.length ?? 0) > 0;
	return (
		<>
			<SettingsRow label={row.runner}>
				<div className="flex flex-wrap items-center justify-end gap-2">
					{TIERS.map((tier) => {
						const name = `${row.runner} ${t.settings.tiers[tier]}`;
						const ids = catalog?.models.map((m) => m.id) ?? [];
						const efforts = listed ? levels(draft[tier]) : [];
						// A level saved before, that the tool no longer accepts: shown, never passed on.
						const saved = draft[EFFORT[tier]];
						const unknown = listed && saved !== "" && !efforts.includes(saved);
						return (
							<Caption key={tier} label={t.settings.tiers[tier]}>
								{listed ? (
									<span className="flex items-center gap-1">
										<Select
											label={name}
											className="w-40"
											value={draft[tier] || AUTO}
											onValueChange={(v) => pick(tier, v === AUTO ? "" : v)}
											items={[
												{ value: AUTO, label: t.settings.tiers.default },
												// A model saved before the list, or typed by hand, stays pickable.
												...(draft[tier] && !ids.includes(draft[tier])
													? [{ value: draft[tier], label: draft[tier] }]
													: []),
												...ids.map((id) => ({ value: id, label: id })),
											]}
										/>
										{efforts.length > 0 || unknown ? (
											<Select
												label={`${name} ${t.settings.tiers.effort}`}
												className="w-40"
												value={draft[EFFORT[tier]] || AUTO}
												onValueChange={(v) => {
													const next = { ...draft, [EFFORT[tier]]: v === AUTO ? "" : v };
													setDraft(next);
													void save(next);
												}}
												items={[
													{ value: AUTO, label: t.settings.tiers.default },
													...(unknown
														? [
																{
																	value: saved,
																	label: format(t.settings.tiers.unsupported, { level: saved }),
																},
															]
														: []),
													...efforts.map((e) => ({ value: e, label: e })),
												]}
											/>
										) : null}
									</span>
								) : (
									<Input
										label={name}
										className="w-40"
										value={draft[tier]}
										onChange={(e) => setDraft({ ...draft, [tier]: e.target.value })}
										onBlur={() => draft[tier] !== row[tier] && void save(draft)}
									/>
								)}
							</Caption>
						);
					})}
				</div>
			</SettingsRow>
			{error ? (
				<p role="alert" className="px-3 text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</>
	);
}

/** Settings / Agents and rules: the compass part, then the model of each tier of each runner (factory REQ-012). */
export function AgentsRules() {
	const { t } = useI18n();
	const tiers = useQuery({ queryKey: tiersKey, queryFn: () => unwrap(commands.tiersGet()) });
	const runners = useQuery({
		queryKey: runnerKeys.list,
		queryFn: () => unwrap(commands.runnersList()),
	});
	return (
		<Compass>
			<Panel title={t.settings.tiers.name} count={tiers.data?.length ?? 0} flush>
				{(tiers.data ?? []).map((row) => (
					// The saved row keys the draft: a refused edit keeps the typed text until the person fixes it.
					<TierRow
						key={row.runner}
						row={row}
						detected={runners.data?.find((r) => r.id === row.runner)?.state === "detected"}
					/>
				))}
			</Panel>
		</Compass>
	);
}
