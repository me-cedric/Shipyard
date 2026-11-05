import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import type {
	Effort,
	Step_Serialize as Step,
	Workflow_Serialize as Workflow,
	WorkflowOptions,
} from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Checkbox } from "@/ui/atoms/checkbox";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { Segmented } from "@/ui/atoms/segmented";
import { Select, type SelectItem } from "@/ui/atoms/select";
import { Switch } from "@/ui/atoms/switch";
import { ChevronDownIcon, ChevronUpIcon, PlusIcon, TrashIcon } from "@/ui/icons";

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];
/** The value of a Select item that stands for no value. */
const NONE = "-";
const TURNS = 40;

/** The items of a list, plus the current value when the list lacks it. */
const items = (list: string[], current?: string): SelectItem[] =>
	[...list, ...(current && !list.includes(current) ? [current] : [])].map((v) => ({
		value: v,
		label: v,
	}));

/** A number field. An empty field gives `undefined`. */
function NumberField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: number | null | undefined;
	onChange: (v: number | undefined) => void;
}) {
	return (
		<Input
			label={label}
			caption
			type="number"
			min="0"
			value={value ?? ""}
			onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
		/>
	);
}

/** A switch with a number: off is `null`, and on starts at `initial`. */
function OptionalNumber({
	label,
	value,
	initial,
	onChange,
}: {
	label: string;
	value: number | null;
	initial: number;
	onChange: (v: number | null) => void;
}) {
	return (
		<span className="flex items-end gap-3">
			<Switch
				label={label}
				checked={value !== null}
				onCheckedChange={(on) => onChange(on ? initial : null)}
			/>
			{value !== null ? (
				<span className="w-28">
					<NumberField label={label} value={value} onChange={(v) => onChange(v ?? initial)} />
				</span>
			) : null}
		</span>
	);
}

function Group({
	label,
	ids,
	on,
	onChange,
}: {
	label: string;
	ids: string[];
	on: string[];
	onChange: (next: string[]) => void;
}) {
	if (ids.length === 0) return null;
	return (
		<fieldset className="flex flex-wrap items-center gap-x-3">
			<legend className="float-left mr-3 text-12 text-n-11">{label}</legend>
			{ids.map((id) => (
				<Checkbox
					key={id}
					label={id}
					checked={on.includes(id)}
					onCheckedChange={(c) => onChange(c ? [...on, id] : on.filter((x) => x !== id))}
				/>
			))}
		</fieldset>
	);
}

function StepForm({
	step,
	index,
	count,
	others,
	options,
	more,
	onMore,
	onChange,
	onMove,
	onRemove,
}: {
	more: boolean;
	onMore: (open: boolean) => void;
	step: Step;
	index: number;
	count: number;
	others: string[];
	options: WorkflowOptions;
	onChange: (patch: Partial<Step>) => void;
	onMove: (by: -1 | 1) => void;
	onRemove: () => void;
}) {
	const { t } = useI18n();
	const w = t.factory.wf;
	const agent = !step.action;
	const pick = (v: string) => (v === NONE ? undefined : v);
	return (
		<section
			aria-label={format(w.step, { id: step.id })}
			className="flex flex-col gap-3 rounded-lg border bg-surface-1 p-3"
		>
			<div className="flex items-end gap-2">
				<Input
					label={w.stepId}
					caption
					value={step.id}
					onChange={(e) => onChange({ id: e.target.value })}
				/>
				<span className="w-40 shrink-0">
					<Segmented
						label={w.kind}
						value={agent ? "agent" : "action"}
						onValueChange={(k) =>
							onChange(
								k === "agent"
									? { role: "worker", action: undefined }
									: { action: "open_pr", role: undefined },
							)
						}
						items={[
							{ value: "agent", label: w.agent },
							{ value: "action", label: w.action },
						]}
					/>
				</span>
				<span className="flex-1" />
				<IconButton label={w.up} disabled={index === 0} onClick={() => onMove(-1)}>
					<ChevronUpIcon size={14} />
				</IconButton>
				<IconButton label={w.down} disabled={index === count - 1} onClick={() => onMove(1)}>
					<ChevronDownIcon size={14} />
				</IconButton>
				<IconButton label={w.remove} onClick={onRemove}>
					<TrashIcon size={14} />
				</IconButton>
			</div>
			<div className="flex flex-wrap items-end gap-3">
				{agent ? (
					<>
						<Select
							caption
							label={w.role}
							value={step.role ?? ""}
							items={items(options.roles, step.role)}
							onValueChange={(v) => onChange({ role: v })}
						/>
						<Select
							caption
							label={w.model}
							value={step.model ?? NONE}
							items={[{ value: NONE, label: w.roleDefault }, ...items(options.tiers, step.model)]}
							onValueChange={(v) => onChange({ model: pick(v) })}
						/>
						<Select
							caption
							label={w.effort}
							value={step.effort ?? NONE}
							items={[{ value: NONE, label: w.roleDefault }, ...items(EFFORTS)]}
							onValueChange={(v) => onChange({ effort: pick(v) as Effort | undefined })}
						/>
						<Select
							caption
							label={w.mode}
							value={step.mode}
							items={[
								{ value: "plan", label: w.plan },
								{ value: "auto", label: w.auto },
							]}
							onValueChange={(v) => onChange({ mode: v as Step["mode"] })}
						/>
					</>
				) : (
					<Select
						caption
						label={w.action}
						value={step.action ?? "open_pr"}
						items={[{ value: "open_pr", label: w.openPr }]}
						onValueChange={() => {}}
					/>
				)}
				<Switch
					label={w.gate}
					checked={step.gate === "human"}
					onCheckedChange={(on) => onChange({ gate: on ? "human" : "none" })}
				/>
			</div>
			<Group
				label={w.needs}
				ids={others}
				on={step.needs ?? []}
				onChange={(needs) => onChange({ needs })}
			/>
			{agent ? (
				<Group
					label={w.tools}
					ids={[...options.tools, ...(step.tools ?? []).filter((x) => !options.tools.includes(x))]}
					on={step.tools ?? []}
					onChange={(tools) => onChange({ tools })}
				/>
			) : null}
			<div>
				<Button aria-expanded={more} onClick={() => onMore(!more)}>
					{t.factory.more}
				</Button>
			</div>
			{more ? (
				<div className="flex flex-wrap items-end gap-3">
					<Select
						caption
						label={w.workspace}
						value={step.workspace}
						items={[
							{ value: "shared", label: w.shared },
							{ value: "worktree", label: w.worktree },
							{ value: "none", label: w.none },
						]}
						onValueChange={(v) => onChange({ workspace: v as Step["workspace"] })}
					/>
					<Input
						label={w.forEach}
						caption
						value={step.for_each ?? ""}
						onChange={(e) => onChange({ for_each: e.target.value || undefined })}
					/>
					<NumberField
						label={w.maxParallel}
						value={step.max_parallel}
						onChange={(v) => onChange({ max_parallel: v })}
					/>
					<NumberField
						label={w.retry}
						value={step.retry}
						onChange={(v) => onChange({ retry: v ?? 0 })}
					/>
					<NumberField
						label={w.timeout}
						value={step.timeout}
						onChange={(v) => onChange({ timeout: v })}
					/>
					<NumberField
						label={w.stepBudget}
						value={step.budget}
						onChange={(v) => onChange({ budget: v ?? null })}
					/>
					{agent ? (
						<>
							<Select
								caption
								label={w.skill}
								value={step.skill ?? NONE}
								items={[{ value: NONE, label: w.none }, ...items(options.skills, step.skill)]}
								onValueChange={(v) => onChange({ skill: pick(v) })}
							/>
							<NumberField
								label={w.rounds}
								value={step.max_rounds}
								onChange={(v) => onChange({ max_rounds: v })}
							/>
							<Switch
								label={w.fresh}
								checked={step.fresh_context}
								onCheckedChange={(on) => onChange({ fresh_context: on })}
							/>
						</>
					) : null}
				</div>
			) : null}
		</section>
	);
}

/** The form of a workflow: the limits and each step. Each change gives the whole next workflow. */
export function WorkflowForm({
	workflow,
	options,
	onChange,
}: {
	workflow: Workflow;
	options: WorkflowOptions;
	onChange: (next: Workflow) => void;
}) {
	const { t } = useI18n();
	const w = t.factory.wf;
	const { steps, limits } = workflow;
	// The open "More" panels, by position: a move or a removal moves them with their step.
	const [open, setOpen] = useState<boolean[]>([]);
	const setSteps = (next: Step[]) => onChange({ ...workflow, steps: next });
	const patch = (i: number, p: Partial<Step>) => {
		const old = steps[i]?.id;
		setSteps(
			steps.map((s, k) => {
				if (k === i) return { ...s, ...p };
				// A new id follows into the needs of the other steps.
				return p.id !== undefined && old && s.needs?.includes(old)
					? { ...s, needs: s.needs.map((n) => (n === old ? (p.id as string) : n)) }
					: s;
			}),
		);
	};
	const move = (i: number, by: -1 | 1) => {
		const next = [...steps];
		const [s] = next.splice(i, 1);
		if (s) next.splice(i + by, 0, s);
		const o = steps.map((_, k) => !!open[k]);
		const [f] = o.splice(i, 1);
		o.splice(i + by, 0, !!f);
		setOpen(o);
		setSteps(next);
	};
	const remove = (i: number) => {
		const gone = steps[i]?.id;
		setOpen(open.filter((_, k) => k !== i));
		setSteps(
			steps
				.filter((_, k) => k !== i)
				.map((s) =>
					s.needs?.includes(gone ?? "") ? { ...s, needs: s.needs.filter((n) => n !== gone) } : s,
				),
		);
	};
	const add = () => {
		let n = steps.length + 1;
		while (steps.some((s) => s.id === `step-${n}`)) n++;
		setSteps([
			...steps,
			{
				id: `step-${n}`,
				role: "worker",
				mode: "auto",
				workspace: "shared",
				gate: "none",
				retry: 0,
				fresh_context: false,
			},
		]);
	};
	const setLimits = (p: Partial<Workflow["limits"]>) =>
		onChange({ ...workflow, limits: { ...limits, ...p } });
	return (
		<div className="flex flex-col gap-3">
			<section
				aria-label={w.limits}
				className="flex flex-wrap items-end gap-4 rounded-lg border bg-surface-1 p-3"
			>
				<NumberField
					label={w.stall}
					value={limits.stall_s}
					onChange={(v) => setLimits({ stall_s: v ?? 0 })}
				/>
				<OptionalNumber
					label={w.turnLimit}
					value={limits.max_turns}
					initial={TURNS}
					onChange={(max_turns) => setLimits({ max_turns })}
				/>
				{/* shortcut: budget_usd becomes optional on main; switch it to the optional field after the rebase */}
				<NumberField
					label={w.budget}
					value={limits.budget_usd}
					onChange={(v) => setLimits({ budget_usd: v ?? null })}
				/>
			</section>
			{steps.map((s, i) => (
				<StepForm
					// biome-ignore lint/suspicious/noArrayIndexKey: a step id changes while a person types it
					key={i}
					step={s}
					index={i}
					count={steps.length}
					others={steps.filter((_, k) => k !== i).map((x) => x.id)}
					options={options}
					more={!!open[i]}
					onMore={(on) => setOpen(steps.map((_, k) => (k === i ? on : !!open[k])))}
					onChange={(p) => patch(i, p)}
					onMove={(by) => move(i, by)}
					onRemove={() => remove(i)}
				/>
			))}
			<div>
				<Button onClick={add}>
					<PlusIcon size={14} />
					{w.addStep}
				</Button>
			</div>
		</div>
	);
}
