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
import { Input } from "@/ui/atoms/input";
import { Segmented } from "@/ui/atoms/segmented";
import { Select, type SelectItem } from "@/ui/atoms/select";
import { Switch } from "@/ui/atoms/switch";
import { PlusIcon } from "@/ui/icons";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { SectionCard } from "../section-card";

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];
/** The value of a Select item that stands for no value. */
const NONE = "-";
const TURNS = 40;
/** USD when a person turns the budget on. */
const BUDGET = 5;

/** The items of a list, plus the current value when the list lacks it. */
const items = (list: string[], current?: string): SelectItem[] =>
	[...list, ...(current && !list.includes(current) ? [current] : [])].map((v) => ({
		value: v,
		label: v,
	}));

/** A number field. An empty field gives `undefined`. Its row shows the label. */
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
			type="number"
			min="0"
			className="min-h-control"
			value={value ?? ""}
			onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
		/>
	);
}

/** A row with a switch and a number: off is `null`, and on starts at `initial`. */
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
		<SettingsRow label={label}>
			{value !== null ? (
				<span className="w-28">
					<NumberField label={label} value={value} onChange={(v) => onChange(v ?? initial)} />
				</span>
			) : null}
			<Switch
				iconOnly
				label={label}
				checked={value !== null}
				onCheckedChange={(on) => onChange(on ? initial : null)}
			/>
		</SettingsRow>
	);
}

/** A row of checkboxes, one for each id. No id, no row. */
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
		<SettingsRow label={label}>
			{ids.map((id) => (
				<Checkbox
					key={id}
					label={id}
					checked={on.includes(id)}
					onCheckedChange={(c) => onChange(c ? [...on, id] : on.filter((x) => x !== id))}
				/>
			))}
		</SettingsRow>
	);
}

/** The small title of a group of rows in a step. */
const Title = ({ children }: { children: string }) => (
	<h3 className="px-3 pt-3 pb-1 text-12 font-medium text-n-11">{children}</h3>
);

/** One step as a card (picture 080): who does it, the people, how it works and its limits. */
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
			className="grid gap-x-4 rounded-xl bg-surface-2 p-1 shadow-1 lg:grid-cols-2"
		>
			<div className="flex flex-col">
				<Title>{w.who}</Title>
				<SettingsRow label={w.stepId}>
					<Input
						label={w.stepId}
						className="min-h-control"
						value={step.id}
						onChange={(e) => onChange({ id: e.target.value })}
					/>
				</SettingsRow>
				<SettingsRow label={w.kind}>
					<span className="w-40">
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
				</SettingsRow>
				{agent ? (
					<>
						<SettingsRow label={w.role}>
							<Select
								label={w.role}
								className="min-h-control"
								value={step.role ?? ""}
								items={items(options.roles, step.role)}
								onValueChange={(v) => onChange({ role: v })}
							/>
						</SettingsRow>
						<SettingsRow label={w.model}>
							<Select
								label={w.model}
								className="min-h-control"
								value={step.model ?? NONE}
								items={[{ value: NONE, label: w.roleDefault }, ...items(options.tiers, step.model)]}
								onValueChange={(v) => onChange({ model: pick(v) })}
							/>
						</SettingsRow>
						<SettingsRow label={w.effort}>
							<Select
								label={w.effort}
								className="min-h-control"
								value={step.effort ?? NONE}
								items={[{ value: NONE, label: w.roleDefault }, ...items(EFFORTS)]}
								onValueChange={(v) => onChange({ effort: pick(v) as Effort | undefined })}
							/>
						</SettingsRow>
						<SettingsRow label={w.mode}>
							<Select
								label={w.mode}
								className="min-h-control"
								value={step.mode}
								items={[
									{ value: "plan", label: w.plan },
									{ value: "auto", label: w.auto },
								]}
								onValueChange={(v) => onChange({ mode: v as Step["mode"] })}
							/>
						</SettingsRow>
					</>
				) : (
					<SettingsRow label={w.action}>
						<Select
							label={w.action}
							className="min-h-control"
							value={step.action ?? "open_pr"}
							items={[{ value: "open_pr", label: w.openPr }]}
							onValueChange={() => {}}
						/>
					</SettingsRow>
				)}
				<Title>{w.people}</Title>
				<SettingsRow label={w.gate}>
					<Switch
						iconOnly
						label={w.gate}
						checked={step.gate === "human"}
						onCheckedChange={(on) => onChange({ gate: on ? "human" : "none" })}
					/>
				</SettingsRow>
			</div>
			<div className="flex flex-col">
				<Title>{w.how}</Title>
				<Group
					label={w.needs}
					ids={others}
					on={step.needs ?? []}
					onChange={(needs) => onChange({ needs })}
				/>
				{agent ? (
					<Group
						label={w.tools}
						ids={[
							...options.tools,
							...(step.tools ?? []).filter((x) => !options.tools.includes(x)),
						]}
						on={step.tools ?? []}
						onChange={(tools) => onChange({ tools })}
					/>
				) : null}
				{more ? (
					<>
						<SettingsRow label={w.workspace}>
							<Select
								label={w.workspace}
								className="min-h-control"
								value={step.workspace}
								items={[
									{ value: "shared", label: w.shared },
									{ value: "worktree", label: w.worktree },
									{ value: "none", label: w.none },
								]}
								onValueChange={(v) => onChange({ workspace: v as Step["workspace"] })}
							/>
						</SettingsRow>
						<SettingsRow label={w.forEach}>
							<Input
								label={w.forEach}
								className="min-h-control"
								value={step.for_each ?? ""}
								onChange={(e) => onChange({ for_each: e.target.value || undefined })}
							/>
						</SettingsRow>
						<SettingsRow label={w.maxParallel}>
							<NumberField
								label={w.maxParallel}
								value={step.max_parallel}
								onChange={(v) => onChange({ max_parallel: v })}
							/>
						</SettingsRow>
						{agent ? (
							<>
								<SettingsRow label={w.skill}>
									<Select
										label={w.skill}
										className="min-h-control"
										value={step.skill ?? NONE}
										items={[{ value: NONE, label: w.none }, ...items(options.skills, step.skill)]}
										onValueChange={(v) => onChange({ skill: pick(v) })}
									/>
								</SettingsRow>
								<SettingsRow label={w.fresh}>
									<Switch
										iconOnly
										label={w.fresh}
										checked={step.fresh_context}
										onCheckedChange={(on) => onChange({ fresh_context: on })}
									/>
								</SettingsRow>
							</>
						) : null}
					</>
				) : null}
				<SettingsRow label={w.place}>
					<Button className="min-h-control" disabled={index === 0} onClick={() => onMove(-1)}>
						{w.up}
					</Button>
					<Button
						className="min-h-control"
						disabled={index === count - 1}
						onClick={() => onMove(1)}
					>
						{w.down}
					</Button>
				</SettingsRow>
				{more ? (
					<>
						<Title>{w.limits}</Title>
						<SettingsRow label={w.retry}>
							<NumberField
								label={w.retry}
								value={step.retry}
								onChange={(v) => onChange({ retry: v ?? 0 })}
							/>
						</SettingsRow>
						<SettingsRow label={w.timeout}>
							<NumberField
								label={w.timeout}
								value={step.timeout}
								onChange={(v) => onChange({ timeout: v })}
							/>
						</SettingsRow>
						<SettingsRow label={w.stepBudget}>
							<NumberField
								label={w.stepBudget}
								value={step.budget}
								onChange={(v) => onChange({ budget: v ?? null })}
							/>
						</SettingsRow>
						{agent ? (
							<SettingsRow label={w.rounds}>
								<NumberField
									label={w.rounds}
									value={step.max_rounds}
									onChange={(v) => onChange({ max_rounds: v })}
								/>
							</SettingsRow>
						) : null}
					</>
				) : null}
				<div className="flex flex-wrap gap-2 p-3">
					<Button className="min-h-control" aria-expanded={more} onClick={() => onMore(!more)}>
						{t.factory.more}
					</Button>
					<Button className="min-h-control text-danger-text" onClick={onRemove}>
						{w.remove}
					</Button>
				</div>
			</div>
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
			<SectionCard title={w.limits} flush>
				<SettingsRow label={w.stall}>
					<NumberField
						label={w.stall}
						value={limits.stall_s}
						onChange={(v) => setLimits({ stall_s: v ?? 0 })}
					/>
				</SettingsRow>
				<OptionalNumber
					label={w.turnLimit}
					value={limits.max_turns}
					initial={TURNS}
					onChange={(max_turns) => setLimits({ max_turns })}
				/>
				<OptionalNumber
					label={w.budget}
					value={limits.budget_usd ?? null}
					initial={BUDGET}
					onChange={(budget_usd) => setLimits({ budget_usd })}
				/>
			</SectionCard>
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
				<Button className="min-h-control" onClick={add}>
					<PlusIcon size={14} />
					{w.addStep}
				</Button>
			</div>
		</div>
	);
}
