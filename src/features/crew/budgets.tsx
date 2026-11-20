import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useGuard } from "@/features/work/guard";
import { useFactoryWrites, useMachineSpend, useMachineWrites, useUsage } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { commands, type Then, unwrap } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { syncKeys, useAutomation } from "@/lib/sync";
import { runnerName } from "@/ui/atoms/brand-icon";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { Card } from "@/ui/molecules/card";
import { PageHeader } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";
import { SpendMeter } from "@/ui/molecules/spend-meter";
import { SpendChart } from "./budgets-chart";
import { WARN_AT } from "./spend-const";
import { BackToSpend, RowsCard, usePrices } from "./spend-parts";

type Scope = "day" | "member";
/** The kinds of budget that have a choice `Then` (`runs-recipes` REQ-006). */
type ThenScope = "feature" | "day" | "member";
const THEN: Then[] = ["stop_ask", "pause", "ask", "go_on"];

/**
 * Warn at and Then of the project budgets (`runs-recipes` REQ-006): read from the automation file,
 * saved with the whole file, as the other forms do. Warn at is one percent for the project.
 */
export function useBudgetRules() {
	const { t } = useI18n();
	const qc = useQueryClient();
	const view = useAutomation().data;
	const { error, run } = useGuard();
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
		then: (scope: ThenScope): Then => budgets?.then?.[scope] ?? "stop_ask",
		error,
		setWarn: (text: string) =>
			save({ warn_at: Number(text) }, () =>
				/^\d+$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= 100
					? null
					: t.factory.runsRecipes.warnAtError,
			),
		setThen: (scope: ThenScope, value: Then) =>
			save({
				then: {
					feature: "stop_ask",
					day: "stop_ask",
					member: "stop_ask",
					...budgets?.then,
					[scope]: value,
				},
			}),
	};
}

/** "Warn at 80 %" with Edit: the value turns into a field with Save. */
export function WarnAt() {
	const { t } = useI18n();
	const r = t.factory.runsRecipes;
	const rules = useBudgetRules();
	const [text, setText] = useState<string | null>(null);
	if (text === null)
		return (
			<>
				<span>{rules.warn} %</span>
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
			{rules.error ? (
				<p role="alert" className="w-full text-ui text-danger-text">
					{rules.error}
				</p>
			) : null}
		</form>
	);
}

/** The budgets of the project and the state of the form that sets one (factory REQ-032). */
export function useBudgets() {
	const { t } = useI18n();
	const f = t.factory;
	const automation = useAutomation().data?.automation.budgets;
	const writes = useFactoryWrites();
	const { error, run } = useGuard();
	const [editing, setEditing] = useState(false);
	const [scope, setScope] = useState<Scope>("day");
	const [key, setKey] = useState("");
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
			const usd = amount.trim() === "" ? null : Number(amount);
			await writes.budget(scope, key.trim(), usd);
			setKey("");
			setAmount("");
		});
	/** Opens the form on one budget. */
	const edit = (scope: Scope, key: string, amount = "") => {
		setScope(scope);
		setKey(key);
		setAmount(amount);
		setEditing(true);
	};
	return {
		list,
		error,
		editing,
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
	const { prices, price, menu } = usePrices();
	const usage = useUsage().data;
	const spend = useMachineSpend(90);
	const writes = useMachineWrites();
	const { error, run } = useGuard();
	const [machine, setMachine] = useState<Machine | null>(null);
	const machineBudgets = spend.data?.budgets ?? [];
	const runners = [...new Set((spend.data?.rows ?? []).map((r) => r.runner))];
	const limits = (usage?.runs ?? []).flatMap((r) => (r.budget === null ? [] : [r.budget]));
	const feature = limits.length ? Math.max(...limits) : null;
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
	const row = (
		name: string,
		value: number | null,
		onEdit?: () => void,
		link?: boolean,
		meter?: boolean,
		then?: ThenScope,
	) => (
		<Row key={name}>
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
					className="min-h-control"
					items={THEN.map((v) => ({ value: v, label: f.runsRecipes.choice[v] }))}
					value={rules.then(then)}
					onValueChange={(v) => void rules.setThen(then, v as Then)}
				/>
			) : null}
			{onEdit ? (
				<Button
					className="min-h-control"
					aria-label={format(s.editLimit, { name: name.toLowerCase() })}
					onClick={onEdit}
				>
					{f.edit}
				</Button>
			) : link ? (
				// The limit of a feature comes from its recipe: Edit opens the recipes.
				<Link
					to="/crew/recipes"
					aria-label={format(s.editLimit, { name: name.toLowerCase() })}
					className={buttonVariants()}
				>
					{f.edit}
				</Link>
			) : null}
		</Row>
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
					{b.error || error || rules.error ? (
						<p role="alert" className="text-ui text-danger-text">
							{b.error ?? error ?? rules.error}
						</p>
					) : null}
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
						)}
						{row(s.eachMonth, month, () => editMachine(ALL, month), false, true)}
						{row(
							s.eachPerson,
							of("member", "*")?.budget ?? null,
							() => editScope("member"),
							false,
							false,
							"member",
						)}
						{row(s.eachTool, null, () => editMachine(runners[0] ?? ALL, null))}
						<ul aria-label={f.budget} className="contents">
							{only.map((x) => (
								<li key={x.id} className="contents">
									{row(x.name, x.budget, () => {
										setMachine(null);
										b.edit(x.scope, x.key, String(x.budget ?? ""));
									})}
								</li>
							))}
							{tools.map((x) => (
								<li key={x.runner} className="contents">
									{row(runnerName(x.runner), x.usd, () => editMachine(x.runner, x.usd))}
								</li>
							))}
						</ul>
						{b.editing ? (
							<div className="flex flex-wrap items-end gap-2 px-6 py-3">
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
									caption
									label={f.budgetKey}
									className="min-h-control w-48"
									value={b.key}
									onChange={(e) => b.setKey(e.target.value)}
								/>
								<Input
									caption
									label={f.budgetAmount}
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
						) : null}
						{machine ? (
							<div className="flex flex-wrap items-end gap-2 px-6 py-3">
								<Select
									caption
									label={m.budgetFor}
									className="min-h-control"
									items={[ALL, ...new Set([...runners, ...tools.map((x) => x.runner)])].map(
										(r) => ({ value: r, label: r === ALL ? m.allRunners : runnerName(r) }),
									)}
									value={machine.runner}
									onValueChange={(runner) => setMachine({ ...machine, runner })}
								/>
								<Input
									caption
									label={m.budgetAmount}
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
											await writes.budget(runner, amount.trim() === "" ? null : Number(amount));
											setMachine(null);
										})
									}
								>
									{m.save}
								</RightButton>
							</div>
						) : null}
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
