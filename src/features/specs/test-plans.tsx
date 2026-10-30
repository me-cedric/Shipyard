import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { useShell } from "@/lib/shell";
import { useTabSelection } from "@/lib/shell/selection";
import {
	type Plan,
	planRef,
	useBdd,
	useCapabilities,
	useCoverage,
	useSpecsActions,
	useTestPlans,
} from "@/lib/specs";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { CheckIcon, ChevronLeftIcon, PlusIcon } from "@/ui/icons";
import { gherkin } from "@/ui/molecules/code-editor";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Panel } from "@/ui/molecules/panel";
import { RefChip } from "@/ui/molecules/ref-chip";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { DataTable } from "@/ui/organisms/data-table";
import { ListDetail } from "@/ui/templates/list-detail";
import { FileEditor } from "./file-editor";
import { NameDialog } from "./name-dialog";
import { WithProject } from "./no-project";

// Two lines of chips; a longer list is clipped.
const PLAN_ROW = 56;
const DIR = "docs/delivery/test-plans";
const slug = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

/** The requirements of one capability that no scenario cites (REQ-013). */
function Coverage({ cap }: { cap: string }) {
	const { t } = useI18n();
	const { openRef } = useShell();
	const list = useCoverage(cap).data;
	if (!list) return null;
	return (
		<section aria-label={`${t.specs.coverage}: ${cap}`} className="flex flex-col gap-1">
			<h3 className="text-12 font-medium text-n-11">
				{format(t.count, { name: cap, count: list.length })}
			</h3>
			<ul className="flex flex-wrap gap-1">
				{list.map((r) => (
					<li key={r}>
						<RefChip refId={r} state="resolved" onOpen={openRef} />
					</li>
				))}
			</ul>
		</section>
	);
}

const VERDICT_BADGE = {
	pass: "success",
	fail: "danger",
	partial: "warning",
	blocked: "warning",
	"not-covered": "neutral",
} as const;

/** Every scenario of every plan with the verdict of its last run (the `.json` beside the plan). */
function Behaviour() {
	const { t, lang } = useI18n();
	const s = t.specs;
	const rows = useBdd().data ?? [];
	if (rows.length === 0) return null;
	const date = new Intl.DateTimeFormat(lang, { dateStyle: "medium" });
	const count = (v: string) => rows.filter((r) => r.verdict === v).length;
	const known = (v: string): v is keyof typeof VERDICT_BADGE => v in VERDICT_BADGE;
	return (
		<>
			<StatStrip
				items={[
					{ label: s.scenarios, value: String(rows.length), icon: <CheckIcon size={14} /> },
					{
						label: s.verdict.pass,
						value: String(count("pass")),
						tone: "success",
					},
					{ label: s.verdict.fail, value: String(count("fail")), tone: "danger" },
					{ label: s.verdict["not-covered"], value: String(count("not-covered")), tone: "info" },
				]}
			/>
			<Panel title={s.behaviour} count={rows.length} flush>
				<ul className="flex flex-col">
					{rows.map((r) => (
						<li
							key={`${r.plan}:${r.line}`}
							className="flex min-h-row items-center gap-3 border-b px-3 text-ui"
						>
							<span className="min-w-0 flex-1 truncate">{r.scenario}</span>
							<span className="hidden font-mono text-12 text-n-11 md:inline">
								{r.plan.slice(r.plan.lastIndexOf("/") + 1)}
							</span>
							{r.at ? (
								<span className="text-12 text-n-11">
									{format(s.lastRun, { date: date.format(new Date(r.at)) })}
								</span>
							) : null}
							<Badge variant={known(r.verdict) ? VERDICT_BADGE[r.verdict] : "neutral"}>
								{known(r.verdict) ? s.verdict[r.verdict] : r.verdict}
							</Badge>
						</li>
					))}
				</ul>
			</Panel>
		</>
	);
}

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
		<WithProject title={t.tabs.specs["test-plans"]}>
			<PlanList />
		</WithProject>
	);
}

function PlanList() {
	const { t } = useI18n();
	const s = t.specs;
	const act = useSpecsActions();
	const plans = useTestPlans().data;
	const caps = useCapabilities().data ?? [];
	// The open item stays with the tab; the cards are the overview.
	const [open, setOpen] = useTabSelection("specs:test-plans");
	const [creating, setCreating] = useState(false);
	const columns = useMemo<ColumnDef<Plan>[]>(
		() => [
			{ id: "title", header: s.plan, cell: ({ row }) => row.original.title },
			{
				id: "scenarios",
				header: s.scenarios,
				meta: { width: "6rem", numeric: true },
				cell: ({ row }) => String(row.original.scenarios),
			},
			{
				id: "refs",
				header: s.cited,
				meta: { width: "2fr" },
				cell: ({ row }) => (
					<span className="flex flex-wrap gap-1">
						{row.original.refs.map((r) => (
							<RefChip
								key={r}
								refId={r}
								state={row.original.broken.includes(r) ? "broken" : "resolved"}
							/>
						))}
					</span>
				),
			},
		],
		[s],
	);
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
					<Button variant="primary" onClick={create}>
						<PlusIcon size={14} />
						{s.newPlan}
					</Button>
				) : null
			}
		>
			{plans && plans.length === 0 ? (
				<div className="p-4">
					<EmptyState
						action={{ label: s.newPlan, icon: <PlusIcon size={14} />, onClick: create }}
					/>
				</div>
			) : (
				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto px-4 pt-1 pb-4">
					<div
						className="flex shrink-0 flex-col overflow-hidden rounded-lg border bg-surface-1 shadow-1"
						style={{ height: Math.min(224, (plans?.length ?? 0) * PLAN_ROW + 28 + 2) }}
					>
						<DataTable
							rowHeight={PLAN_ROW}
							label={t.tabs.specs["test-plans"]}
							data={plans ?? []}
							columns={columns}
							rowId={(p) => p.path}
							onOpen={(p) => setOpen(p.path)}
						/>
					</div>
					<Behaviour />
					{caps.length ? (
						<Panel title={s.coverage} bodyClassName="gap-3 p-3">
							{caps.map((c) => (
								<Coverage key={c.capability} cap={c.capability} />
							))}
						</Panel>
					) : null}
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
