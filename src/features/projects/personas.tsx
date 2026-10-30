import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, type Persona, unwrap } from "@/lib/ipc";
import { projectKeys, usePersonas } from "@/lib/projects";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Switch } from "@/ui/atoms/switch";
import { PlusIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";
import { SettingsRow } from "@/ui/molecules/settings-row";

const rate = (v: string) => (v.trim() === "" ? 0 : Number(v));

/**
 * The personas of the project: a name and a daily rate for each role. A persona is never deleted:
 * a retired one stays in the file because a sheet or a team member can still name it.
 */
function Editor({ saved }: { saved: Persona[] }) {
	const { t } = useI18n();
	const p = t.projects.personas;
	const qc = useQueryClient();
	const [rows, setRows] = useState(saved);
	const [error, setError] = useState<unknown>(null);
	const set = (i: number, patch: Partial<Persona>) =>
		setRows(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
	const dirty = JSON.stringify(rows) !== JSON.stringify(saved);
	const save = async () => {
		try {
			setError(null);
			await unwrap(commands.personasSave(rows));
			await qc.invalidateQueries({ queryKey: projectKeys.personas });
		} catch (e) {
			setError(e);
		}
	};
	return (
		<Panel title={p.title} bodyClassName="gap-2 p-3">
			{rows.map((r, i) => (
				<SettingsRow key={r.id} label={r.name || r.id}>
					<Input label={p.name} value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
					<Input
						label={p.tjm}
						type="number"
						min={0}
						value={r.tjm ?? 0}
						onChange={(e) => set(i, { tjm: rate(e.target.value) })}
						className="w-24"
					/>
					<Input
						label={p.cjm}
						type="number"
						min={0}
						value={r.cjm ?? 0}
						onChange={(e) => set(i, { cjm: rate(e.target.value) })}
						className="w-24"
					/>
					<Switch
						label={p.active}
						checked={r.active}
						onCheckedChange={(v) => set(i, { active: v })}
					/>
				</SettingsRow>
			))}
			<div className="flex items-center gap-2">
				<Button
					onClick={() =>
						setRows([
							...rows,
							{
								id: crypto.randomUUID(),
								name: p.newName,
								description: "",
								tjm: 0,
								cjm: 0,
								username: "",
								active: true,
							},
						])
					}
				>
					<PlusIcon size={14} />
					{p.add}
				</Button>
				{dirty ? (
					<Button variant="primary" onClick={() => void save()}>
						{t.projects.save}
					</Button>
				) : null}
			</div>
			{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
		</Panel>
	);
}

export function PersonasEditor() {
	const { data } = usePersonas();
	// A saved file resets the draft.
	return data ? <Editor key={JSON.stringify(data)} saved={data} /> : null;
}
