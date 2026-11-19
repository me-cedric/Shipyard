import { Link } from "@tanstack/react-router";
import { type ReactNode, useRef, useState } from "react";
import { LibraryPage, LinkedCard, PageColumns, SideCards } from "@/features/library/page-parts";
import { WithProject } from "@/features/shell/no-project";
import { format, useI18n } from "@/lib/i18n";
import { copyText } from "@/lib/menus";
import { RightButton, useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { rememberSelection, useTabSelection } from "@/lib/shell/selection";
import {
	type Plan,
	planRef,
	type Requirement,
	useBdd,
	useRequirements,
	useSpecsActions,
	useTestPlans,
} from "@/lib/specs";
import { Badge } from "@/ui/atoms/badge";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { ChevronRightIcon, PlusIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { gherkin } from "@/ui/molecules/code-editor";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { RefChip } from "@/ui/molecules/ref-chip";
import { Row } from "@/ui/molecules/row";
import { caretToEnd } from "./constitution";
import { FileEditor } from "./file-editor";
import { useGuard } from "./guard";
import { NameDialog } from "./name-dialog";
import { capOf, missingTests, ROW_BUTTON, VerdictBadge, worst } from "./parts";

const DIR = "docs/delivery/test-plans";
const SCOPE = "specs:test-plans";
const slug = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

// The line that another page asked to show in the text of a plan. The plan page reads it once.
let jump: number | null = null;
/** Opens a plan on Test plans, at a line of its text when `line` is given. */
export function openPlanAt(path: string, line: number | null) {
	rememberSelection(SCOPE, path);
	jump = line;
}

type Scenario = {
	title: string;
	/** The line of the scenario in the text, from 1. */
	line: number;
	tags: string[];
	steps: [word: string, rest: string][];
};

/**
 * The scenarios of a plan with their steps.
 * shortcut: English keywords only, a plan in another language opens in its text; read the keywords of the `# language:` line when a project needs it.
 */
export function parsePlan(text: string): Scenario[] {
	const scenarios: Scenario[] = [];
	// The tag lines name the requirement that a scenario covers. A scenario also holds the tags of its feature and rule.
	let tags: string[] = [];
	let feature: string[] = [];
	let rule: string[] = [];
	text.split("\n").forEach((raw, i) => {
		const line = raw.trim();
		const head = /^(Background|Scenario(?: Outline| Template)?|Example):\s*(.*)$/.exec(line);
		if (head) {
			scenarios.push({
				title: head[2] || (head[1] ?? ""),
				line: i + 1,
				tags: [...feature, ...rule, ...tags],
				steps: [],
			});
			tags = [];
		} else if (line.startsWith("@")) tags.push(...line.split(/\s+/));
		else if (line.startsWith("Feature:")) {
			feature = tags;
			tags = [];
		} else if (line.startsWith("Rule:")) {
			rule = tags;
			tags = [];
		} else if (/^#|^$/.test(line)) return;
		else {
			// A line that starts with no step word, such as a row of a table, keeps its place.
			const step = /^(Given|When|Then|And|But)\s+(.*)$/.exec(line);
			scenarios.at(-1)?.steps.push(step ? [step[1] ?? "", step[2] ?? ""] : ["", line]);
		}
	});
	return scenarios;
}

/** One plan: its scenario cards with the last result, its requirements and the other plans. */
function PlanView({
	plan,
	plans,
	onOpen,
	onNew,
}: {
	plan: Plan;
	plans: Plan[];
	onOpen: (path: string) => void;
	onNew: () => void;
}) {
	const { t } = useI18n();
	const s = t.specs;
	const p = s.page;
	const { ask, openRef } = useShell();
	const { gate } = useRights();
	const act = useSpecsActions();
	const { failure, run } = useGuard();
	const host = useRef<HTMLDivElement>(null);
	// `n` makes each click new: the same line picked again shows the text again.
	const [pick, setPick] = useState(() => {
		const line = jump;
		jump = null;
		return { line, n: 0 };
	});
	const show = (line: number) => setPick((k) => ({ line, n: k.n + 1 }));
	const bdd = (useBdd().data ?? []).filter((b) => b.plan === plan.path);
	const reqs = useRequirements().data ?? [];
	const caps = new Set(plan.refs.filter((r) => r.startsWith("spec:")).map(capOf));
	const mine = reqs.filter((r) => caps.has(r.capability));
	const missing = missingTests(mine);
	const name = (tag: string) =>
		reqs.find((r) => `@${r.reference}` === tag)?.title ?? tag.replace(/^@/, "");
	const first = plan.errors[0];

	const page = (text: string): ReactNode => {
		const scenarios = parsePlan(text);
		if (!scenarios.length) return null;
		return (
			<article aria-label={plan.title} className="flex flex-col gap-4">
				{scenarios.map((sc) => (
					<Card key={sc.line} pad className="flex flex-col gap-3">
						<div className="flex flex-wrap items-center gap-4">
							<h2 className="mr-auto min-w-0 text-20 font-semibold break-words text-n-12">
								{sc.title}
							</h2>
							<VerdictBadge
								v={
									(bdd.find((b) => b.line === sc.line) ?? bdd.find((b) => b.scenario === sc.title))
										?.verdict ?? "not-covered"
								}
								idle={p.notRun}
							/>
							<Button
								aria-label={format(p.editItem, { name: sc.title })}
								onClick={() => show(sc.line)}
							>
								{t.knowledge.handbook.edit}
							</Button>
						</div>
						{sc.tags.length ? (
							<p className="flex flex-wrap gap-1.5">
								{sc.tags.map((tag) => (
									<Badge key={tag}>{name(tag)}</Badge>
								))}
							</p>
						) : null}
						<ul className="flex flex-col gap-3">
							{sc.steps.map(([word, rest], j) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: the steps have no id and keep their order
								<li key={j} className="flex items-baseline gap-3.5 text-17">
									<span className="w-14 shrink-0 text-13 font-semibold text-n-11">{word}</span>
									<span className="min-w-0 break-words">{rest}</span>
								</li>
							))}
						</ul>
					</Card>
				))}
			</article>
		);
	};

	return (
		<FileEditor
			path={plan.path}
			title={plan.title}
			refId={planRef(plan.path)}
			problem={first ?? null}
			line={pick.line}
			pick={pick.n}
			highlight={gherkin}
			read
			page={page}
			frame={({ modes, editing, edit, body }) => (
				<LibraryPage
					title={format(p.testPlan, { name: plan.title })}
					action={
						<>
							{modes}
							<Link to="/library/test-plans/coverage" className={buttonVariants()}>
								{p.whatTested}
							</Link>
							<Button
								onClick={() => {
									edit();
									caretToEnd(host.current);
								}}
							>
								{p.addScenario}
							</Button>
							{missing.length ? (
								<RightButton
									right="specs.edit"
									onClick={() =>
										void run(async () => {
											let path = plan.path;
											for (const cap of missing) path = (await act.generatePlan(cap)).path;
											onOpen(path);
										})
									}
								>
									{p.writeForMe}
								</RightButton>
							) : null}
							<Button
								variant="primary"
								onClick={() => ask(format(p.runPrompt, { name: plan.title, path: plan.path }))}
							>
								{p.run}
							</Button>
						</>
					}
					menu={[
						{ label: s.newPlan, onClick: onNew, disabled: gate("specs.edit").disabled },
						{ label: p.copyRef, onClick: () => void copyText(planRef(plan.path)) },
						{ label: p.copyFile, onClick: () => void copyText(plan.path) },
					]}
				>
					<Badge
						dot
						variant={plan.errors.length ? "you" : "success"}
						className="self-start"
						role="status"
					>
						{plan.errors.length ? format(p.textErrors, { count: plan.errors.length }) : p.textClean}
					</Badge>
					<ErrorNotice error={failure} />
					<PageColumns>
						<div ref={host} className="flex min-w-0 flex-[3_1_480px] flex-col gap-4">
							{editing ? (
								<Card pad className="flex min-h-[32rem] flex-col">
									{body}
								</Card>
							) : (
								body
							)}
						</div>
						<SideCards className="flex-[2_1_300px]">
							{mine.length ? (
								<LinkedCard title={t.review.plans.requirements}>
									{mine.map((req) => (
										<RequirementRow
											key={req.reference}
											req={req}
											plan={plan.path}
											onOpen={() => openRef(req.reference)}
										/>
									))}
								</LinkedCard>
							) : null}
							{plans.length > 1 ? (
								<LinkedCard title={p.otherPlans}>
									{plans
										.filter((o) => o.path !== plan.path)
										.map((o) => (
											<Row
												key={o.path}
												className={ROW_BUTTON}
												render={(props) => (
													<button type="button" onClick={() => onOpen(o.path)} {...props} />
												)}
											>
												<span className="min-w-0 font-semibold">{o.title}</span>
												<ChevronRightIcon size={20} className="ml-auto" />
											</Row>
										))}
								</LinkedCard>
							) : null}
						</SideCards>
					</PageColumns>
				</LibraryPage>
			)}
		>
			{plan.errors.length ? (
				<Card className="py-2">
					<ul aria-label={s.errors} className="flex flex-col">
						{plan.errors.map((e) => (
							<li key={`${e.line}:${e.message}`} className="[&+&]:border-t [&+&]:border-n-6">
								<button
									type="button"
									onClick={() => show(e.line)}
									className="flex min-h-15 w-full cursor-pointer flex-wrap items-center gap-3 px-6 text-left hover:bg-n-2"
								>
									<span className="font-semibold">
										{s.editor.line} {e.line}
									</span>
									<span className="min-w-0 break-words text-n-11">{e.message}</span>
								</button>
							</li>
						))}
					</ul>
				</Card>
			) : null}
			{plan.broken.length ? (
				<Card pad className="flex flex-col gap-2">
					<h2 className="text-13 font-semibold text-n-11">{s.broken}</h2>
					<ul aria-label={s.broken} className="flex flex-wrap gap-1.5">
						{plan.broken.map((r) => (
							<li key={r}>
								<RefChip refId={r} state="broken" />
							</li>
						))}
					</ul>
				</Card>
			) : null}
		</FileEditor>
	);
}

/** One requirement of a plan: its name and the state that the scenarios of the plan give it. */
function RequirementRow({
	req,
	plan,
	onOpen,
}: {
	req: Requirement;
	plan: string;
	onOpen: () => void;
}) {
	const { t } = useI18n();
	const p = t.specs.page;
	const hits = req.scenarios.filter((h) => h.plan === plan);
	const verdict = hits.length ? worst(hits.map((h) => h.verdict)) : null;
	return (
		<Row
			className={ROW_BUTTON}
			render={(props) => <button type="button" onClick={onOpen} {...props} />}
		>
			<span className="min-w-0 flex-[1_1_160px] font-semibold">{req.title}</span>
			{verdict === "pass" ? (
				<Badge variant="success">{p.tested}</Badge>
			) : verdict ? (
				<VerdictBadge v={verdict} idle={p.notRun} />
			) : (
				<Badge>{p.noTest}</Badge>
			)}
		</Row>
	);
}

/** Library / Test plans: one plan with its scenarios. The summary of all plans is What is tested. */
export function TestPlans() {
	const { t } = useI18n();
	return (
		<WithProject title={t.tabs.specs["test-plans"]} icon={null}>
			<PlanPage />
		</WithProject>
	);
}

function PlanPage() {
	const { t } = useI18n();
	const s = t.specs;
	const act = useSpecsActions();
	const plans = useTestPlans().data;
	const [open, setOpen] = useTabSelection(SCOPE, plans?.map((p) => p.path) ?? []);
	const [creating, setCreating] = useState(false);
	const current = plans?.find((p) => p.path === open);
	const create = () => setCreating(true);
	return (
		<>
			{current && plans ? (
				<PlanView key={current.path} plan={current} plans={plans} onOpen={setOpen} onNew={create} />
			) : (
				<LibraryPage title={t.tabs.specs["test-plans"]}>
					{plans ? (
						<EmptyState
							title={t.empty.testPlans}
							action={{ label: s.newPlan, icon: <PlusIcon size={14} />, onClick: create }}
						/>
					) : null}
				</LibraryPage>
			)}
			{creating ? (
				<NameDialog
					title={s.newPlan}
					label={s.plan}
					onCreate={async (name) => {
						const path = `${DIR}/${slug(name)}.feature`;
						await act.write(path, `Feature: ${name}\n`, null, true);
						setOpen(path);
					}}
					onClose={() => setCreating(false)}
				/>
			) : null}
		</>
	);
}
