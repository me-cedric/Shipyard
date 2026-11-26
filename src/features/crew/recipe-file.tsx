import { Link } from "@tanstack/react-router";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { nameOf } from "@/features/factory/runs/run-live";
import { lineDiff } from "@/features/factory/workflows/line-diff";
import { addStep, Fr, StepCards, stepLabel } from "@/features/factory/workflows/workflow-form";
import { useGuard } from "@/features/work/guard";
import { useFactoryFile, useFactoryWrites, useWorkflowOptions } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import type {
	Workflow_Serialize as Workflow,
	WorkflowFile_Serialize as WorkflowFile,
} from "@/lib/ipc";
import { copyText } from "@/lib/menus";
import { RightButton, useRights } from "@/lib/rights";
import { useDraftCount } from "@/lib/shell/drafts";
import { useAutomation } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { linkClass } from "@/ui/atoms/link-button";
import { Select, type SelectItem } from "@/ui/atoms/select";
import { StatusDot } from "@/ui/atoms/status-dot";
import { ClipboardIcon } from "@/ui/icons";
import { ATTENTION_TINT } from "@/ui/molecules/attention-card";
import { BackLink } from "@/ui/molecules/back-link";
import { Card } from "@/ui/molecules/card";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { DiffView } from "@/ui/molecules/diff-view";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { PageHeader, PageSwitchContext } from "@/ui/molecules/page-header";
import { RefChip } from "@/ui/molecules/ref-chip";
import { Row } from "@/ui/molecules/row";
import { code } from "@/ui/molecules/syntax";
import { Dialog } from "@/ui/organisms/dialog";
import { AUTOSAVE_MS } from "@/ui/organisms/editor-frame";
import { RecipeLeave } from "./recipe-leave";
import { MayWrite } from "./recipes-permissions";

export type Pick = { kind: "workflow" | "role"; id: string };
/** The keys of the address that the page of one recipe sets. `undefined` removes a key. */
export type RecipeSearch = { recipe?: string; step?: string; page?: string };

/** The same page with other keys. The router types do not know the keys of a section. */
const to = (patch: RecipeSearch): object => ({
	search: (prev: object) => ({ ...prev, ...patch }),
});

/** One row of the chain of steps (picture 027). */
const STEP = "flex flex-wrap items-center gap-3 rounded-lg bg-n-3 px-4 py-3.5";
const STEP_NAME = "flex min-h-control flex-[1_1_180px] items-center text-17 font-semibold";
/** A value of a step row, with the look of a button. */
/** The id as typed, in lower case: the backend accepts `_` and refuses a bad id. */
const clean = (id: string) =>
	id
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, "-")
		.replace(/^-+|-+$/g, "");

const PILL = cn(buttonVariants(), "cursor-default hover:bg-surface-1");

/** One id, and a preset when `presets` is given. A refusal shows in the dialog. */
export function IdDialog({
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
					disabled={clean(id) === ""}
					onClick={() => void run(() => onSubmit(clean(id), preset)).then((ok) => ok && onClose())}
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

/** The change from `before` to `after` in a dialog. */
export function ChangeDialog({
	title,
	id,
	before,
	after,
	onClose,
}: {
	title: string;
	id: string;
	before: string;
	after: string;
	onClose: () => void;
}) {
	const { t } = useI18n();
	return (
		<Dialog open wide onOpenChange={(o) => !o && onClose()} title={title}>
			<DiffView
				label={t.factory.diff}
				path={`${id}.yaml`}
				text={lineDiff(before, after)}
				binaryLabel=""
				truncatedLabel=""
			/>
		</Dialog>
	);
}

/** The recipe as a chain of step rows. A step that waits for a person has a second row. */
function Chain({ workflow, alone }: { workflow: Workflow; alone: boolean }) {
	const { t } = useI18n();
	const p = t.factory.recipePage;
	const line = <span aria-hidden="true" className="ml-[31px] h-3.5 w-0.5 bg-n-8" />;
	return (
		<ol aria-label={t.factory.steps} className="flex flex-col">
			{workflow.steps.map((s, i) => {
				const name = stepLabel(s.id, t.factory.kinds.pr);
				return (
					<li key={s.id} className="flex flex-col">
						{i > 0 ? line : null}
						<div className={STEP}>
							{/* One letter, as in the design: the first word of the name. */}
							<Avatar agent name={(s.role ? nameOf(s.role) : name).split(/\s+/)[0] ?? name} />
							<Link
								to="."
								{...to({ step: s.id })}
								className={cn(STEP_NAME, "text-n-12 hover:text-accent")}
							>
								{name}
							</Link>
							{s.role ? <span className={PILL}>{nameOf(s.role)}</span> : null}
							{s.model ? (
								<span className={PILL}>
									{(p.tierModel as Record<string, string>)[s.model] ?? nameOf(s.model)}
								</span>
							) : null}
							{s.action && !alone ? <Badge>{p.asksFirst}</Badge> : null}
						</div>
						{s.gate === "human" ? (
							<>
								{line}
								<div className={cn(STEP, ATTENTION_TINT)}>
									<Avatar name={p.you} />
									<b className={STEP_NAME}>{format(p.review, { name: name.toLowerCase() })}</b>
									<Badge variant="you">{t.factory.wf.gate}</Badge>
									{s.approver ? (
										<span className={PILL}>
											{(t.rights.role as Record<string, string>)[s.approver] ?? s.approver}
										</span>
									) : null}
								</div>
							</>
						) : null}
					</li>
				);
			})}
		</ol>
	);
}

/**
 * One recipe or role file. A recipe shows as its chain of steps (picture 027), one step shows as
 * its own page (picture 080, the key `step` of the address), and "Edit as text" shows the file (the
 * key `page`). The three views edit the same text, and each change is checked (factory REQ-010,
 * REQ-029). A draft saves itself after a short pause, unless an error shows.
 */
export function RecipeFile({
	kind,
	id,
	step,
	asText,
	go,
	onPick,
}: Pick & {
	step?: string;
	asText: boolean;
	go: (patch: RecipeSearch, replace?: boolean) => void;
	onPick: (next: Pick | null) => void;
}) {
	const { t } = useI18n();
	const w = t.factory.wf;
	const p = t.factory.recipePage;
	const file = useFactoryFile(kind, id);
	const loaded = file.data;
	const { gate } = useRights();
	const writes = useFactoryWrites();
	const options = useWorkflowOptions().data;
	const writesAlone = useAutomation().data?.automation.recipe_writes?.[id];
	const { error, run } = useGuard();
	const [draft, setDraft] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [checked, setChecked] = useState<WorkflowFile | null>(null);
	const [wf, setWf] = useState<Workflow | null>(null);
	const [dialog, setDialog] = useState<"duplicate" | "rename" | "changed" | null>(null);
	const [deleting, setDeleting] = useState(false);
	const seq = useRef(0);
	// The place of the open step: a new name reaches the address one render after the recipe.
	const last = useRef<{ id: string; index: number } | null>(null);
	const slot = useContext(PageSwitchContext);
	// The page of a step has no section switch: it claims the switch and draws none.
	const bare = useMemo(() => slot && { ...slot, node: null }, [slot]);
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
	const isWf = kind === "workflow";
	// The file on disk is checked only while no draft holds newer text.
	const clean = draft === null;
	useEffect(() => {
		if (isWf && loaded !== undefined && clean) track(check(id, loaded), false);
	}, [isWf, id, loaded, clean, check, track]);
	const dirty = text !== undefined && text !== loaded;
	const issue = checked?.issue ?? null;
	const message = issue
		? { message: issue.message, line: issue.line }
		: error
			? { message: error }
			: null;
	const reason = gate("project.settings").reason;
	const blocked = !dirty || saving || issue !== null;
	const save = () =>
		void run(async () => {
			if (text === undefined) return;
			setSaving(true);
			try {
				await writes.write(kind, id, text);
				setDraft((d) => (d === text ? null : d));
			} finally {
				setSaving(false);
			}
		});
	// biome-ignore lint/correctness/useExhaustiveDependencies: `save` is new on each render, and the pause starts again with each change of the text
	useEffect(() => {
		if (blocked || reason || message) return;
		const timer = setTimeout(save, AUTOSAVE_MS);
		return () => clearTimeout(timer);
	}, [text, blocked, reason, message === null]);
	useDraftCount(dirty);
	const formWf = wf ?? checked?.workflow ?? null;
	// A recipe that cannot be read shows as text.
	const form = isWf && !asText && checked?.workflow && formWf && options ? formWf : null;
	let index = form && step ? form.steps.findIndex((s) => s.id === step) : -1;
	if (form && step && index < 0 && last.current?.id === step && form.steps[last.current.index])
		index = last.current.index;
	last.current = step && index >= 0 ? { id: step, index } : null;
	const open = form?.steps[index];
	// A step that the recipe does not have leaves the address. The parent draws no list while the address names a step.
	const lost =
		step !== undefined && !open && (file.isError || !isWf || (checked !== null && !!options));
	// biome-ignore lint/correctness/useExhaustiveDependencies: `go` is new on each render
	useEffect(() => {
		if (lost) go({ step: undefined }, true);
	}, [lost]);
	if (step !== undefined && !open) return null;
	if (text === undefined) return <ErrorNotice error={file.error} className="p-4" />;
	const change = (next: Workflow) => {
		setWf(next);
		track(writes.render(id, next, text), true);
	};
	const name = nameOf(id);
	const guard = <RecipeLeave dirty={dirty} />;
	const alert = message ? (
		<p
			role="alert"
			className="flex gap-2 rounded-md bg-danger-subtle px-3 py-1 font-mono text-12 text-danger-text"
		>
			{message.line ? (
				<span className="shrink-0 font-medium">
					{t.design.frame.line} {message.line}
				</span>
			) : null}
			<span className="min-w-0 whitespace-pre-wrap">{message.message}</span>
		</p>
	) : null;
	const actions = (
		<>
			<Button disabled={!dirty} onClick={() => setDialog("changed")}>
				{p.changed}
			</Button>
			<Button variant="primary" disabled={blocked || !!reason} reason={reason} onClick={save}>
				{t.design.save}
			</Button>
		</>
	);
	const dialogs =
		dialog === "changed" ? (
			<ChangeDialog
				title={p.changed}
				id={id}
				before={loaded ?? ""}
				after={text}
				onClose={() => setDialog(null)}
			/>
		) : dialog ? (
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
		) : null;

	if (form && options && open)
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				{guard}
				<PageSwitchContext.Provider value={bare}>
					<PageHeader
						title={stepLabel(open.id, t.factory.kinds.pr)}
						back={
							<BackLink
								label={t.crewPlace.views.recipes}
								render={(props) => <Link to="." {...to({ step: undefined })} {...props} />}
							/>
						}
						action={
							<>
								<Badge>{format(p.stepOf, { n: index + 1, recipe: name })}</Badge>
								{actions}
							</>
						}
					/>
				</PageSwitchContext.Provider>
				<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 pb-4">
					{alert}
					<StepCards
						workflow={form}
						index={index}
						options={options}
						people={
							<>
								{open.gate === "human" ? (
									<Fr label={t.factory.runsRecipes.role}>
										<Select
											label={t.factory.runsRecipes.role}
											value={open.approver ?? ""}
											items={[
												{ value: "", label: t.factory.runsRecipes.anyRole },
												...Object.entries(t.rights.role).map(([value, label]) => ({
													value,
													label,
												})),
											]}
											onValueChange={(v) =>
												change({
													...form,
													steps: form.steps.map((s, k) =>
														k === index ? { ...s, approver: v || undefined } : s,
													),
												})
											}
										/>
									</Fr>
								) : null}
								{open.action === "open_pr" ? <MayWrite recipe={id} /> : null}
								<Row>
									<Link to="/settings/project" hash="automation" className={linkClass}>
										{p.rules}
									</Link>
								</Row>
							</>
						}
						onChange={change}
						onRenamed={(next) => go({ step: next }, true)}
						onRemoved={() => {
							last.current = null;
							go({ step: undefined });
						}}
					/>
				</div>
				{dialogs}
			</div>
		);

	const refId = isWf ? `wf:${id}` : `role:${id}`;
	return (
		<Card pad role="region" aria-label={name} className="flex flex-col">
			{guard}
			<div className="flex flex-wrap items-center gap-4 pb-4.5">
				<h2 className="mr-auto flex items-center gap-2 text-30 font-semibold text-n-12">
					{name}
					{dirty ? <StatusDot status="warning" label={t.design.frame.dirty} /> : null}
				</h2>
				{isWf ? (
					<>
						<RightButton right="project.settings" onClick={() => setDialog("rename")}>
							{w.rename}
						</RightButton>
						<RightButton right="project.settings" onClick={() => setDialog("duplicate")}>
							{w.duplicate}
						</RightButton>
						{deleting ? (
							<RightButton
								right="project.settings"
								variant="danger"
								autoFocus
								onBlur={() => setDeleting(false)}
								onClick={() => {
									setDeleting(false);
									void run(() => writes.remove(id)).then((ok) => ok && onPick(null));
								}}
							>
								{format(w.deleteConfirm, { name })}
							</RightButton>
						) : (
							<RightButton
								right="project.settings"
								className="text-danger-text"
								onClick={() => setDeleting(true)}
							>
								{w.delete}
							</RightButton>
						)}
					</>
				) : null}
			</div>
			{form ? (
				<Chain workflow={form} alone={!!writesAlone?.includes("open_pr")} />
			) : isWf && checked === null ? null : (
				<>
					<div className="flex items-center gap-2 pb-2">
						<span className="truncate font-mono text-12 text-n-11">{id}</span>
						<RefChip refId={refId} state="resolved" />
						<IconButton label={t.design.frame.copy} onClick={() => copyText(refId)}>
							<ClipboardIcon size={14} />
						</IconButton>
					</div>
					<CodeEditor
						label={id}
						value={text}
						errorLine={issue?.line}
						highlight={code}
						onChange={(v) => {
							setDraft(v);
							setWf(null);
							if (isWf) track(check(id, v), false);
						}}
						className="min-h-64"
					/>
				</>
			)}
			{alert ? <div className="pt-3">{alert}</div> : null}
			<div className="flex flex-wrap gap-2.5 pt-5">
				{form ? (
					<>
						<Button onClick={() => change(addStep(form))}>{w.addStep}</Button>
						<Button onClick={() => go({ page: "text" })}>{p.asText}</Button>
					</>
				) : isWf ? (
					<Button
						onClick={() =>
							// The steps show the text as it is now: the check comes first.
							void run(async () => {
								const f = await check(id, text);
								setChecked(f);
								if (f.workflow) {
									setWf(f.workflow);
									go({ page: undefined });
								}
							})
						}
					>
						{p.asSteps}
					</Button>
				) : null}
				<span className="flex-1" />
				{actions}
			</div>
			{dialogs}
		</Card>
	);
}
