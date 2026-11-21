import { useQueries } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LibraryPage, LinkedCard } from "@/features/library/page-parts";
import { WithProject } from "@/features/shell/no-project";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import {
	type Plan,
	type Requirement,
	specsKeys,
	useBdd,
	useRequirements,
	useSpecsActions,
	useTestPlans,
} from "@/lib/specs";
import { type LintRule, lintGherkin } from "@/lib/specs/bdd-lint";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Chip } from "@/ui/atoms/chip";
import { BackLink } from "@/ui/molecules/back-link";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Row } from "@/ui/molecules/row";
import { useGuard } from "./guard";
import { missingTests, ROW_BUTTON, type Verdict, worst } from "./parts";
import { openPlanAt } from "./test-plans";

/** The cards, in the order of the page. */
const STATES: Verdict[] = ["pass", "fail", "not-covered", "partial", "blocked"];
const TONE = { pass: "success", fail: "you" } as const;
const RULES: LintRule[] = ["noThen", "noWhen", "empty", "dup"];

/** The state of a requirement: the worst result of its scenarios. No scenario: not covered. */
const stateOf = (r: Requirement): Verdict =>
	r.scenarios.length ? worst(r.scenarios.map((h) => h.verdict)) : "not-covered";

/** The check of the scenarios of each plan: one row for each rule, then each finding. */
function LintCard({
	plans,
	onOpen,
}: {
	plans: Plan[];
	onOpen: (path: string, line: number) => void;
}) {
	const { t } = useI18n();
	const p = t.specs.page;
	// The same keys as `useFile`: an open plan and the check share one read.
	const texts = useQueries({
		queries: plans.map((pl) => ({
			queryKey: specsKeys.file(pl.path),
			queryFn: () => unwrap(commands.specsRead(pl.path)),
			retry: false,
			refetchOnWindowFocus: false,
		})),
	});
	const findings = plans.flatMap((pl, i) =>
		lintGherkin(texts[i]?.data?.text ?? "").map((f) => ({ ...f, plan: pl })),
	);
	return (
		<LinkedCard title={p.lint}>
			{RULES.map((rule) => {
				const n = findings.filter((f) => f.rule === rule).length;
				return (
					<Row key={rule}>
						<span className="min-w-0 flex-[1_1_160px] font-semibold">{p.rule[rule]}</span>
						{n ? <Badge variant="you">{n}</Badge> : <Badge variant="success">{p.none}</Badge>}
					</Row>
				);
			})}
			{findings.map((f) => (
				<Row
					key={`${f.plan.path}:${f.line}:${f.rule}`}
					className={ROW_BUTTON}
					render={(props) => (
						<button type="button" onClick={() => onOpen(f.plan.path, f.line)} {...props} />
					)}
				>
					<span className="min-w-0 flex-[1_1_160px]">
						{format(t.reports.bdd.rule[f.rule], { scenario: f.scenario })}
					</span>
					<span className="text-n-11">{f.plan.title}</span>
				</Row>
			))}
		</LinkedCard>
	);
}

/** Library / What is tested: the requirements by the state of their tests, and the check of the scenarios. */
export function Coverage() {
	const { t } = useI18n();
	return (
		<WithProject title={t.specs.page.whatTested} icon={null}>
			<CoveragePage />
		</WithProject>
	);
}

function CoveragePage() {
	const { t, code } = useI18n();
	const s = t.specs;
	const p = s.page;
	const { ask, openRef } = useShell();
	const navigate = useNavigate();
	const act = useSpecsActions();
	const { failure, run } = useGuard();
	const plans = useTestPlans().data ?? [];
	const reqs = useRequirements().data ?? [];
	const last = (useBdd().data ?? [])
		.map((b) => b.at)
		.sort()
		.pop();
	const [filter, setFilter] = useState<Verdict | "all">("all");
	const missing = missingTests(reqs);
	const openPlan = (path: string, line: number | null) => {
		openPlanAt(path, line);
		void navigate({ to: "/library/test-plans" });
	};
	const label = (v: Verdict) =>
		v === "pass"
			? p.passing
			: v === "fail"
				? s.filter.failing
				: v === "not-covered"
					? s.filter.uncovered
					: s.verdict[v];
	return (
		<LibraryPage
			className="pt-3"
			title={p.whatTested}
			back={
				<BackLink
					label={t.tabs.specs["test-plans"]}
					render={(props) => <Link to="/library/test-plans" {...props} />}
				/>
			}
			action={
				<>
					{last ? (
						<span className="text-n-11">
							{format(s.lastRun, {
								date: new Date(last).toLocaleDateString(code, { dateStyle: "long" }),
							})}
						</span>
					) : null}
					{missing.length ? (
						<RightButton
							right="specs.edit"
							onClick={() =>
								void run(async () => {
									let path = "";
									for (const cap of missing) path = (await act.generatePlan(cap)).path;
									openPlan(path, null);
								})
							}
						>
							{p.writeMissing}
						</RightButton>
					) : null}
					<Button variant="primary" onClick={() => ask(p.runTestsPrompt)}>
						{p.runTests}
					</Button>
				</>
			}
		>
			<fieldset aria-label={p.show} className="flex flex-wrap gap-2">
				{(["all", "fail", "not-covered", "partial", "blocked"] as const).map((v) => (
					<Chip
						key={v}
						selected={filter === v}
						onClick={() => setFilter(v)}
						className={filter === v ? undefined : "bg-surface-2"}
					>
						{v === "all" ? s.filter.all : label(v)}
					</Chip>
				))}
			</fieldset>
			<ErrorNotice error={failure} />
			<div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-3">
				{STATES.filter((v) => filter === "all" || filter === v).map((v) => {
					const rows = reqs.filter((r) => stateOf(r) === v);
					return (
						<Card key={v} className="py-2">
							<section aria-label={label(v)}>
								<h2 className="flex items-center gap-2.5 px-6 pt-3.5 pb-1.5 text-20 font-semibold text-n-12">
									{label(v)}
									<Badge variant={v === "pass" || v === "fail" ? TONE[v] : "neutral"}>
										{rows.length}
									</Badge>
								</h2>
								{rows.map((r) => {
									const hit = r.scenarios.find((h) => h.verdict === v) ?? r.scenarios[0];
									return (
										<Row
											key={r.reference}
											className={ROW_BUTTON}
											render={(props) => (
												<button
													type="button"
													onClick={() =>
														hit ? openPlan(hit.plan, hit.line) : openRef(r.reference)
													}
													{...props}
												/>
											)}
										>
											<span className="min-w-0 flex-[1_1_160px]">{r.title}</span>
											<span className="text-n-11">{r.capability}</span>
										</Row>
									);
								})}
							</section>
						</Card>
					);
				})}
				{filter === "all" && plans.length ? <LintCard plans={plans} onOpen={openPlan} /> : null}
			</div>
		</LibraryPage>
	);
}
