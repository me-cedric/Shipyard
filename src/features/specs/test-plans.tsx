import { useState } from "react";
import { WithProject } from "@/features/shell/no-project";
import { useI18n } from "@/lib/i18n";
import { RightButton } from "@/lib/rights";
import { useTabSelection } from "@/lib/shell/selection";
import { type Plan, planRef, useSpecsActions, useTestPlans } from "@/lib/specs";
import { Button } from "@/ui/atoms/button";
import { CheckIcon, ChevronLeftIcon, PlusIcon } from "@/ui/icons";
import { gherkin } from "@/ui/molecules/code-editor";
import { EmptyState } from "@/ui/molecules/empty-state";
import { RefChip } from "@/ui/molecules/ref-chip";
import { ListDetail } from "@/ui/templates/list-detail";
import { FileEditor } from "./file-editor";
import { NameDialog } from "./name-dialog";
import { PlanBoard } from "./plan-board";
import { PlanLint } from "./test-plans-lint";

const DIR = "docs/delivery/test-plans";
const slug = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

/**
 * The scenarios of a plan with their steps, as a page to read.
 * shortcut: English keywords only, a plan in another language opens in its text; read the keywords of the `# language:` line when a project needs it.
 */
function planPage(text: string, label: string) {
	const scenarios: { title: string; tags: string[]; steps: [word: string, rest: string][] }[] = [];
	// The tag lines name the requirement that a scenario covers. A scenario also holds the tags of its feature and rule.
	let tags: string[] = [];
	let feature: string[] = [];
	let rule: string[] = [];
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		const head = /^(Background|Scenario(?: Outline| Template)?|Example):\s*(.*)$/.exec(line);
		if (head) {
			scenarios.push({
				title: head[2] || (head[1] ?? ""),
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
		} else if (/^#|^$/.test(line)) continue;
		else {
			// A line that starts with no step word, such as a row of a table, keeps its place.
			const step = /^(Given|When|Then|And|But)\s+(.*)$/.exec(line);
			scenarios.at(-1)?.steps.push(step ? [step[1] ?? "", step[2] ?? ""] : ["", line]);
		}
	}
	if (!scenarios.length) return null;
	return (
		<article aria-label={label} className="flex flex-col gap-3">
			{scenarios.map((s, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: two scenarios can hold the same title
				<section key={i} className="flex flex-col gap-2 rounded-lg border bg-surface-2 p-3">
					<h2 className="text-14 font-semibold text-n-12">{s.title}</h2>
					{s.tags.length ? <p className="font-mono text-12 text-n-11">{s.tags.join(" ")}</p> : null}
					<ul className="flex flex-col gap-1 text-ui">
						{s.steps.map(([word, rest], j) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: the steps have no id and keep their order
							<li key={j} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
								<span className="text-12 font-medium text-n-11">{word}</span>
								<span>{rest}</span>
							</li>
						))}
					</ul>
				</section>
			))}
		</article>
	);
}

/** One plan in Gherkin. The syntax errors and the broken citations come from the saved file. */
function PlanEditor({
	plan,
	at,
	onBack,
}: {
	plan: Plan;
	/** The line of the finding that opened the plan. */
	at: number | null;
	onBack: () => void;
}) {
	const { t } = useI18n();
	// `n` makes each click new: the same line picked again shows the text again.
	const [pick, setPick] = useState({ line: at, n: 0 });
	const first = plan.errors[0];
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pt-3 pb-4">
			<h1 className="sr-only">{plan.title}</h1>
			<div>
				<Button variant="ghost" onClick={onBack}>
					<ChevronLeftIcon size={14} />
					{t.specs.back}
				</Button>
			</div>
			<FileEditor
				key={plan.path}
				path={plan.path}
				title={plan.title}
				refId={planRef(plan.path)}
				problem={first ?? null}
				line={pick.line}
				pick={pick.n}
				highlight={gherkin}
				read
				page={(text) => planPage(text, plan.title)}
			>
				{plan.errors.length ? (
					<ul aria-label={t.specs.errors} className="flex flex-col">
						{plan.errors.map((e) => (
							<li key={`${e.line}:${e.message}`}>
								<button
									type="button"
									onClick={() => setPick((p) => ({ line: e.line, n: p.n + 1 }))}
									className="flex min-h-row w-full items-center gap-2 border-b px-1 text-left text-ui"
								>
									<span className="font-mono text-12 text-n-11">
										{t.specs.editor.line} {e.line}
									</span>
									<span className="min-w-0 truncate">{e.message}</span>
								</button>
							</li>
						))}
					</ul>
				) : null}
				{plan.broken.length ? (
					<ul aria-label={t.specs.broken} className="flex flex-wrap gap-1">
						{plan.broken.map((r) => (
							<li key={r}>
								<RefChip refId={r} state="broken" />
							</li>
						))}
					</ul>
				) : null}
			</FileEditor>
		</div>
	);
}

/** Specs / Test plans: the plans, then the requirements that no scenario cites. */
export function TestPlans() {
	const { t } = useI18n();
	return (
		<WithProject title={t.tabs.specs["test-plans"]} icon={<CheckIcon size={16} />}>
			<PlanList />
		</WithProject>
	);
}

function PlanList() {
	const { t } = useI18n();
	const s = t.specs;
	const act = useSpecsActions();
	const plans = useTestPlans().data;
	// The open item stays with the tab; the cards are the overview.
	const [open, setOpen] = useTabSelection("specs:test-plans");
	const [creating, setCreating] = useState(false);
	const [at, setAt] = useState<number | null>(null);
	const current = plans?.find((p) => p.path === open);
	if (current)
		return (
			<PlanEditor
				plan={current}
				at={at}
				onBack={() => {
					setAt(null);
					setOpen(null);
				}}
			/>
		);
	const create = () => setCreating(true);
	return (
		<ListDetail
			title={t.tabs.specs["test-plans"]}
			icon={<CheckIcon size={16} />}
			count={plans?.length}
			action={
				plans?.length ? (
					<RightButton right="specs.edit" variant="primary" onClick={create}>
						<PlusIcon size={14} />
						{s.newPlan}
					</RightButton>
				) : null
			}
		>
			{plans && plans.length === 0 ? (
				<div className="p-4">
					<EmptyState
						title={t.empty.testPlans}
						action={{ label: s.newPlan, icon: <PlusIcon size={14} />, onClick: create }}
					/>
				</div>
			) : (
				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 pt-1 pb-4">
					<PlanBoard plans={plans ?? []} onOpen={setOpen} />
					<PlanLint
						plans={plans ?? []}
						onOpen={(path, line) => {
							setAt(line);
							setOpen(path);
						}}
					/>
				</div>
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
		</ListDetail>
	);
}
