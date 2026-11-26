import { type ReactNode, useId, useState } from "react";
import { nameOf } from "@/features/factory/runs/run-live";
import { format, useI18n } from "@/lib/i18n";
import type {
	Effort,
	Step_Serialize as Step,
	Workflow_Serialize as Workflow,
	WorkflowOptions,
} from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Chip } from "@/ui/atoms/chip";
import { Input } from "@/ui/atoms/input";
import { Segmented } from "@/ui/atoms/segmented";
import { Select, type SelectItem } from "@/ui/atoms/select";
import { Switch } from "@/ui/atoms/switch";
import { Card } from "@/ui/molecules/card";
import { MenuButton } from "@/ui/molecules/menu-button";
import { STEPPER, STEPPER_SIDE } from "@/ui/molecules/stepper";

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];
/** The value of a Select item that stands for no value. */
const NONE = "-";
/** USD when a person turns the budget on. */
const BUDGET = 5;

/** A row of a card of the step page (picture 080): the label, then its control at its natural width on the right. */
export function Fr({ label, children }: { label: ReactNode; children: ReactNode }) {
	const id = useId();
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
		<div
			role="group"
			aria-labelledby={id}
			className="flex min-h-15 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-n-5 px-6 py-2 first:border-t-0 [h2+&]:border-t-0"
		>
			<span id={id} className="min-w-24 flex-[1_1_6rem] font-medium text-n-12">
				{label}
			</span>
			<div className="flex max-w-full min-w-0 flex-wrap items-center justify-end gap-2">
				{children}
			</div>
		</div>
	);
}

/** A segmented control that is wide enough for its words. */
const WIDE = "w-100 max-w-full";

/** What does a step: an agent, a person or a check. The same rule as `Step::kind` of the core (`runs-recipes` REQ-009). */
export function stepKind(s: Step): "agent" | "person" | "check" {
	if (s.gate === "human") return "person";
	if (s.action || s.max_rounds != null || s.role === "reviewer") return "check";
	return "agent";
}

/** Child steps that run at the same time when `max_parallel` is not set (`DEFAULT_PARALLEL`). */
const DEFAULT_PARALLEL = 2;

/** The default cap of review rounds of the engine (`REVIEW_ROUNDS`), when the recipe sets none. */
const ROUNDS = 4;

/** The id that a typed name gives: "Self review" gives "self-review". */
export const idOf = (name: string) =>
	name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

/** The name of a step in words. `pr` is the word for the step with the id `pr`: "Pull request", not "Pr". */
export const stepLabel = (id: string, pr: string) => (id === "pr" ? pr : nameOf(id));

/** The step at `i` with `p`. A new id follows into the needs of the other steps. */
export function patchStep(wf: Workflow, i: number, p: Partial<Step>): Workflow {
	const old = wf.steps[i]?.id;
	return {
		...wf,
		steps: wf.steps.map((s, k) => {
			if (k === i) return { ...s, ...p };
			return p.id !== undefined && old && s.needs?.includes(old)
				? { ...s, needs: s.needs.map((n) => (n === old ? (p.id as string) : n)) }
				: s;
		}),
	};
}

export function moveStep(wf: Workflow, i: number, by: -1 | 1): Workflow {
	const steps = [...wf.steps];
	const [s] = steps.splice(i, 1);
	if (s) steps.splice(i + by, 0, s);
	return { ...wf, steps };
}

/** The workflow with no step at `i`. The other steps do not need it any more. */
export function removeStep(wf: Workflow, i: number): Workflow {
	const gone = wf.steps[i]?.id;
	return {
		...wf,
		steps: wf.steps
			.filter((_, k) => k !== i)
			.map((s) =>
				s.needs?.includes(gone ?? "") ? { ...s, needs: s.needs.filter((n) => n !== gone) } : s,
			),
	};
}

export function addStep(wf: Workflow): Workflow {
	let n = wf.steps.length + 1;
	while (wf.steps.some((s) => s.id === `step-${n}`)) n++;
	return {
		...wf,
		steps: [
			...wf.steps,
			{
				id: `step-${n}`,
				role: "worker",
				mode: "auto",
				workspace: "shared",
				gate: "none",
				retry: 0,
				fresh_context: false,
			},
		],
	};
}

/** The items of a list in words, plus the current value when the list lacks it. */
const items = (list: string[], current?: string, label = nameOf): SelectItem[] =>
	[...list, ...(current && !list.includes(current) ? [current] : [])].map((v) => ({
		value: v,
		label: label(v),
	}));

/** A number field. An empty field gives `undefined`. Its row shows the label. */
function NumberField({
	label,
	value,
	onChange,
	placeholder,
}: {
	label: string;
	/** What an empty field means, in place of its label. */
	placeholder?: string;
	value: number | null | undefined;
	onChange: (v: number | undefined) => void;
}) {
	return (
		<span className="w-28">
			<Input
				label={label}
				type="number"
				min="0"
				step="any"
				placeholder={placeholder}
				value={value ?? ""}
				onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
			/>
		</span>
	);
}

/** A small count: less, the value, more. Under `min` the value is `undefined`. */
function Stepper({
	label,
	value,
	min = 0,
	max,
	onChange,
}: {
	label: string;
	value: number | undefined;
	min?: number;
	/** The highest value: + is off there. */
	max?: number;
	onChange: (v: number | undefined) => void;
}) {
	const { t } = useI18n();
	const p = t.factory.recipePage;
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
		<span role="group" aria-label={label} className={STEPPER}>
			<button
				type="button"
				aria-label={format(p.less, { name: label })}
				disabled={value === undefined}
				onClick={() => onChange(value !== undefined && value > min ? value - 1 : undefined)}
				className={STEPPER_SIDE}
			>
				−
			</button>
			<output className="min-w-8 text-center font-semibold">{value ?? "–"}</output>
			<button
				type="button"
				aria-label={format(p.more, { name: label })}
				disabled={max !== undefined && value !== undefined && value >= max}
				onClick={() => onChange((value ?? min - 1) + 1)}
				className={STEPPER_SIDE}
			>
				+
			</button>
		</span>
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
		<Fr label={label}>
			{value !== null ? (
				<NumberField label={label} value={value} onChange={(v) => onChange(v ?? initial)} />
			) : null}
			<Switch
				iconOnly
				label={label}
				checked={value !== null}
				onCheckedChange={(on) => onChange(on ? initial : null)}
			/>
		</Fr>
	);
}

/** A time in minutes. The file holds seconds. */
function Minutes({
	label,
	value,
	onChange,
	placeholder,
}: {
	label: string;
	placeholder?: string;
	value: number | undefined;
	onChange: (seconds: number | undefined) => void;
}) {
	const { t } = useI18n();
	return (
		<Fr label={label}>
			<NumberField
				label={label}
				placeholder={placeholder}
				value={value === undefined ? value : value / 60}
				onChange={(v) => onChange(v === undefined ? v : Math.round(v * 60))}
			/>
			{t.factory.recipePage.minutes}
		</Fr>
	);
}

/** The chosen ids as chips, and Add for the others. A chip removes its id. No id, no row. */
function Chips({
	label,
	all,
	on,
	onChange,
}: {
	label: string;
	all: string[];
	on: string[];
	onChange: (next: string[]) => void;
}) {
	const { t } = useI18n();
	const p = t.factory.recipePage;
	const rest = all.filter((id) => !on.includes(id));
	if (all.length === 0 && on.length === 0) return null;
	return (
		<Fr label={label}>
			{on.map((id) => (
				<Chip
					key={id}
					aria-label={format(p.remove, { name: nameOf(id) })}
					onClick={() => onChange(on.filter((x) => x !== id))}
				>
					{nameOf(id)}
					<span aria-hidden="true">×</span>
				</Chip>
			))}
			{rest.length ? (
				<MenuButton
					label={p.add}
					items={rest.map((id) => ({
						id,
						label: nameOf(id),
						onSelect: () => onChange([...on, id]),
					}))}
				/>
			) : null}
		</Fr>
	);
}

/** One card of the step page: a small title and its rows. */
function Part({ title, children }: { title: string; children: ReactNode }) {
	return (
		<Card role="region" aria-label={title} className="py-2">
			<h2 className="px-6 pt-3.5 pb-1.5 text-13 font-medium text-n-11">{title}</h2>
			{children}
		</Card>
	);
}

/** The name of the step in words. It gives the id when the field loses the focus or on Enter. */
function StepName({ id, onRename }: { id: string; onRename: (id: string) => void }) {
	const { t } = useI18n();
	const [name, setName] = useState(nameOf(id));
	const commit = () => {
		const next = idOf(name);
		if (next && name !== nameOf(id) && next !== id) onRename(next);
		else setName(nameOf(id));
	};
	return (
		<Input
			className="w-56"
			label={t.factory.recipePage.stepName}
			value={name}
			onChange={(e) => setName(e.target.value)}
			onBlur={commit}
			onKeyDown={(e) => e.key === "Enter" && commit()}
		/>
	);
}

/**
 * One step as four cards (picture 080): who does it, its limits, the people and how it works. The
 * limits of the whole recipe sit in the same cards. Each change gives the whole next workflow.
 */
export function StepCards({
	workflow,
	index,
	options,
	people,
	onChange,
	onRenamed,
	onRemoved,
}: {
	workflow: Workflow;
	index: number;
	options: WorkflowOptions;
	/** More rows of the People card. */
	people?: ReactNode;
	onChange: (next: Workflow) => void;
	/** The step has a new id. */
	onRenamed: (id: string) => void;
	onRemoved: () => void;
}) {
	const { t } = useI18n();
	const w = t.factory.wf;
	const p = t.factory.recipePage;
	const { steps, limits } = workflow;
	const step = steps[index];
	if (!step) return null;
	const agent = !step.action;
	const pick = (v: string) => (v === NONE ? undefined : v);
	const set = (patch: Partial<Step>) => onChange(patchStep(workflow, index, patch));
	const setLimits = (patch: Partial<Workflow["limits"]>) =>
		onChange({ ...workflow, limits: { ...limits, ...patch } });
	const tier = (v: string) => (p.tier as Record<string, string>)[v] ?? nameOf(v);
	const r = t.factory.runsRecipes;
	return (
		<div className="grid items-start gap-6 lg:grid-cols-2">
			<Part title={w.who}>
				{agent ? (
					<Fr label={w.agent}>
						<Select
							label={w.agent}
							value={step.role ?? ""}
							items={items(options.roles, step.role)}
							onValueChange={(v) => set({ role: v })}
						/>
					</Fr>
				) : null}
				<Fr label={p.stepName}>
					<StepName
						key={step.id}
						id={step.id}
						onRename={(id) => {
							set({ id });
							onRenamed(id);
						}}
					/>
				</Fr>
				<Fr label={w.kind}>
					<span className="font-semibold">{r.kind[stepKind(step)]}</span>
				</Fr>
				<Fr label={p.does}>
					<div className="w-125 max-w-full">
						<Segmented
							label={p.does}
							value={step.action ?? step.mode}
							onValueChange={(v) =>
								set(
									v === "open_pr"
										? { action: "open_pr", role: undefined }
										: { mode: v, action: undefined, role: step.role ?? "worker" },
								)
							}
							items={[
								{ value: "plan", label: w.plan },
								{ value: "open_pr", label: w.openPr },
								{ value: "auto", label: w.auto },
							]}
						/>
					</div>
				</Fr>
				{agent ? (
					<>
						<Fr label={w.model}>
							<Select
								label={w.model}
								value={step.model ?? NONE}
								items={[
									{ value: NONE, label: w.roleDefault },
									...items(options.tiers, step.model, tier),
								]}
								onValueChange={(v) => set({ model: pick(v) })}
							/>
						</Fr>
						<Fr label={w.effort}>
							<Select
								label={w.effort}
								value={step.effort ?? NONE}
								items={[{ value: NONE, label: w.roleDefault }, ...items(EFFORTS)]}
								onValueChange={(v) => set({ effort: pick(v) as Effort | undefined })}
							/>
						</Fr>
						<Fr label={w.skill}>
							<Select
								label={w.skill}
								value={step.skill ?? NONE}
								items={[{ value: NONE, label: w.none }, ...items(options.skills, step.skill)]}
								onValueChange={(v) => set({ skill: pick(v) })}
							/>
						</Fr>
						<Fr label={w.fresh}>
							<Switch
								iconOnly
								label={w.fresh}
								checked={step.fresh_context}
								onCheckedChange={(on) => set({ fresh_context: on })}
							/>
						</Fr>
					</>
				) : null}
			</Part>
			<Part title={w.limits}>
				<Fr label={w.retry}>
					<Stepper label={w.retry} value={step.retry} onChange={(v) => set({ retry: v ?? 0 })} />
				</Fr>
				<Minutes
					label={w.timeout}
					placeholder={t.factory.spendPage.noLimit}
					value={step.timeout}
					onChange={(v) => set({ timeout: v })}
				/>
				<Fr label={w.stepBudget}>
					$
					<NumberField
						label={w.stepBudget}
						placeholder={t.factory.spendPage.noLimit}
						value={step.budget}
						onChange={(v) => set({ budget: v ?? null })}
					/>
				</Fr>
				<OptionalNumber
					label={w.budget}
					value={limits.budget_usd ?? null}
					initial={BUDGET}
					onChange={(budget_usd) => setLimits({ budget_usd })}
				/>
				{agent ? (
					<Fr label={w.rounds}>
						<Stepper
							label={w.rounds}
							min={1}
							// `max_rounds` only lowers the cap of the recipe: a step that sets none shows the cap.
							max={limits.review_rounds ?? ROUNDS}
							value={step.max_rounds ?? limits.review_rounds ?? ROUNDS}
							onChange={(v) => set({ max_rounds: v })}
						/>
					</Fr>
				) : null}
				{/* A step with no need starts beside the others: it has nothing to wait for. The first step has nothing before it. */}
				<Fr label={r.runsBeside}>
					<Switch
						iconOnly
						label={r.runsBeside}
						checked={(step.needs ?? []).length === 0}
						disabled={index === 0}
						onCheckedChange={(on) =>
							set({ needs: on ? [] : [steps[index - 1]?.id ?? ""].filter(Boolean) })
						}
					/>
				</Fr>
			</Part>
			<Part title={w.people}>
				<Fr label={w.gate}>
					<Switch
						iconOnly
						label={w.gate}
						checked={step.gate === "human"}
						// The role of a step that waits goes with the wait.
						onCheckedChange={(on) =>
							set(on ? { gate: "human" } : { gate: "none", approver: undefined })
						}
					/>
				</Fr>
				{people}
			</Part>
			<Part title={w.how}>
				<Fr label={w.workspace}>
					<div className={WIDE}>
						<Segmented
							label={w.workspace}
							value={step.workspace}
							onValueChange={(v) => set({ workspace: v })}
							items={[
								{ value: "shared", label: w.shared },
								{ value: "worktree", label: w.worktree },
								{ value: "none", label: p.noFolder },
							]}
						/>
					</div>
				</Fr>
				<Chips
					label={w.needs}
					all={steps.filter((_, k) => k !== index).map((s) => s.id)}
					on={step.needs ?? []}
					onChange={(needs) => set({ needs })}
				/>
				<Fr label={w.forEach}>
					<Input
						className="w-56"
						label={w.forEach}
						value={step.for_each ?? ""}
						onChange={(e) => set({ for_each: e.target.value || undefined })}
					/>
				</Fr>
				<Fr label={w.maxParallel}>
					<Stepper
						label={w.maxParallel}
						min={1}
						value={step.max_parallel}
						onChange={(v) => set({ max_parallel: v })}
					/>
				</Fr>
				<Fr label={r.childrenBeside}>
					<Switch
						iconOnly
						label={r.childrenBeside}
						checked={(step.max_parallel ?? DEFAULT_PARALLEL) > 1}
						// With nothing to repeat for, a step has no child steps.
						disabled={!step.for_each}
						onCheckedChange={(on) => set({ max_parallel: on ? undefined : 1 })}
					/>
				</Fr>
				{agent ? (
					<Chips
						label={w.tools}
						all={[
							...options.tools,
							...(step.tools ?? []).filter((x) => !options.tools.includes(x)),
						]}
						on={step.tools ?? []}
						onChange={(tools) => set({ tools })}
					/>
				) : null}
				<Minutes
					label={w.stall}
					value={limits.stall_s}
					onChange={(v) => setLimits({ stall_s: v ?? 0 })}
				/>
				{agent ? (
					<Fr label={w.mode}>
						<Select
							label={w.mode}
							value={step.mode}
							items={[
								{ value: "plan", label: w.plan },
								{ value: "auto", label: w.auto },
							]}
							onValueChange={(v) => set({ mode: v as Step["mode"] })}
						/>
					</Fr>
				) : null}
				<Fr label={w.place}>
					<Button disabled={index === 0} onClick={() => onChange(moveStep(workflow, index, -1))}>
						{w.up}
					</Button>
					<Button
						disabled={index === steps.length - 1}
						onClick={() => onChange(moveStep(workflow, index, 1))}
					>
						{w.down}
					</Button>
				</Fr>
				<div className="border-t border-n-5 px-6 py-2">
					<Button
						className="text-danger-text"
						onClick={() => {
							onChange(removeStep(workflow, index));
							onRemoved();
						}}
					>
						{w.remove}
					</Button>
				</div>
			</Part>
		</div>
	);
}
