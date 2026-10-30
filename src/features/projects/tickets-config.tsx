import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, type TicketsConfig, unwrap } from "@/lib/ipc";
import { projectKeys, useTicketsConfig } from "@/lib/projects";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";
import { SettingsRow } from "@/ui/molecules/settings-row";

const MODES = ["timetracking", "points", "none"] as const;
const HIERARCHIES = ["feature", "group"] as const;
const TYPES = ["epic", "story", "task", "subtask"] as const;

/**
 * The ticket setup of the project (`docs/delivery/tickets.config.json`): the
 * issue types, the estimate field, the hours of a day, the labels and the spec address.
 */
function Editor({ saved }: { saved: TicketsConfig }) {
	const { t } = useI18n();
	const k = t.projects.ticketsConfig;
	const qc = useQueryClient();
	const [c, setC] = useState(saved);
	const [error, setError] = useState<unknown>(null);
	const dirty = JSON.stringify(c) !== JSON.stringify(saved);
	const save = async () => {
		try {
			setError(null);
			await unwrap(commands.ticketsConfigSave(c));
			await qc.invalidateQueries({ queryKey: projectKeys.tickets });
		} catch (e) {
			setError(e);
		}
	};
	return (
		<Panel title={k.title} bodyClassName="gap-2 p-3">
			{TYPES.map((type) => (
				<SettingsRow key={type} label={k.type[type]}>
					<Input
						label={k.type[type]}
						value={c[type]}
						onChange={(e) => setC({ ...c, [type]: e.target.value })}
					/>
				</SettingsRow>
			))}
			<SettingsRow label={k.hierarchy}>
				<Select
					label={k.hierarchy}
					value={c.hierarchy}
					onValueChange={(v) => setC({ ...c, hierarchy: v })}
					items={HIERARCHIES.map((v) => ({ value: v, label: k.hierarchies[v] }))}
				/>
			</SettingsRow>
			<SettingsRow label={k.estimate}>
				<Select
					label={k.estimate}
					value={c.estimateMode}
					onValueChange={(v) => setC({ ...c, estimateMode: v })}
					items={MODES.map((v) => ({ value: v, label: k.modes[v] }))}
				/>
				<Input
					label={k.field}
					value={c.estimateField}
					onChange={(e) => setC({ ...c, estimateField: e.target.value })}
				/>
			</SettingsRow>
			<SettingsRow label={k.hours}>
				<Input
					label={k.hours}
					type="number"
					min={1}
					max={24}
					value={c.hoursPerDay ?? 0}
					onChange={(e) => setC({ ...c, hoursPerDay: Number(e.target.value) })}
					className="w-24"
				/>
			</SettingsRow>
			<SettingsRow label={k.labels}>
				<Input
					label={k.labels}
					value={c.labels.join(", ")}
					onChange={(e) => setC({ ...c, labels: e.target.value.split(",") })}
				/>
			</SettingsRow>
			<SettingsRow label={k.specUrl}>
				<Input
					label={k.specUrl}
					value={c.specBaseUrl}
					onChange={(e) => setC({ ...c, specBaseUrl: e.target.value })}
				/>
			</SettingsRow>
			{dirty ? (
				<div>
					<Button variant="primary" onClick={() => void save()}>
						{t.projects.save}
					</Button>
				</div>
			) : null}
			{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
		</Panel>
	);
}

export function TicketsConfigEditor() {
	const { data } = useTicketsConfig();
	return data ? <Editor key={JSON.stringify(data)} saved={data} /> : null;
}
