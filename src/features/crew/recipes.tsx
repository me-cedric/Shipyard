import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { nameOf } from "@/features/factory/runs/run-live";
import { NoProject } from "@/features/shell/no-project";
import { tabIcon } from "@/features/shell/spaces";
import { useGuard } from "@/features/work/guard";
import {
	useFactoryWrites,
	useRoles,
	useWorkflowOptions,
	useWorkflowProposals,
	useWorkflows,
} from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type { WorkflowProposal_Serialize as WorkflowProposal } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { RightButton } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { AttentionCard } from "@/ui/molecules/attention-card";
import { Card } from "@/ui/molecules/card";
import { DiffView } from "@/ui/molecules/diff-view";
import { Loading } from "@/ui/molecules/loading";
import { PageHeader } from "@/ui/molecules/page-header";
import { lineDiff } from "../factory/workflows/line-diff";
import { ChangeDialog, IdDialog, type Pick, RecipeFile, type RecipeSearch } from "./recipe-file";
import { RecipePermissions } from "./recipes-permissions";

/** A change that an agent proposes to a recipe: Show the change, Discard and Apply (picture 027). */
function Proposal({ proposal, here }: { proposal: WorkflowProposal; here: boolean }) {
	const { t } = useI18n();
	const w = t.factory.wf;
	const p = t.factory.recipePage;
	const writes = useFactoryWrites();
	const { error, run } = useGuard();
	const [open, setOpen] = useState(false);
	return (
		<section aria-label={w.proposal}>
			{/* The card title is an h3: this h2 keeps the heading order under the page h1. */}
			<h2 className="sr-only">{w.proposal}</h2>
			<AttentionCard
				who={t.factory.agent}
				inline
				title={here ? p.proposes : format(p.proposesFor, { name: nameOf(proposal.id) })}
			>
				<Button onClick={() => setOpen(true)}>{p.showChange}</Button>
				<div className="flex flex-wrap gap-2.5">
					<RightButton
						right="project.settings"
						className="flex-[1_1_90px]"
						onClick={() => void run(() => writes.discard(proposal.id))}
					>
						{w.discard}
					</RightButton>
					<RightButton
						right="project.settings"
						variant="primary"
						className="flex-[1_1_90px]"
						onClick={() => void run(() => writes.apply(proposal.id))}
					>
						{w.apply}
					</RightButton>
				</div>
				{error ? (
					<p role="alert" className="text-ui text-danger-text">
						{error}
					</p>
				) : null}
			</AttentionCard>
			{open ? (
				<ChangeDialog
					title={w.proposal}
					id={proposal.id}
					before={proposal.current ?? ""}
					after={proposal.text}
					onClose={() => setOpen(false)}
				/>
			) : null}
		</section>
	);
}

/**
 * Crew / Recipes: the list of the recipes, and the chosen recipe as its chain of steps (picture
 * 027). A step opens as its own page (picture 080). The role files are in the menu of the page. A
 * recipe shows its permissions under its steps (`spec:app-redesign#REQ-016`).
 */
export function Recipes() {
	const { t } = useI18n();
	const f = t.factory;
	const p = f.recipePage;
	const active = useActiveProject().data;
	const workflows = useWorkflows().data ?? [];
	const roles = useRoles().data ?? [];
	const proposals = useWorkflowProposals().data ?? [];
	const options = useWorkflowOptions().data;
	// The chosen recipe, its open step and its text view are in the address: a link opens them. A role stays in the page.
	const search: { recipe?: unknown; step?: unknown; page?: unknown } = useSearch({ strict: false });
	const navigate = useNavigate();
	const [role, setRole] = useState<string | null>(null);
	const go = (patch: RecipeSearch, replace = false) =>
		void navigate({ search: (prev: object) => ({ ...prev, ...patch }), replace } as never);
	const setPick = (next: Pick | null) => {
		setRole(next?.kind === "role" ? next.id : null);
		if (next?.kind !== "role") go({ recipe: next?.id, step: undefined, page: undefined }, true);
	};
	const [adding, setAdding] = useState(false);
	const writes = useFactoryWrites();
	const Icon = tabIcon("crew", "recipes");
	const icon = Icon && <Icon size={16} />;
	if (active === undefined) return <Loading title={t.ui.place.crew} icon={icon} />;
	if (active === null) return <NoProject title={t.ui.place.crew} icon={icon} />;
	const first = workflows[0];
	// The first workflow opens until a person picks a file. A recipe that is not in the list opens it too.
	const known = [...workflows, ...proposals].some((w) => w.id === search.recipe);
	const current: Pick | null = role
		? { kind: "role", id: role }
		: known
			? { kind: "workflow", id: search.recipe as string }
			: first
				? { kind: "workflow", id: first.id }
				: null;
	const rows = [
		...workflows.map((w) => ({ id: w.id, steps: w.steps.length, bad: w.issue !== null })),
		...proposals
			.filter((x) => !workflows.some((w) => w.id === x.id))
			.map((x) => ({ id: x.id, steps: 0, bad: false })),
	];
	const recipe = current?.kind === "workflow" ? current.id : null;
	const own = proposals.find((x) => x.id === recipe);
	// The card shows the proposal of the open recipe, else the first proposal of the list.
	const proposal = own ?? proposals[0];
	const proposalOnly = !!recipe && !workflows.some((w) => w.id === recipe);
	// The page of a step (picture 080) takes the whole page: the title row and the list go out.
	const stepOpen = typeof search.step === "string" && current?.kind === "workflow" && !proposalOnly;
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{stepOpen ? null : (
				<PageHeader
					icon={icon}
					title={t.ui.place.crew}
					menu={roles.map((r) => ({
						label: format(p.roleFile, { name: nameOf(r.id) }),
						onClick: () => setPick({ kind: "role", id: r.id }),
					}))}
				/>
			)}
			<div
				className={
					stepOpen
						? "contents"
						: "flex min-h-0 flex-1 flex-wrap content-start items-start gap-6 overflow-auto px-4 pt-1 pb-4"
				}
			>
				{stepOpen ? null : (
					<div className="flex min-w-0 flex-[1_1_220px] flex-col gap-2.5">
						<ul
							aria-label={t.crewPlace.views.recipes}
							className="flex max-h-[calc(100vh-30rem)] min-h-36 flex-col gap-2.5 overflow-y-auto p-1 -m-1"
						>
							{rows.map((r) => {
								const on = recipe === r.id;
								return (
									<li key={r.id}>
										<button
											type="button"
											data-nav=""
											aria-current={on ? "true" : undefined}
											onClick={() => setPick({ kind: "workflow", id: r.id })}
											className={cn(
												"flex min-h-control w-full cursor-pointer flex-col gap-3 rounded-lg bg-surface-2 p-4.5 text-left shadow-2 focus-visible:outline-offset-2",
												on && "bg-accent-tint outline-2 outline-accent",
											)}
										>
											<span className="flex items-center gap-2 text-17 font-semibold text-n-12">
												<span className="flex-1">{nameOf(r.id)}</span>
												{proposals.some((x) => x.id === r.id) ? (
													<Badge variant="info">{f.wf.proposed}</Badge>
												) : null}
												{r.bad ? <Badge variant="danger">{t.design.unreadable}</Badge> : null}
											</span>
											{r.steps ? (
												<span className="text-n-11">
													{r.steps === 1 ? p.oneStep : format(p.steps, { count: r.steps })}
												</span>
											) : null}
										</button>
									</li>
								);
							})}
						</ul>
						<RightButton
							right="project.settings"
							className="shrink-0"
							onClick={() => setAdding(true)}
						>
							{f.wf.new}
						</RightButton>
						{proposal ? <Proposal key={proposal.id} proposal={proposal} here={!!own} /> : null}
					</div>
				)}
				<div className={stepOpen ? "contents" : "flex min-w-0 flex-[3_1_520px] flex-col gap-4"}>
					{own && proposalOnly ? (
						// A proposal for a new id has no file yet: its text shows in place of the steps.
						<Card pad role="region" aria-label={nameOf(own.id)} className="flex flex-col gap-4">
							<h2 className="text-30 font-semibold text-n-12">{nameOf(own.id)}</h2>
							<DiffView
								label={f.diff}
								path={`${own.id}.yaml`}
								text={lineDiff("", own.text)}
								binaryLabel=""
								truncatedLabel=""
							/>
						</Card>
					) : current ? (
						<RecipeFile
							key={`${current.kind}:${current.id}`}
							{...current}
							step={typeof search.step === "string" ? search.step : undefined}
							asText={search.page === "text"}
							go={go}
							onPick={setPick}
						/>
					) : null}
					{recipe && !stepOpen ? <RecipePermissions recipe={recipe} /> : null}
				</div>
			</div>
			{adding && options ? (
				<IdDialog
					title={f.wf.new}
					action={f.wf.create}
					initial=""
					presets={options.presets.map((x) => ({ value: x.id, label: nameOf(x.id) }))}
					onClose={() => setAdding(false)}
					onSubmit={async (id, preset) => {
						await writes.create(id, { kind: "preset", id: preset });
						setPick({ kind: "workflow", id });
					}}
				/>
			) : null}
		</div>
	);
}
