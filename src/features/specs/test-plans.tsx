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

/** One plan in Gherkin. The syntax errors and the broken citations come from the saved file. */
function PlanEditor({ plan, onBack }: { plan: Plan; onBack: () => void }) {
	const { t } = useI18n();
	const [line, setLine] = useState<number | null>(null);
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
				line={line}
				highlight={gherkin}
			>
				{plan.errors.length ? (
					<ul aria-label={t.specs.errors} className="flex flex-col">
						{plan.errors.map((e) => (
							<li key={`${e.line}:${e.message}`}>
								<button
									type="button"
									onClick={() => setLine(e.line)}
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
	const current = plans?.find((p) => p.path === open);
	if (current) return <PlanEditor plan={current} onBack={() => setOpen(null)} />;
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
					<PlanLint plans={plans ?? []} onOpen={setOpen} />
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
