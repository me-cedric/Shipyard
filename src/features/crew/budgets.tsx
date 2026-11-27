import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment, type ReactNode, useRef, useState } from "react";
import { useGuard } from "@/features/work/guard";
import { useFactoryWrites, useMachineSpend, useMachineWrites } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { commands, type Then, unwrap } from "@/lib/ipc";
import { RightButton, useRights } from "@/lib/rights";
import { syncKeys, useAutomation } from "@/lib/sync";
import { runnerName } from "@/ui/atoms/brand-icon";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { PageHeader } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";
import { SpendMeter } from "@/ui/molecules/spend-meter";
import { SpendChart } from "./budgets-chart";
import { percent, WARN_AT } from "./spend-const";
import { BackToSpend, RowsCard, useFeatureLimit, usePrices } from "./spend-parts";

type Scope = "day" | "member";
/** The kinds of budget that have a choice `Then` (`runs-recipes` REQ-006). */
type ThenScope = "feature" | "day" | "member";
const THEN: Then[] = ["stop_ask", "pause", "ask", "go_on"];

/** A budget amount: empty for no limit, else zero or more dollars. A bad value gets a plain sentence. */
const usdOf = (text: string, bad: string) => {
	const usd = text.trim() === "" ? null : Number(text);
	if (usd !== null && !(Number.isFinite(usd) && usd >= 0)) throw new Error(bad);
	return usd;
};

/**
 * Warn at and Then of the project budgets (`runs-recipes` REQ-006): read from the automation file,
 * saved with the whole file, as the other forms do. Warn at is one percent for the project.
 */
export function useBudgetRules() {
	const { t } = useI18n();
	const qc = useQueryClient();
	const view = useAutomation().data;
	const { error, failure, run } = useGuard();
	const budgets = view?.automation.budgets;
	const save = (patch: object, check?: () => string | null) =>
		run(async () => {
			const bad = check?.();
			if (bad) throw new Error(bad);
			if (!view || view.file === "invalid") throw new Error(t.factory.runsRecipes.warnAtError);
			await unwrap(
				commands.syncAutomationSave({
					...view.automation,
					budgets: { day: {}, member: {}, ...view.automation.budgets, ...patch },
				}),
			);
			await qc.invalidateQueries({ queryKey: syncKeys.all });
		});
	return {
		warn: budgets?.warn_at ?? WARN_AT,
		choice: (scope: ThenScope): Then => budgets?.at_limit?.[scope] ?? "stop_ask",
		error,
		failure,
		setWarn: (text: string) =>
			save({ warn_at: Number(text) }, () =>
				/^\d+$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= 100
					? null
					: t.factory.runsRecipes.warnAtError,
			),
		setThen: (scope: ThenScope, value: Then) =>
			save({
				at_limit: {
					feature: "stop_ask",
					day: "stop_ask",
					member: "stop_ask",
					...budgets?.at_limit,
					[scope]: value,
				},
			}),
	};
}

/** "Warn at 80 %" with Edit: the value turns into a field with Save. */
export function WarnAt() {
	const { t, lang } = useI18n();
	const r = t.factory.runsRecipes;
	const rules = useBudgetRules();
	const [text, setText] = useState<string | null>(null);
	if (text === null)
		return (
			<>
				<span>{percent(rules.warn, lang)}</span>
				<Button
					className="min-h-control"
					aria-label={r.editWarn}
					onClick={() => setText(String(rules.warn))}
				>
					{t.factory.edit}
				</Button>
			</>
		);
	return (
		<form
			noValidate
			className="flex flex-wrap items-center gap-2"
			onSubmit={(e) => {
				e.preventDefault();
				void rules.setWarn(text).then((ok) => ok && setText(null));
			}}
		>
			<Input
				label={r.warnAtPercent}
				type="number"
				min="1"
				max="100"
				className="min-h-control w-24"
				value={text}
				onChange={(e) => setText(e.target.value)}
			/>
			<RightButton
				right="project.settings"
				variant="primary"
				className="min-h-control"
				type="submit"
			>
				{r.save}
			</RightButton>
			{rules.failure ? <ErrorNotice error={rules.failure} className="w-full" /> : null}
		</form>
	);
}

/** The budgets of the project and the state of the form that sets one (factory REQ-032). */
export function useBudgets() {
	const { t } = useI18n();
	const f = t.factory;
	const automation = useAutomation().data?.automation.budgets;
	const writes = useFactoryWrites();
	const { failure, run } = useGuard();
	const [editing, setEditing] = useState(false);
	// A new limit has its form at the end of the list: the typed key must not move it.
	const [adding, setAdding] = useState(false);
	const [scope, setScope] = useState<Scope>("day");
	const [key, setKey] = useState("");
	// The row that the form edits: typing in its key must not move the form.
	const [row, setRow] = useState<{ scope: Scope; key: string } | null>(null);
	const [amount, setAmount] = useState("");
	const field = useRef<HTMLInputElement>(null);
	// The configured budgets: the default `*` once, then each key of its own.
	const list = (["day", "member"] as const).flatMap((scope) =>
		Object.entries(automation?.[scope] ?? {})
			.flatMap(([k, usd]) => (usd === null ? [] : [{ k, usd }]))
			.sort((a, b) => Number(b.k === "*") - Number(a.k === "*") || a.k.localeCompare(b.k))
			.map(({ k, usd }) => ({
				id: `${scope}:${k}`,
				scope,
				key: k,
				name: k === "*" ? (scope === "day" ? f.perDay : f.perMember) : k,
				budget: usd,
			})),
	);
	const set = () =>
		void run(async () => {
			const usd = usdOf(amount, t.factory.runsRecipes.budgetError);
			await writes.budget(scope, key.trim(), usd);
			setKey("");
			setAmount("");
			setEditing(false);
		});
	/** Opens the form on one budget. */
	const edit = (scope: Scope, key: string, amount = "") => {
		setScope(scope);
		setKey(key);
		setAmount(amount);
		setRow({ scope, key });
		setAdding(key === "");
		setEditing(true);
	};
	return {
		list,
		failure,
		editing,
		adding,
		row,
		setEditing,
		scope,
		setScope,
		key,
		setKey,
		amount,
		setAmount,
		field,
		set,
		edit,
	};
}

type Machine = { runner: string; amount: string };
const ALL = "";

/**
 * Budgets (picture 083, `page=budgets` of Spend): one row for each kind of limit with its value and
 * Edit in place, and the spend of this computer by day, AI tool, model or project. A feature has no
 * limit of its own to set: the limit comes from its recipe, so that row has no Edit.
 */
export function BudgetsPage() {
	const { t } = useI18n();
	const f = t.factory;
	const s = f.spendPage;
	const m = f.machine;
	const b = useBudgets();
	const rules = useBudgetRules();
	const gate = useRights().gate("project.settings");
	const { prices, price, menu } = usePrices();
	const spend = useMachineSpend(90);
	const writes = useMachineWrites();
	const { failure, run } = useGuard();
	const [machine, setMachine] = useState<Machine | null>(null);
	const machineBudgets = spend.data?.budgets ?? [];
	const runners = [...new Set((spend.data?.rows ?? []).map((r) => r.runner))];
	const featureLimit = useFeatureLimit();
	const feature = featureLimit.usd;
	const money = (usd: number | null) => (usd === null ? s.noLimit : price(`$${usd.toFixed(2)}`));
	const of = (scope: Scope, key: string) => b.list.find((x) => x.scope === scope && x.key === key);
	const only = b.list.filter((x) => x.key !== "*");
	const tools = machineBudgets.filter((x) => x.runner !== ALL && x.usd !== null);
	const month = machineBudgets.find((x) => x.runner === ALL)?.usd ?? null;
	const editScope = (scope: Scope) => {
		setMachine(null);
		b.edit(scope, "*", String(of(scope, "*")?.budget ?? ""));
	};
	const editMachine = (runner: string, usd: number | null) => {
		b.setEditing(false);
		setMachine({ runner, amount: usd === null ? "" : String(usd) });
	};
	const thisMonth = new Date().toISOString().slice(0, 7);
	const monthUsd = (spend.data?.rows ?? [])
		.filter((r) => r.day.startsWith(thisMonth))
		.reduce((a, r) => a + (r.costUsd ?? 0), 0);
	// The form opens under the row that it edits.
	const at = (scope: Scope, key: string) =>
		b.editing && !b.adding && b.row?.scope === scope && b.row.key === key ? limitForm : null;
	const atMachine = (runner: string) => (machine?.runner === runner ? machineForm : null);
	const row = (
		name: string,
		value: number | null,
		onEdit?: () => void,
		link?: boolean,
		meter?: boolean,
		then?: ThenScope,
		form?: ReactNode,
	) => (
		<Fragment key={name}>
			<Row>
				<span className="flex-1">{name}</span>
				{/* The meter of a monthly limit is a function of today: it stays with its limit. */}
				{meter ? (
					<span className="w-40">
						<SpendMeter usd={monthUsd} budget={value} label={m.budget} />
					</span>
				) : null}
				<span className="font-semibold">{money(value)}</span>
				{then ? (
					<Select
						label={format(f.runsRecipes.thenFor, { name: name.toLowerCase() })}
						className="min-h-control w-40"
						items={THEN.map((v) => ({ value: v, label: f.runsRecipes.choice[v] }))}
						value={rules.choice(then)}
						// The save needs the right to change the project: the control is off without it.
						disabled={gate.disabled}
						reason={gate.reason}
						onValueChange={(v) => void rules.setThen(then, v as Then)}
					/>
				) : (
					// An empty slot keeps the limits of all rows in one column.
					<span aria-hidden="true" className="w-40" />
				)}
				{onEdit ? (
					<Button
						className="min-h-control"
						aria-label={format(s.editLimit, { name: name.toLowerCase() })}
						onClick={onEdit}
					>
						{f.edit}
					</Button>
				) : link ? (
					// The limit of a feature is the budget of its recipe: Edit opens that row.
					<Link
						{...featureLimit.link}
						aria-label={format(s.editLimit, { name: name.toLowerCase() })}
						className={buttonVariants()}
					>
						{f.edit}
					</Link>
				) : null}
			</Row>
			{form}
		</Fragment>
	);
	const limitForm = (
		<div className="flex flex-wrap items-end gap-2 px-6 py-3">
			{b.key === "*" ? null : (
				<>
					<Select
						caption
						label={f.budgetScope}
						className="min-h-control"
						items={[
							{ value: "day", label: f.perDay },
							{ value: "member", label: f.perMember },
						]}
						value={b.scope}
						onValueChange={(v) => b.setScope(v === "member" ? "member" : "day")}
					/>
					<Input
						ref={b.field}
						autoFocus={b.key === ""}
						caption
						label={f.budgetKey}
						className="min-h-control w-48"
						value={b.key}
						onChange={(e) => b.setKey(e.target.value)}
					/>
				</>
			)}
			<Input
				caption
				label={f.budgetAmount}
				autoFocus={b.key !== ""}
				type="number"
				min="0"
				step="any"
				className="min-h-control w-28"
				value={b.amount}
				onChange={(e) => b.setAmount(e.target.value)}
			/>
			<RightButton
				right="project.settings"
				variant="primary"
				className="min-h-control"
				disabled={!b.key.trim()}
				onClick={b.set}
			>
				{f.setBudget}
			</RightButton>
		</div>
	);
	const machineForm = machine && (
		<div className="flex flex-wrap items-end gap-2 px-6 py-3">
			<Select
				caption
				label={m.budgetFor}
				className="min-h-control"
				items={[ALL, ...new Set([...runners, ...tools.map((x) => x.runner)])].map((r) => ({
					value: r,
					label: r === ALL ? m.allRunners : runnerName(r),
				}))}
				value={machine.runner}
				onValueChange={(runner) => setMachine({ ...machine, runner })}
			/>
			<Input
				caption
				label={m.budgetAmount}
				autoFocus
				type="number"
				min="0"
				step="any"
				className="min-h-control w-28"
				value={machine.amount}
				onChange={(e) => setMachine({ ...machine, amount: e.target.value })}
			/>
			<RightButton
				right="project.settings"
				variant="primary"
				className="min-h-control"
				onClick={() =>
					void run(async () => {
						const { runner, amount } = machine;
						await writes.budget(runner, usdOf(amount, f.runsRecipes.budgetError));
						setMachine(null);
					})
				}
			>
				{m.save}
			</RightButton>
		</div>
	);
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader
				title={s.budgetsTitle}
				back={<BackToSpend />}
				menu={[
					...menu,
					{
						label: s.addLimit,
						onClick: () => {
							setMachine(null);
							b.edit("day", "");
						},
					},
				]}
			/>
			<div className="flex flex-wrap items-start gap-5 px-4 pb-4">
				<div className="flex flex-[2_1_21rem] flex-col gap-5">
					<ErrorNotice error={b.failure ?? failure ?? rules.failure} />
					<Card className="py-2" role="region" aria-label={f.budgets}>
						<h2 className="px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11">{s.limits}</h2>
						{row(s.eachFeature, feature, undefined, true, false, "feature")}
						{row(
							s.eachDay,
							of("day", "*")?.budget ?? null,
							() => editScope("day"),
							false,
							false,
							"day",
							at("day", "*"),
						)}
						{row(
							s.eachMonth,
							month,
							() => editMachine(ALL, month),
							false,
							true,
							undefined,
							atMachine(ALL),
						)}
						{row(
							s.eachPerson,
							of("member", "*")?.budget ?? null,
							() => editScope("member"),
							false,
							false,
							"member",
							at("member", "*"),
						)}
						{row(
							s.eachTool,
							null,
							() => editMachine(runners[0] ?? ALL, null),
							false,
							false,
							undefined,
							machine && machine.runner !== ALL && !tools.some((x) => x.runner === machine.runner)
								? machineForm
								: null,
						)}
						<ul aria-label={f.budget} className="contents">
							{only.map((x) => (
								<li key={x.id} className="contents">
									{row(
										x.name,
										x.budget,
										() => {
											setMachine(null);
											b.edit(x.scope, x.key, String(x.budget ?? ""));
										},
										false,
										false,
										undefined,
										at(x.scope, x.key),
									)}
								</li>
							))}
							{tools.map((x) => (
								<li key={x.runner} className="contents">
									{row(
										runnerName(x.runner),
										x.usd,
										() => editMachine(x.runner, x.usd),
										false,
										false,
										undefined,
										atMachine(x.runner),
									)}
								</li>
							))}
						</ul>
						{b.editing && b.adding ? limitForm : null}
					</Card>
					<RowsCard title={s.atLimit}>
						<Row>
							<span className="flex-1">{s.warnAt}</span>
							<WarnAt />
						</Row>
					</RowsCard>
				</div>
				<SpendChart prices={prices} />
			</div>
		</div>
	);
}
