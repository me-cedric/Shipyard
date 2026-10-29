import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { useShell } from "@/lib/shell";
import {
	type Plan,
	planRef,
	useCapabilities,
	useCoverage,
	useSpecsActions,
	useTestPlans,
} from "@/lib/specs";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { ChevronLeftIcon, PlusIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { RefChip } from "@/ui/molecules/ref-chip";
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

/** One plan in Gherkin. The syntax errors and the broken citations come from the saved file. */
function PlanEditor({ plan, onBack }: { plan: Plan; onBack: () => void }) {
	const { t } = useI18n();
	const [line, setLine] = useState<number | null>(null);
	const first = plan.errors[0];
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
			<h1 className="sr-only">{plan.title}</h1>
			<div>
				<IconButton label={t.specs.back} onClick={onBack}>
					<ChevronLeftIcon size={14} />
				</IconButton>
			</div>
			<FileEditor
				key={plan.path}
				path={plan.path}
				title={plan.title}
				refId={planRef(plan.path)}
				problem={first ?? null}
				line={line}
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
	const [open, setOpen] = useState<string | null>(null);
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
			toolbar={
				plans?.length ? (
					<Button variant="primary" className="ml-auto" onClick={create}>
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
				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
					<div
						className="flex shrink-0 flex-col"
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
					{caps.length ? (
						<div className="flex flex-col gap-2 px-3 pb-3">
							<h2 className="text-14 font-medium">{s.coverage}</h2>
							{caps.map((c) => (
								<Coverage key={c.capability} cap={c.capability} />
							))}
						</div>
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
