import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { SetupCard, SetupRow, Toggle } from "@/features/settings/parts";
import { useI18n } from "@/lib/i18n";
import { commands, type Persona, unwrap } from "@/lib/ipc";
import { projectKeys, usePersonas } from "@/lib/projects";
import { RightButton } from "@/lib/rights";
import { Input } from "@/ui/atoms/input";
import { ErrorNotice } from "@/ui/molecules/error-notice";

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
	const [editing, setEditing] = useState<string | null>(null);
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
		<SetupCard id="section-personas" title={p.title}>
			{rows.map((r, i) => (
				<SetupRow
					key={r.id}
					label={
						editing === r.id ? (
							<Input
								label={p.name}
								value={r.name}
								autoFocus
								onChange={(e) => set(i, { name: e.target.value })}
								onBlur={() => setEditing(null)}
								onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
							/>
						) : (
							<button
								type="button"
								aria-label={`${p.name}: ${r.name || r.id}`}
								onClick={() => setEditing(r.id)}
								className="min-h-control min-w-0 truncate text-left font-semibold"
							>
								{r.name || r.id}
							</button>
						)
					}
				>
					<Input
						label={p.tjm}
						type="number"
						min={0}
						value={r.tjm ?? 0}
						onChange={(e) => set(i, { tjm: rate(e.target.value) })}
						className="w-28"
					/>
					<Input
						label={p.cjm}
						type="number"
						min={0}
						value={r.cjm ?? 0}
						onChange={(e) => set(i, { cjm: rate(e.target.value) })}
						className="w-28"
					/>
					<Toggle
						label={p.active}
						checked={r.active}
						onCheckedChange={(v) => set(i, { active: v })}
					/>
				</SetupRow>
			))}
			<div className="flex items-center justify-end gap-2 border-n-6 border-t px-6 pt-3 pb-1">
				{dirty ? (
					<RightButton right="specs.edit" variant="primary" onClick={() => void save()}>
						{t.projects.save}
					</RightButton>
				) : null}
				<RightButton
					right="specs.edit"
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
					{p.add}
				</RightButton>
			</div>
			{error ? <ErrorNotice error={error} className="px-6 text-ui text-danger-text" /> : null}
		</SetupCard>
	);
}

export function PersonasEditor() {
	const { data } = usePersonas();
	// A saved file resets the draft.
	return data ? <Editor key={JSON.stringify(data)} saved={data} /> : null;
}
