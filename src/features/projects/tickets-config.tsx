import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Column, Columns, SetupCard, SetupRow, Stepper } from "@/features/settings/parts";
import { ButtonLink, Fold, valueClass } from "@/features/settings/project/fold";
import { STEPS, toDraft } from "@/features/sync/automation-draft";
import { format, useI18n } from "@/lib/i18n";
import { commands, type TicketsConfig, unwrap } from "@/lib/ipc";
import { projectKeys, useTicketsConfig } from "@/lib/projects";
import { RightButton } from "@/lib/rights";
import { useAutomation, useWorkItems } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { Chip } from "@/ui/atoms/chip";
import { Input } from "@/ui/atoms/input";
import { Segmented } from "@/ui/atoms/segmented";
import { Select } from "@/ui/atoms/select";
import { ErrorNotice } from "@/ui/molecules/error-notice";

const MODES = ["timetracking", "points", "none"] as const;
const HIERARCHIES = ["feature", "group"] as const;
const TYPES = ["epic", "story", "task", "subtask"] as const;
const NO_FILTER = {};

/**
 * The ticket setup of the project (`docs/delivery/tickets.config.json`) as the cards of Setup /
 * Tickets: the kinds of ticket, what holds what, the size, the statuses and the rest.
 */
function Editor({ saved }: { saved: TicketsConfig }) {
	const { t } = useI18n();
	const k = t.projects.ticketsConfig;
	const d = t.doctor.tickets;
	const qc = useQueryClient();
	const [c, setC] = useState(saved);
	const [edit, setEdit] = useState<(typeof TYPES)[number] | null>(null);
	const [error, setError] = useState<unknown>(null);
	const dirty = JSON.stringify(c) !== JSON.stringify(saved);
	const statuses = [
		...new Set((useWorkItems(NO_FILTER).data ?? []).map((i) => i.status).filter(Boolean)),
	];
	const automation = useAutomation().data?.automation;
	const interval = automation?.interval;
	// The step of Shipyard that a status of the issue tracker maps to, from the status mapping.
	const stepMap = automation ? toDraft(automation).map : {};
	const stageOf = (status: string) => {
		const step = STEPS.find(([, states]) =>
			states.some((st) => (stepMap[st]?.status ?? "").toLowerCase() === status.toLowerCase()),
		);
		return step ? t.doctor.auto.step[step[0]] : undefined;
	};
	const save = async () => {
		try {
			setError(null);
			await unwrap(commands.ticketsConfigSave(c));
			await qc.invalidateQueries({ queryKey: projectKeys.tickets });
		} catch (e) {
			setError(e);
		}
	};
	const box = "flex flex-col gap-2 rounded-md bg-n-3 p-4 font-semibold";
	return (
		<Columns>
			<Column>
				<SetupCard id="kinds" title={d.kinds} className="pb-4">
					<div className="flex flex-wrap gap-2 px-6 py-3">
						{TYPES.map((type) => (
							<Chip
								key={type}
								selected={edit === type}
								onClick={() => setEdit(edit === type ? null : type)}
							>
								{c[type] || k.type[type]}
							</Chip>
						))}
					</div>
					{edit ? (
						<div className="px-6 pb-4">
							<Input
								label={k.type[edit]}
								value={c[edit]}
								onChange={(e) => setC({ ...c, [edit]: e.target.value })}
							/>
						</div>
					) : null}
					<h2 id="holds" className="px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11">
						{d.holds}
					</h2>
					<div className="px-6 py-3">
						<div className={box}>
							{c.epic}
							<div className={cn(box, "bg-surface-1")}>
								{c.story}
								<div className={box}>
									{c.task}, {c.subtask}
								</div>
							</div>
						</div>
					</div>
					<details className="px-6">
						<summary
							className={cn(
								valueClass(),
								"w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden",
							)}
						>
							{d.order}
						</summary>
						<div className="pt-3">
							<Select
								label={k.hierarchy}
								value={c.hierarchy}
								onValueChange={(v) => setC({ ...c, hierarchy: v })}
								items={HIERARCHIES.map((v) => ({ value: v, label: k.hierarchies[v] }))}
							/>
						</div>
					</details>
				</SetupCard>
				<SetupCard id="size" title={d.size}>
					<SetupRow label={d.unit}>
						<span className="w-72 max-w-full">
							<Segmented
								label={d.unit}
								value={c.estimateMode}
								onValueChange={(v) => setC({ ...c, estimateMode: v })}
								items={MODES.map((v) => ({
									value: v,
									label: v === "timetracking" ? d.days : v === "points" ? d.points : k.modes.none,
								}))}
							/>
						</span>
					</SetupRow>
					<SetupRow label={d.hours}>
						<Stepper
							label={d.hours}
							value={c.hoursPerDay ?? 8}
							min={1}
							max={24}
							onValueChange={(v) => setC({ ...c, hoursPerDay: v })}
						/>
					</SetupRow>
				</SetupCard>
			</Column>
			<Column>
				<SetupCard id="stages" title={d.stage}>
					{statuses.map((s) => (
						<SetupRow key={s} label={s}>
							<ButtonLink
								href="/setup/project?page=automation#status-map"
								aria-label={format(d.stageOf, { name: s })}
							>
								{stageOf(s) ?? t.doctor.project.map}
							</ButtonLink>
						</SetupRow>
					))}
				</SetupCard>
				<SetupCard title={t.ui.more}>
					<Fold id="spec-address" label={d.specAddress} hint={c.specBaseUrl} value={d.change}>
						<Input
							label={k.specUrl}
							value={c.specBaseUrl}
							onChange={(e) => setC({ ...c, specBaseUrl: e.target.value })}
						/>
					</Fold>
					<SetupRow label={d.every}>
						<ButtonLink href="/setup/project?page=automation#interval">
							{format(d.seconds, { count: interval ?? 60 })}
						</ButtonLink>
					</SetupRow>
					<Fold id="fields" label={d.mapFields} value={d.mapBtn}>
						<Input
							label={k.field}
							value={c.estimateField}
							onChange={(e) => setC({ ...c, estimateField: e.target.value })}
						/>
						<Input
							label={k.labels}
							value={c.labels.join(", ")}
							onChange={(e) => setC({ ...c, labels: e.target.value.split(",") })}
						/>
					</Fold>
				</SetupCard>
				{dirty ? (
					<div>
						<RightButton right="work.edit" variant="primary" onClick={() => void save()}>
							{t.projects.save}
						</RightButton>
					</div>
				) : null}
				{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
			</Column>
		</Columns>
	);
}

export function TicketsConfigEditor() {
	const { data } = useTicketsConfig();
	return data ? <Editor key={JSON.stringify(data)} saved={data} /> : null;
}
