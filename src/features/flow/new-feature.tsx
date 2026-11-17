import { useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TicketPicker } from "@/features/factory/ticket-picker";
import { useGuard } from "@/features/work/guard";
import { ENDED, useRunActions, useRuns, useWorkflows } from "@/lib/factory";
import { useI18n } from "@/lib/i18n";
import type { Right } from "@/lib/ipc";
import { RightButton, useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useSpecsActions } from "@/lib/specs";
import { useBacklogActions, useWorkItems } from "@/lib/sync";
import { useWorkActions } from "@/lib/work";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Select } from "@/ui/atoms/select";
import { Textarea } from "@/ui/atoms/textarea";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { SectionSwitch } from "@/ui/molecules/section-switch";

type Kind = "feature" | "bug" | "idea";
type Way = "agent" | "mine" | "build";

/** The rights that each way needs: the ticket, the change, the run. */
const NEEDS: Record<Way | "idea", Right[]> = {
	agent: ["work.edit", "specs.edit", "runs.start"],
	mine: ["specs.edit"],
	build: ["work.edit", "runs.start"],
	idea: ["specs.edit"],
};

const NO_FILTER = {};
const SHOWN = 5;

/**
 * Flow / New feature (`spec:app-redesign#REQ-003`): one title, a kind, three ways to go on, and the
 * tickets that have no run. Each way first makes a spec change, then calls the commands of the Specs
 * and Factory pages of before.
 */
export function NewFeature() {
	const { t } = useI18n();
	const n = t.flow.new;
	const { openRef } = useShell();
	const { gate } = useRights();
	const specs = useSpecsActions();
	const work = useWorkActions();
	const { adopt } = useBacklogActions();
	const runs = useRunActions();
	const workflows = useWorkflows().data ?? [];
	const items = useWorkItems(NO_FILTER).data ?? [];
	const all = useRuns().data;
	const { failure, run: guard } = useGuard();
	const [title, setTitle] = useState("");
	const search: { kind?: "idea" } = useSearch({ strict: false });
	const [kind, setKind] = useState<Kind>(search.kind ?? "feature");
	const [way, setWay] = useState<Way>("agent");
	const [recipe, setRecipe] = useState("");
	const [key, setKey] = useState("");
	// A ticket with a run that has not ended cannot start another one.
	const skip = useMemo(
		() => new Set((all ?? []).filter((r) => !ENDED.includes(r.state)).map((r) => r.key)),
		[all],
	);
	const free = items.filter((i) => !skip.has(i.key) && i.category !== "done");
	const chosen = recipe || workflows[0]?.id || "";
	const mode = kind === "idea" ? "idea" : way;
	// The first right that the person lacks turns Create off, with its reason.
	const off = NEEDS[mode].map(gate).find((g) => g.disabled);
	// The ticket cites the change by its ref `change:<id>`, a real ref. The kind goes on it as a label.
	const ticket = async (change: string) => {
		const row = await work.createItem({
			reference: `change:${change}`,
			kind: "story",
			title: title.trim(),
			description: "",
		});
		if (row.error || !row.key) throw new Error(row.error ?? "no ticket");
		// The new ticket is not in the mirror yet: a run needs it there.
		await adopt(row.key);
		await work.addLabel(row.key, kind);
		return row.key;
	};
	// Each way first makes the change. Its title is the text of the person, so the proposal holds it.
	const create = async () => {
		const made = (await specs.createChange(title.trim())).id;
		if (mode === "build") await runs.start(await ticket(made));
		else if (mode === "agent") await specs.delegate(await ticket(made), chosen);
		openRef(`change:${made}`);
	};
	const start = (k: string) =>
		void guard(async () => {
			openRef(`run:${await runs.start(k)}`);
			setKey("");
		});
	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
			<h1 className="text-32 font-semibold">{n.heading}</h1>
			<Textarea
				autoFocus
				label={n.title}
				value={title}
				onChange={(e) => setTitle(e.target.value)}
			/>
			<SectionSwitch
				label={n.kind}
				items={(["feature", "bug", "idea"] as const).map((id) => ({
					id,
					label: n.kinds[id],
					current: id === kind,
				}))}
				onSelect={(id) => setKind(id as Kind)}
			/>
			{kind === "idea" ? null : (
				<SectionSwitch
					label={n.way}
					items={(["agent", "mine", "build"] as const).map((id) => ({
						id,
						label: n.ways[id],
						current: id === way,
					}))}
					onSelect={(id) => setWay(id as Way)}
				/>
			)}
			<div className="flex flex-wrap items-center gap-3">
				{mode === "agent" ? (
					<Select
						label={n.recipe}
						caption
						value={chosen}
						onValueChange={setRecipe}
						items={workflows.map((w) => ({ value: w.id, label: w.id }))}
					/>
				) : null}
				<Button
					variant="primary"
					className="ml-auto min-h-control"
					disabled={title.trim() === "" || off !== undefined}
					reason={off?.reason}
					onClick={() => void guard(create)}
				>
					{n.create}
				</Button>
			</div>
			<ErrorNotice error={failure} />
			<section
				aria-label={n.fromTicket}
				className="flex flex-col gap-2 rounded-xl bg-surface-2 p-4"
			>
				<h2 className="text-14 font-medium text-n-11">{n.fromTicket}</h2>
				<ul className="flex flex-col">
					{free.slice(0, SHOWN).map((i) => (
						<li key={i.key} className="flex min-h-control items-center gap-2">
							<span className="min-w-0 flex-1 truncate">{i.title}</span>
							<Badge>{i.kind}</Badge>
							<RightButton
								right="runs.start"
								className="min-h-control"
								aria-label={`${n.startAgent} ${i.key}`}
								onClick={() => start(i.key)}
							>
								{n.startAgent}
							</RightButton>
						</li>
					))}
				</ul>
				<div className="flex items-center gap-2">
					<TicketPicker
						label={n.find}
						className="min-h-control"
						value={key}
						onChange={setKey}
						onSubmit={() => start(key)}
						skip={skip}
					/>
					{key ? (
						<RightButton right="runs.start" className="min-h-control" onClick={() => start(key)}>
							{n.startAgent}
						</RightButton>
					) : null}
				</div>
			</section>
		</div>
	);
}
