import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Column, Columns, SetupCard, SetupRow, Stepper } from "@/features/settings/parts";
import { ButtonLink, Fold } from "@/features/settings/project/fold";
import { format, useI18n } from "@/lib/i18n";
import { commands, type TicketsConfig, unwrap } from "@/lib/ipc";
import { projectKeys, useTicketsConfig } from "@/lib/projects";
import { RightButton } from "@/lib/rights";
import { useAutomation, useWorkItems } from "@/lib/sync";
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
	const [edit, setEdit] = useState<(typeof TYPES)[number]>("epic");
	const [error, setError] = useState<unknown>(null);
	const dirty = JSON.stringify(c) !== JSON.stringify(saved);
	const statuses = [
		...new Set((useWorkItems(NO_FILTER).data ?? []).map((i) => i.status).filter(Boolean)),
	];
	const interval = useAutomation().data?.automation.interval;
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
				<SetupCard id="kinds" title={d.kinds}>
					<div className="flex flex-wrap gap-2 px-6 py-3">
						{TYPES.map((type) => (
							<Chip key={type} selected={edit === type} onClick={() => setEdit(type)}>
								{c[type] || k.type[type]}
							</Chip>
						))}
					</div>
					<div className="px-6 pb-4">
						<Input
							label={k.type[edit]}
							value={c[edit]}
							onChange={(e) => setC({ ...c, [edit]: e.target.value })}
						/>
					</div>
				</SetupCard>
				<SetupCard id="holds" title={d.holds}>
					<div className="px-6 py-3">
						<div className={box}>
							{c.epic}
							<div className={box}>
								{c.story}
								<div className={box}>{c.task}</div>
							</div>
							<div className={box}>{c.subtask}</div>
						</div>
					</div>
					<SetupRow label={d.order}>
						<Select
							label={k.hierarchy}
							value={c.hierarchy}
							onValueChange={(v) => setC({ ...c, hierarchy: v })}
							items={HIERARCHIES.map((v) => ({ value: v, label: k.hierarchies[v] }))}
						/>
					</SetupRow>
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
								{t.doctor.project.map}
							</ButtonLink>
						</SetupRow>
					))}
				</SetupCard>
				<SetupCard title={t.ui.more}>
					<Fold id="spec-address" label={d.specAddress} value={c.specBaseUrl || d.change}>
						<Input
							label={k.specUrl}
							value={c.specBaseUrl}
							onChange={(e) => setC({ ...c, specBaseUrl: e.target.value })}
						/>
					</Fold>
					<SetupRow label={format(d.watch, { count: interval ?? 60 })}>
						<ButtonLink href="/setup/project?page=automation#interval">{d.change}</ButtonLink>
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
