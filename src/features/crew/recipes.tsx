import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { nameOf } from "@/features/factory/runs/run-live";
import { SectionCard } from "@/features/factory/section-card";
import { lineDiff } from "@/features/factory/workflows/line-diff";
import { WorkflowForm } from "@/features/factory/workflows/workflow-form";
import { NoProject } from "@/features/shell/no-project";
import { tabIcon } from "@/features/shell/spaces";
import { useGuard } from "@/features/work/guard";
import {
	useFactoryFile,
	useFactoryWrites,
	useRoles,
	useWorkflowOptions,
	useWorkflowProposals,
	useWorkflows,
} from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type {
	Workflow_Serialize as Workflow,
	WorkflowFile_Serialize as WorkflowFile,
	WorkflowProposal_Serialize as WorkflowProposal,
} from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { RightButton, useRights } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select, type SelectItem } from "@/ui/atoms/select";
import { ChevronDownIcon, PlusIcon } from "@/ui/icons";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { DiffView } from "@/ui/molecules/diff-view";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { MenuButton } from "@/ui/molecules/menu-button";
import { PageHeader } from "@/ui/molecules/page-header";
import { RunStep } from "@/ui/molecules/run-step";
import { SplitPane } from "@/ui/molecules/split-pane";
import { code } from "@/ui/molecules/syntax";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { Dialog } from "@/ui/organisms/dialog";
import { EditorFrame } from "@/ui/organisms/editor-frame";
import { RecipePermissions } from "./recipes-permissions";

type Pick = { kind: "workflow" | "role"; id: string };

/** One id, and a preset when `presets` is given. A refusal shows in the dialog. */
function IdDialog({
	title,
	action,
	initial,
	presets,
	onSubmit,
	onClose,
}: {
	title: string;
	action: string;
	initial: string;
	presets?: SelectItem[];
	onSubmit: (id: string, preset: string) => Promise<unknown>;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const [id, setId] = useState(initial);
	const [preset, setPreset] = useState(presets?.[0]?.value ?? "");
	const { failure, run } = useGuard();
	return (
		<Dialog
			open
			onOpenChange={(o) => !o && onClose()}
			title={title}
			actions={
				<RightButton
					right="project.settings"
					variant="primary"
					disabled={id.trim() === ""}
					onClick={() => void run(() => onSubmit(id.trim(), preset)).then((ok) => ok && onClose())}
				>
					{action}
				</RightButton>
			}
		>
			{presets ? (
				<Select
					caption
					label={t.factory.wf.preset}
					items={presets}
					value={preset}
					onValueChange={setPreset}
				/>
			) : null}
			<Input
				caption
				label={t.factory.wf.newId}
				value={id}
				onChange={(e) => setId(e.target.value)}
			/>
			<ErrorNotice error={failure} />
		</Dialog>
	);
}

/** An agent's proposed text: its diff against the file now, with Apply and Discard. */
function Proposal({ proposal }: { proposal: WorkflowProposal }) {
	const { t } = useI18n();
	const w = t.factory.wf;
	const writes = useFactoryWrites();
	const { error, run } = useGuard();
	return (
		<SectionCard
			title={w.proposal}
			toolbar={
				<>
					<RightButton
						right="project.settings"
						variant="primary"
						onClick={() => void run(() => writes.apply(proposal.id))}
						className="min-h-control"
					>
						{w.apply}
					</RightButton>
					<RightButton
						right="project.settings"
						onClick={() => void run(() => writes.discard(proposal.id))}
						className="min-h-control"
					>
						{w.discard}
					</RightButton>
				</>
			}
		>
			<DiffView
				label={t.factory.diff}
				path={`${proposal.id}.yaml`}
				text={lineDiff(proposal.current ?? "", proposal.text)}
				binaryLabel=""
				truncatedLabel=""
			/>
			{error ? (
				<p role="alert" className="px-3 py-1 text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</SectionCard>
	);
}

/**
 * One workflow or role file in the editor frame. A workflow opens in the form when it is valid,
 * and in the text otherwise. Both views edit the same text, and each change is checked
 * (factory REQ-010, REQ-029).
 */
function FileEditor({
	kind,
	id,
	proposal,
	onPick,
}: Pick & { proposal?: WorkflowProposal; onPick: (next: Pick | null) => void }) {
	const { t } = useI18n();
	const w = t.factory.wf;
	const file = useFactoryFile(kind, id);
	const loaded = file.data;
	const { gate } = useRights();
	const writes = useFactoryWrites();
	const options = useWorkflowOptions().data;
	const { error, run } = useGuard();
	const [draft, setDraft] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [checked, setChecked] = useState<WorkflowFile | null>(null);
	const [view, setView] = useState<"form" | "text" | null>(null);
	const [wf, setWf] = useState<Workflow | null>(null);
	const [dialog, setDialog] = useState<"duplicate" | "rename" | null>(null);
	const [deleting, setDeleting] = useState(false);
	const seq = useRef(0);
	const text = draft ?? loaded;
	// Only the latest answer counts. `adopt` takes the text that the form wrote.
	const track = useCallback((job: Promise<WorkflowFile>, adopt: boolean) => {
		const n = ++seq.current;
		job
			.then((f) => {
				if (n !== seq.current) return;
				setChecked(f);
				if (adopt) setDraft(f.text);
			})
			.catch(() => {});
	}, []);
	const check = writes.check;
	// The file on disk is checked only while no draft holds newer text.
	const clean = draft === null;
	useEffect(() => {
		if (kind === "workflow" && loaded !== undefined && clean) track(check(id, loaded), false);
	}, [kind, id, loaded, clean, check, track]);
	if (text === undefined) return <ErrorNotice error={file.error} className="p-4" />;
	const dirty = text !== loaded;
	const issue = checked?.issue ?? null;
	const shown = view ?? (checked?.workflow ? "form" : "text");
	const formWf = wf ?? checked?.workflow ?? null;
	const message = issue
		? { message: issue.message, line: issue.line }
		: error
			? { message: error }
			: null;
	const toForm = () =>
		void run(async () => {
			const f = await check(id, text);
			setChecked(f);
			if (f.workflow) {
				setWf(f.workflow);
				setView("form");
			}
		});
	const isWf = kind === "workflow";
	return (
		<EditorFrame
			title={id}
			heading={isWf ? nameOf(id) : undefined}
			refId={isWf ? `wf:${id}` : `role:${id}`}
			actions={
				isWf ? (
					<>
						<ViewTabs
							label={t.editing.view.label}
							value={shown}
							onValueChange={(v) => (v === "form" ? toForm() : setView("text"))}
							tabs={[
								{ value: "form", label: t.editing.view.form },
								{ value: "text", label: t.editing.view.text },
							]}
						/>
						{deleting ? (
							<Button
								{...gate("project.settings")}
								variant="danger"
								className="min-h-control"
								autoFocus
								onBlur={() => setDeleting(false)}
								onClick={() => {
									setDeleting(false);
									void run(() => writes.remove(id)).then((ok) => ok && onPick(null));
								}}
							>
								{format(w.deleteConfirm, { id })}
							</Button>
						) : (
							<MenuButton
								iconOnly
								label={t.factory.moreActions}
								icon={<ChevronDownIcon size={14} />}
								items={[
									{
										id: "duplicate",
										label: w.duplicate,
										...gate("project.settings"),
										onSelect: () => setDialog("duplicate"),
									},
									{
										id: "rename",
										label: w.rename,
										...gate("project.settings"),
										onSelect: () => setDialog("rename"),
									},
									{
										id: "delete",
										label: w.delete,
										danger: true,
										...gate("project.settings"),
										onSelect: () => setDeleting(true),
									},
								]}
							/>
						)}
					</>
				) : undefined
			}
			primary={{
				label: t.design.save,
				disabled: !dirty || saving || issue !== null,
				reason: gate("project.settings").reason,
				onClick: () =>
					void run(async () => {
						setSaving(true);
						try {
							await writes.write(kind, id, text);
							setDraft((d) => (d === text ? null : d));
						} finally {
							setSaving(false);
						}
					}),
			}}
			save={dirty ? "dirty" : "clean"}
			error={message}
			labels={t.design.frame}
		>
			<div className="flex min-h-0 flex-1 flex-col gap-3">
				{proposal ? <Proposal proposal={proposal} /> : null}
				{isWf && shown === "form" && formWf && options ? (
					<WorkflowForm
						workflow={formWf}
						options={options}
						onChange={(next) => {
							setWf(next);
							track(writes.render(id, next, text), true);
						}}
					/>
				) : (
					<CodeEditor
						label={id}
						value={text}
						errorLine={issue?.line}
						highlight={code}
						onChange={(v) => {
							setDraft(v);
							if (isWf) track(check(id, v), false);
						}}
						className="flex-1"
					/>
				)}
			</div>
			{dialog ? (
				<IdDialog
					title={dialog === "rename" ? w.rename : w.duplicate}
					action={dialog === "rename" ? w.rename : w.create}
					initial={dialog === "rename" ? id : ""}
					onClose={() => setDialog(null)}
					onSubmit={async (next) => {
						await (dialog === "rename"
							? writes.rename(id, next)
							: writes.create(next, { kind: "workflow", id }));
						onPick({ kind: "workflow", id: next });
					}}
				/>
			) : null}
		</EditorFrame>
	);
}

/**
 * Crew / Recipes: the recipes and the roles in two groups, and the editor of the chosen file. A
 * recipe shows its permissions under its steps (`spec:app-redesign#REQ-016`).
 */
export function Recipes() {
	const { t } = useI18n();
	const f = t.factory;
	const active = useActiveProject().data;
	const workflows = useWorkflows().data ?? [];
	const roles = useRoles().data ?? [];
	const proposals = useWorkflowProposals().data ?? [];
	const options = useWorkflowOptions().data;
	// The chosen recipe is in the address (`recipe`): a link opens one recipe. A role stays in the page.
	const search: { recipe?: unknown } = useSearch({ strict: false });
	const navigate = useNavigate();
	const [role, setRole] = useState<string | null>(null);
	const setPick = (next: Pick | null) => {
		setRole(next?.kind === "role" ? next.id : null);
		if (next?.kind !== "role")
			void navigate({
				search: (prev: object) => ({ ...prev, recipe: next?.id }),
				replace: true,
			} as never);
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
	const groups = [
		{
			name: t.crewPlace.views.recipes,
			kind: "workflow" as const,
			toolbar: (
				<RightButton
					right="project.settings"
					className="min-h-control"
					onClick={() => setAdding(true)}
				>
					<PlusIcon size={14} />
					{f.wf.new}
				</RightButton>
			),
			rows: [
				...workflows.map((w) => ({ id: w.id, steps: w.steps, bad: w.issue !== null })),
				...proposals
					.filter((p) => !workflows.some((w) => w.id === p.id))
					.map((p) => ({ id: p.id, steps: [] as string[], bad: false })),
			].map((r) => ({ ...r, proposed: proposals.some((p) => p.id === r.id) })),
		},
		{
			name: f.roles,
			kind: "role" as const,
			toolbar: undefined,
			rows: roles.map((r) => ({ id: r.id, steps: [] as string[], bad: false, proposed: false })),
		},
	];
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader icon={icon} title={t.ui.place.crew} />
			<div className="flex min-h-0 flex-1 gap-3 px-4 pt-2 pb-4">
				<SplitPane id="workflows-width" label={t.factory.resize.workflows} fallback={320}>
					<div className="flex shrink-0 flex-col gap-4 overflow-auto p-1">
						{groups.map((g) => (
							<section key={g.kind} aria-label={g.name} className="flex flex-col gap-2">
								<div className="flex min-h-control items-center gap-2">
									<h2
										aria-label={format(t.count, { name: g.name, count: g.rows.length })}
										className="flex flex-1 items-center gap-2 text-16 font-semibold text-n-12"
									>
										{g.name}
										<Badge className="font-mono">{g.rows.length}</Badge>
									</h2>
									{g.toolbar}
								</div>
								<ul aria-label={g.name} className="flex flex-col gap-2">
									{g.rows.map((r) => {
										const on = current?.kind === g.kind && current.id === r.id;
										return (
											<li key={r.id}>
												<button
													type="button"
													data-nav=""
													aria-current={on ? "true" : undefined}
													onClick={() => setPick({ kind: g.kind, id: r.id })}
													className={cn(
														"flex min-h-control w-full flex-col justify-center gap-2 rounded-xl border-2 border-transparent bg-surface-2 p-4 text-left text-ui shadow-1 transition-shadow duration-(--duration-base) hover:shadow-2 focus-visible:shadow-glow",
														on && "border-accent bg-accent-soft",
													)}
												>
													<span className="flex items-center gap-2">
														<span title={r.id} className="flex-1 text-14 font-semibold text-n-12">
															{nameOf(r.id)}
														</span>
														{r.proposed ? <Badge variant="info">{f.wf.proposed}</Badge> : null}
														{r.bad ? <Badge variant="danger">{t.design.unreadable}</Badge> : null}
														<span className="text-12 font-medium text-accent-text">{f.edit}</span>
													</span>
													{r.steps.length ? (
														<span className="flex flex-wrap items-center gap-1">
															{r.steps.map((step) => (
																<RunStep key={step} id={step} name={nameOf(step)} state="pending" />
															))}
														</span>
													) : null}
												</button>
											</li>
										);
									})}
								</ul>
							</section>
						))}
					</div>
				</SplitPane>
				<div className="flex min-w-0 flex-1 flex-col gap-3 overflow-auto rounded-xl bg-surface-2 p-4 shadow-1">
					{current?.kind === "workflow" && !workflows.some((w) => w.id === current.id) ? (
						// A proposal for a new id has no file yet.
						proposals
							.filter((p) => p.id === current.id)
							.map((p) => <Proposal key={p.id} proposal={p} />)
					) : current ? (
						<FileEditor
							key={`${current.kind}:${current.id}`}
							{...current}
							proposal={
								current.kind === "workflow" ? proposals.find((p) => p.id === current.id) : undefined
							}
							onPick={setPick}
						/>
					) : null}
					{current?.kind === "workflow" ? <RecipePermissions recipe={current.id} /> : null}
				</div>
				{adding && options ? (
					<IdDialog
						title={f.wf.new}
						action={f.wf.create}
						initial=""
						presets={options.presets.map((p) => ({ value: p.id, label: p.id }))}
						onClose={() => setAdding(false)}
						onSubmit={async (id, preset) => {
							await writes.create(id, { kind: "preset", id: preset });
							setPick({ kind: "workflow", id });
						}}
					/>
				) : null}
			</div>
		</div>
	);
}
