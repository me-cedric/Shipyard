import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useGuard } from "@/features/work/guard";
import { format, useI18n } from "@/lib/i18n";
import {
	commands,
	type LearningPath_Serialize as LearningPath,
	type LearningStep_Serialize as LearningStep,
	type StepKind,
	unwrap,
} from "@/lib/ipc";
import { RightButton, RightIconButton } from "@/lib/rights";
import { useTeam } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Checkbox } from "@/ui/atoms/checkbox";
import { Chip } from "@/ui/atoms/chip";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { Progress } from "@/ui/atoms/progress";
import { Select } from "@/ui/atoms/select";
import { LinkIcon, PencilIcon, PlusIcon, TrashIcon, XMarkIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { LearnCard, learningKey, openAddress } from "./learn-feeds";

const KINDS: StepKind[] = ["course", "certification", "reading"];
const stepKey = (p: LearningPath, s: LearningStep) => `${p.id}/${s.id}`;

export type Draft = { id: string; title: string; experts: string[]; steps: LearningStep[] };
export const blankStep = (): LearningStep => ({ id: "", kind: "course", title: "", url: null });

/** The form of one path: its name, its experts from the team and its steps. */
function PathForm({
	start,
	people,
	onDone,
}: {
	start: Draft;
	people: { handle: string; name: string }[];
	onDone: () => void;
}) {
	const { t } = useI18n();
	const k = t.knowledge.learn;
	const qc = useQueryClient();
	const { failure, run } = useGuard();
	const [d, setD] = useState<Draft>(start);
	const heading = useId();
	const setStep = (i: number, patch: Partial<LearningStep>) =>
		setD({ ...d, steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
	const save = () =>
		run(async () => {
			await unwrap(
				commands.learningPathSave({ ...d, steps: d.steps.filter((s) => s.title.trim()) }, true),
			);
			await qc.invalidateQueries({ queryKey: learningKey });
			onDone();
		});
	return (
		<form
			aria-labelledby={heading}
			className="flex flex-col gap-3 rounded-lg border bg-surface-2 p-3"
			onSubmit={(e) => {
				e.preventDefault();
				void save();
			}}
		>
			<h3 id={heading} className="font-medium text-ui text-n-12">
				{start.title ? format(k.editName, { name: start.title }) : k.newPath}
			</h3>
			<Input
				label={k.name}
				caption
				value={d.title}
				onChange={(e) => setD({ ...d, title: e.target.value })}
			/>
			<fieldset className="flex flex-wrap gap-x-4">
				<legend className="pb-1 text-12 text-n-11">{k.experts}</legend>
				{people.map((m) => (
					<Checkbox
						key={m.handle}
						label={format(k.expert, { name: m.name })}
						checked={d.experts.includes(m.handle)}
						onCheckedChange={(on) =>
							setD({
								...d,
								experts: on ? [...d.experts, m.handle] : d.experts.filter((x) => x !== m.handle),
							})
						}
					/>
				))}
			</fieldset>
			<fieldset className="flex flex-col gap-2">
				<legend className="pb-1 text-12 text-n-11">{k.steps}</legend>
				{d.steps.map((s, i) => (
					// biome-ignore lint/suspicious/noArrayIndexKey: a new step has no id until it is saved
					<div key={i} className="flex flex-wrap items-center gap-2">
						<Select
							label={k.stepKind}
							value={s.kind}
							onValueChange={(v) => setStep(i, { kind: v as StepKind })}
							items={KINDS.map((x) => ({ value: x, label: k.kind[x] }))}
						/>
						<Input
							label={k.stepName}
							value={s.title}
							onChange={(e) => setStep(i, { title: e.target.value })}
							className="w-56"
						/>
						<Input
							label={k.stepAddress}
							type="url"
							value={s.url ?? ""}
							onChange={(e) => setStep(i, { url: e.target.value || null })}
							className="w-64"
						/>
						<IconButton
							label={format(k.removeStep, { n: i + 1 })}
							onClick={() => setD({ ...d, steps: d.steps.filter((_, j) => j !== i) })}
						>
							<XMarkIcon size={14} />
						</IconButton>
					</div>
				))}
				<span>
					<Button variant="ghost" onClick={() => setD({ ...d, steps: [...d.steps, blankStep()] })}>
						<PlusIcon size={14} />
						{k.addStep}
					</Button>
				</span>
			</fieldset>
			<ErrorNotice error={failure} />
			<div className="flex gap-2">
				<RightButton
					right="knowledge.edit"
					type="submit"
					variant="primary"
					disabled={!d.title.trim()}
				>
					{k.save}
				</RightButton>
				<Button variant="ghost" onClick={onDone}>
					{k.cancel}
				</Button>
			</div>
		</form>
	);
}

/** The header of Learn: the person whose steps show, and the button for a new path. */
export function LearnActions({
	picked,
	onPick,
	editing,
	onNew,
}: {
	picked: string | null;
	onPick: (handle: string) => void;
	editing: boolean;
	onNew: () => void;
}) {
	const { t } = useI18n();
	const k = t.knowledge.learn;
	const people = (useTeam().data?.team.members ?? []).map((m) => ({
		value: m.handle,
		label: m.name,
	}));
	return (
		<>
			{people.length ? (
				<fieldset aria-label={k.person} className="flex flex-wrap gap-2">
					{people.map((m) => (
						<Chip
							key={m.value}
							selected={m.value === (picked ?? people[0]?.value)}
							onClick={() => onPick(m.value)}
							className="gap-2 pl-1.5"
						>
							<Avatar name={m.label} size="s" />
							{m.label.split(" ")[0]}
						</Chip>
					))}
				</fieldset>
			) : null}
			<RightButton right="knowledge.edit" variant="primary" disabled={editing} onClick={onNew}>
				<PlusIcon size={14} />
				{k.newPath}
			</RightButton>
		</>
	);
}

/**
 * The learning paths of the team: courses, certifications and readings, the experts who can help,
 * and the steps that each person finished. A tick, a save and a delete each need a click.
 */
export function LearnPaths({
	part,
	picked = null,
	editing = null,
	onEdit = () => undefined,
}: {
	part: "paths" | "team";
	picked?: string | null;
	editing?: Draft | null;
	onEdit?: (d: Draft | null) => void;
}) {
	const { t } = useI18n();
	const k = t.knowledge.learn;
	const qc = useQueryClient();
	const { failure, run } = useGuard();
	const learning = useQuery({
		queryKey: learningKey,
		queryFn: () => unwrap(commands.learningGet()),
	});
	const people = (useTeam().data?.team.members ?? []).map((m) => ({
		handle: m.handle,
		name: m.name,
	}));
	const who = picked ?? people[0]?.handle ?? "";
	const setEditing = onEdit;
	const [removing, setRemoving] = useState<string | null>(null);
	const paths = learning.data?.paths ?? [];
	const progress = learning.data?.progress ?? {};
	const doneBy = (handle: string) => progress[handle] ?? [];
	const nameOf = (handle: string) => people.find((m) => m.handle === handle)?.name ?? handle;
	const change = (job: () => Promise<unknown>) =>
		run(async () => {
			qc.setQueryData(learningKey, await job());
		});

	if (part === "team")
		return (
			<>
				{paths.length && people.length ? (
					<LearnCard title={k.team}>
						<ul aria-label={k.team} className="flex flex-col gap-3">
							{people.map((m) => {
								const total = paths.reduce((n, p) => n + p.steps.length, 0);
								const finished = paths.reduce(
									(n, p) =>
										n + p.steps.filter((s) => doneBy(m.handle).includes(stepKey(p, s))).length,
									0,
								);
								return (
									<li key={m.handle} className="flex items-center gap-3">
										<Avatar name={m.name} size="s" />
										<span className="sr-only">{m.name}</span>
										<Progress value={finished} max={Math.max(total, 1)} label={m.name} />
										<span className="shrink-0 text-14 text-n-12">
											{format(k.of, { n: finished, count: total })}
										</span>
									</li>
								);
							})}
						</ul>
					</LearnCard>
				) : null}
			</>
		);
	return (
		<LearnCard title={k.paths}>
			{editing ? (
				<PathForm start={editing} people={people} onDone={() => setEditing(null)} />
			) : null}
			<ErrorNotice error={failure} />
			{paths.map((p) => {
				const done = p.steps.filter((s) => doneBy(who).includes(stepKey(p, s))).length;
				return (
					<section
						key={p.id}
						aria-label={p.title}
						className="flex flex-col gap-2 rounded-lg border bg-surface-2 p-3 shadow-1"
					>
						<div className="flex flex-wrap items-center gap-2">
							<h3 className="min-w-0 flex-1 truncate font-medium text-ui text-n-12">{p.title}</h3>
							<Progress
								value={done}
								max={Math.max(p.steps.length, 1)}
								label={format(k.done, { name: p.title })}
								className="w-24"
							/>
							<span className="font-mono text-12 text-n-11">
								{done}/{p.steps.length}
							</span>
							<RightIconButton
								right="knowledge.edit"
								label={format(k.editName, { name: p.title })}
								disabled={editing !== null}
								onClick={() => setEditing({ ...p })}
							>
								<PencilIcon size={14} />
							</RightIconButton>
							<RightIconButton
								right="knowledge.edit"
								label={format(k.removeName, { name: p.title })}
								onClick={() => setRemoving(removing === p.id ? null : p.id)}
							>
								<TrashIcon size={14} />
							</RightIconButton>
						</div>
						{removing === p.id ? (
							<div className="flex gap-2">
								<RightButton
									right="knowledge.edit"
									variant="danger"
									onClick={() =>
										void change(async () => {
											const next = await unwrap(commands.learningPathDelete(p.id, true));
											setRemoving(null);
											return next;
										})
									}
								>
									{format(k.confirmRemove, { name: p.title })}
								</RightButton>
								<Button variant="ghost" onClick={() => setRemoving(null)}>
									{k.cancel}
								</Button>
							</div>
						) : null}
						{p.experts.length ? (
							<ul aria-label={k.experts} className="flex flex-wrap gap-1">
								{p.experts.map((e) => (
									<li key={e}>
										<Badge variant="info">{nameOf(e)}</Badge>
									</li>
								))}
							</ul>
						) : null}
						<ol aria-label={k.steps} className="flex flex-col">
							{p.steps.map((s) => (
								<li key={s.id} className="flex items-center gap-2 border-t py-1 first:border-t-0">
									<Checkbox
										label={format(k.done, { name: s.title })}
										hideLabel
										disabled={!who}
										checked={doneBy(who).includes(stepKey(p, s))}
										onCheckedChange={(on) =>
											void change(() =>
												unwrap(commands.learningProgressSet(who, stepKey(p, s), on, true)),
											)
										}
									/>
									<Badge>{k.kind[s.kind]}</Badge>
									<span className="min-w-0 flex-1 truncate text-ui text-n-12">{s.title}</span>
									{s.url ? (
										<IconButton
											label={format(k.open, { name: s.title })}
											onClick={() => openAddress(s.url ?? "")}
										>
											<LinkIcon size={14} />
										</IconButton>
									) : null}
								</li>
							))}
						</ol>
					</section>
				);
			})}
		</LearnCard>
	);
}
