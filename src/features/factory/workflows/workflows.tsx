import { useCallback, useEffect, useRef, useState } from "react";
import { useGuard } from "@/features/work/guard";
import { NoProject } from "@/features/work/no-project";
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
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select, type SelectItem } from "@/ui/atoms/select";
import { ArrowsRightLeftIcon, PlusIcon } from "@/ui/icons";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { ConfirmButton } from "@/ui/molecules/confirm-button";
import { DiffView } from "@/ui/molecules/diff-view";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";
import { SplitPane } from "@/ui/molecules/split-pane";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { Dialog } from "@/ui/organisms/dialog";
import { EditorFrame } from "@/ui/organisms/editor-frame";
import { ListDetail } from "@/ui/templates/list-detail";
import { lineDiff } from "./line-diff";
import { WorkflowForm } from "./workflow-form";

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
				<Button
					variant="primary"
					disabled={id.trim() === ""}
					onClick={() => void run(() => onSubmit(id.trim(), preset)).then((ok) => ok && onClose())}
				>
					{action}
				</Button>
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
		<Panel
			title={w.proposal}
			toolbar={
				<>
					<Button variant="primary" onClick={() => void run(() => writes.apply(proposal.id))}>
						{w.apply}
					</Button>
					<Button onClick={() => void run(() => writes.discard(proposal.id))}>{w.discard}</Button>
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
		</Panel>
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
	const writes = useFactoryWrites();
	const options = useWorkflowOptions().data;
	const { error, run } = useGuard();
	const [draft, setDraft] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [checked, setChecked] = useState<WorkflowFile | null>(null);
	const [view, setView] = useState<"form" | "text" | null>(null);
	const [wf, setWf] = useState<Workflow | null>(null);
	const [dialog, setDialog] = useState<"duplicate" | "rename" | null>(null);
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
						<Button onClick={() => setDialog("duplicate")}>{w.duplicate}</Button>
						<Button onClick={() => setDialog("rename")}>{w.rename}</Button>
						<ConfirmButton
							confirm={format(w.deleteConfirm, { id })}
							onConfirm={() => void run(() => writes.remove(id)).then((ok) => ok && onPick(null))}
						>
							{w.delete}
						</ConfirmButton>
					</>
				) : undefined
			}
			primary={{
				label: t.design.save,
				disabled: !dirty || saving || issue !== null,
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

/** Factory / Workflows: the workflows and the roles in two groups, and the editor of the chosen file. */
export function Workflows() {
	const { t } = useI18n();
	const f = t.factory;
	const active = useActiveProject().data;
	const workflows = useWorkflows().data ?? [];
	const roles = useRoles().data ?? [];
	const proposals = useWorkflowProposals().data ?? [];
	const options = useWorkflowOptions().data;
	const [pick, setPick] = useState<Pick | null>(null);
	const [adding, setAdding] = useState(false);
	const writes = useFactoryWrites();
	if (active === null) return <NoProject title={f.workflows} />;
	const first = workflows[0];
	// The first workflow opens until a person picks a file.
	const current = pick ?? (first ? { kind: "workflow" as const, id: first.id } : null);
	const groups = [
		{
			name: f.workflows,
			kind: "workflow" as const,
			toolbar: (
				<Button onClick={() => setAdding(true)}>
					<PlusIcon size={14} />
					{f.wf.new}
				</Button>
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
		<ListDetail
			title={f.workflows}
			icon={<ArrowsRightLeftIcon size={16} />}
			count={workflows.length}
		>
			<div className="flex min-h-0 flex-1 gap-3 px-4 pb-4">
				<SplitPane id="workflows-width" label={t.factory.resize.workflows} fallback={320}>
					<div className="flex shrink-0 flex-col gap-3 overflow-auto">
						{groups.map((g) => (
							<Panel key={g.kind} title={g.name} count={g.rows.length} toolbar={g.toolbar} flush>
								<ul aria-label={g.name}>
									{g.rows.map((r) => {
										const on = current?.kind === g.kind && current.id === r.id;
										return (
											<li key={r.id} className="border-b last:border-b-0">
												<button
													type="button"
													data-nav=""
													aria-current={on ? "true" : undefined}
													onClick={() => setPick({ kind: g.kind, id: r.id })}
													className={cn(
														"relative flex w-full flex-col gap-1.5 px-3 py-2 text-left text-ui transition-colors duration-(--duration-fast) hover:bg-n-3",
														on && "bg-accent-soft",
													)}
												>
													{on ? (
														<span
															aria-hidden="true"
															className="absolute inset-y-0 left-0 w-0.5 bg-accent-gradient"
														/>
													) : null}
													<span className="flex items-center gap-2">
														<span className="flex-1 font-mono text-12 text-n-12">{r.id}</span>
														{r.proposed ? <Badge variant="info">{f.wf.proposed}</Badge> : null}
														{r.bad ? <Badge variant="danger">{t.design.unreadable}</Badge> : null}
													</span>
													{r.steps.length ? (
														<span className="flex flex-wrap items-center gap-1">
															{r.steps.map((step, i) => (
																<span key={step} className="flex items-center gap-1">
																	{i > 0 ? (
																		<span aria-hidden="true" className="text-n-9">
																			›
																		</span>
																	) : null}
																	<Badge className="font-mono">{step}</Badge>
																</span>
															))}
														</span>
													) : null}
												</button>
											</li>
										);
									})}
								</ul>
							</Panel>
						))}
					</div>
				</SplitPane>
				<div className="flex min-w-0 flex-1 flex-col overflow-auto rounded-lg border bg-surface-1 p-3 shadow-1">
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
		</ListDetail>
	);
}
