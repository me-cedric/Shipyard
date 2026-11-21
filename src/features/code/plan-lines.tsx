import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { forgeKeys } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { useTeam } from "@/lib/work";
import { Checkbox } from "@/ui/atoms/checkbox";
import { Input } from "@/ui/atoms/input";
import { LinkButton } from "@/ui/atoms/link-button";
import { Select } from "@/ui/atoms/select";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import type { PlanLine } from "./impacts";

const NOBODY = "";

/**
 * The action plan of an impact report (screen 73): each line has a check box and an owner, and
 * Add a line ends the list. A change goes to the plan file as a Markdown check box and a name.
 * A line makes no ticket.
 */
export function PlanLines({ path, lines }: { path: string; lines: PlanLine[] }) {
	const { t } = useI18n();
	const p = t.codeHost.plan;
	const qc = useQueryClient();
	const members = useTeam().data?.team.members ?? [];
	const [error, setError] = useState<unknown>(null);
	const [adding, setAdding] = useState(false);
	const [text, setText] = useState("");
	const save = async (next: PlanLine[]) => {
		try {
			setError(null);
			await unwrap(commands.codeImpactPlanSave(path, next, true));
			await qc.invalidateQueries({ queryKey: forgeKeys.impact(path) });
			return true;
		} catch (e) {
			setError(e);
			return false;
		}
	};
	const change = (at: number, patch: Partial<PlanLine>) =>
		void save(lines.map((l, i) => (i === at ? { ...l, ...patch } : l)));
	return (
		<>
			<ul className="flex flex-col text-ui">
				{lines.map((l, i) => (
					<li
						// A line has no id: its place in the file is its key.
						// biome-ignore lint/suspicious/noArrayIndexKey: see above
						key={i}
						className="flex min-h-row flex-wrap items-center gap-3 border-b py-2 last:border-b-0"
					>
						<Checkbox
							label={format(p.done, { text: l.text })}
							hideLabel
							checked={l.done}
							onCheckedChange={(done) => change(i, { done })}
						/>
						<span className="min-w-0 flex-1">{l.text}</span>
						<Select
							label={p.owner}
							value={l.owner}
							onValueChange={(owner) => change(i, { owner })}
							items={[
								{ value: NOBODY, label: p.nobody },
								// An owner that the team lacks stays: the file holds the name.
								...(l.owner && !members.some((m) => m.name === l.owner)
									? [{ value: l.owner, label: l.owner }]
									: []),
								...members.map((m) => ({ value: m.name, label: m.name })),
							]}
							className="min-w-36"
						/>
					</li>
				))}
			</ul>
			{adding ? (
				<form
					className="flex flex-wrap items-end gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						const body = text.trim();
						if (!body) return;
						void save([...lines, { text: body, done: false, owner: NOBODY }]).then((ok) => {
							if (!ok) return;
							setText("");
							setAdding(false);
						});
					}}
				>
					<Input label={p.line} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
					<RightButton right="code.write" type="submit" variant="primary" disabled={!text.trim()}>
						{t.codeHost.kinds.add}
					</RightButton>
				</form>
			) : (
				<LinkButton onClick={() => setAdding(true)}>{p.addLine}</LinkButton>
			)}
			<ErrorNotice error={error} />
		</>
	);
}
