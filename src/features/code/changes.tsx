import { Link } from "@tanstack/react-router";
import { type ReactNode, useId, useState } from "react";
import { AutoCommit } from "@/features/settings/project/auto-commit";
import { AutoReview } from "@/features/settings/project/auto-review";
import {
	type Changes as ChangesData,
	COMMIT_TYPES,
	type ConflictFile,
	canCommit,
	type DiffSide,
	useChanges,
	useCodeActions,
	useConflicts,
	useDiff,
	useStashes,
} from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { confirmDialog } from "@/lib/ipc";
import { copyText, useMenus } from "@/lib/menus";
import { usePrefs } from "@/lib/prefs";
import { RightButton, useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useTabSelection } from "@/lib/shell/selection";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Checkbox } from "@/ui/atoms/checkbox";
import { Input } from "@/ui/atoms/input";
import { LinkButton, linkClass } from "@/ui/atoms/link-button";
import { Select } from "@/ui/atoms/select";
import { Textarea } from "@/ui/atoms/textarea";
import { Card } from "@/ui/molecules/card";
import { ConflictBlock, type ConflictChoice } from "@/ui/molecules/conflict-block";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Row } from "@/ui/molecules/row";
import { LocalReview } from "./agent-review";
import { ConflictAgent } from "./conflict-agent";
import { OpenInEditor } from "./open-in-editor";
import { Preview } from "./preview";
import { GateNotice } from "./push-target";
import { type FlatRow, flatRows } from "./tree";
import { useRun } from "./use-run";
import { diffCounts, PlainDiff } from "./viewer";

/** The files to commit, in the words of the title: "5 files to commit", "1 file to commit", "Nothing to commit". */
export function useFilesTitle(count: number) {
	const { t } = useI18n();
	return count === 0
		? t.forge.now.clean
		: count === 1
			? t.forge.now.file
			: format(t.forge.now.files, { count });
}

/** The lines that the changes of one file add and remove, in green and red. A conflicted file shows the pill. */
function Counts({ row }: { row: FlatRow }) {
	const { t } = useI18n();
	const staged = useDiff(row.path, "staged", row.staged).data;
	const unstaged = useDiff(row.path, "unstaged", row.unstaged).data;
	if (row.conflict) return <Badge variant="you">{t.forge.now.conflict}</Badge>;
	const parts = [staged, unstaged].map((d) => diffCounts(d?.text ?? ""));
	const added = parts.reduce((n, p) => n + p.added, 0);
	const removed = parts.reduce((n, p) => n + p.removed, 0);
	return (
		<>
			{row.file.state === "modified" ? null : <Badge>{t.code.state[row.file.state]}</Badge>}
			{added ? <span className="font-semibold text-success-text">+{added}</span> : null}
			{removed ? <span className="font-semibold text-danger-text">−{removed}</span> : null}
		</>
	);
}

/**
 * The summary of the files to commit on Code / Now: the first three files as links to the page of the
 * local changes, the link to the others, and the commit box on one line.
 */
export function FilesCard() {
	const { t } = useI18n();
	const head = useId();
	const changes = useChanges(true).data;
	const rows = changes ? flatRows(changes) : [];
	const [, setPath] = useTabSelection("code:changes");
	const title = useFilesTitle(rows.length);
	if (!changes) return null;
	const more = rows.length - 3;
	return (
		<section
			aria-labelledby={head}
			className="min-w-0 flex-[1_1_380px] rounded-lg bg-surface-2 pb-5 shadow-2"
		>
			<h2 id={head} className="px-6 pt-5.5 pb-2 text-17 font-semibold text-n-12">
				{title}
			</h2>
			{rows.slice(0, 3).map((r) => (
				<Row
					key={r.path}
					className="min-h-14"
					render={(row) => (
						<Link
							to="/code/changes"
							onClick={() => setPath(r.path)}
							{...row}
							className={cn(row.className, "hover:bg-n-3")}
						/>
					)}
				>
					<span className="mr-auto min-w-0 font-mono text-14 break-all">{r.path}</span>
					<Counts row={r} />
				</Row>
			))}
			{more > 0 ? (
				<Row className="min-h-14">
					<Link to="/code/changes" className={linkClass}>
						{more === 1 ? t.forge.now.moreOne : format(t.forge.now.more, { count: more })}
					</Link>
				</Row>
			) : null}
			{changes.conflicted.length > 0 ? (
				<Row className="min-h-14">
					<span className="mr-auto">
						{changes.conflicted.length === 1
							? t.forge.now.conflictOne
							: format(t.forge.now.conflicts, { count: changes.conflicted.length })}
					</span>
					<Link to="/code/changes" className={linkClass}>
						{t.forge.now.solveSelf}
					</Link>
				</Row>
			) : null}
			<div className="flex flex-col gap-2 px-6 pt-4">
				<GateNotice push={false} />
				<CommitBox changes={changes} compact />
			</div>
		</section>
	);
}

/** The saved sets of changes ("Put aside") and the button that makes one (REQ-006). */
function Stashes({ dirty, run }: { dirty: boolean; run: (job: () => Promise<unknown>) => void }) {
	const { t } = useI18n();
	const n = t.forge.now;
	const head = useId();
	const stashes = useStashes().data ?? [];
	const { stash, applyStash, dropStash } = useCodeActions();
	// The first click asks for the name; the second one puts the changes aside.
	const [naming, setNaming] = useState(false);
	const [name, setName] = useState("");
	return (
		<Card pad className="flex flex-col gap-3">
			<section aria-labelledby={head} className="contents">
				<h2 id={head} className="text-13 font-semibold text-n-11">
					{n.aside}
				</h2>
				{stashes.map((s) => (
					// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
					<div
						key={s.id}
						role="group"
						aria-label={s.message}
						className="flex flex-wrap items-center gap-2.5"
					>
						<span className="min-w-0 flex-[1_1_140px] font-semibold break-words">{s.message}</span>
						<RightButton right="code.write" onClick={() => run(() => applyStash(s.index))}>
							{n.restore}
						</RightButton>
						<RightButton
							right="code.write"
							className="text-danger-text"
							onClick={() =>
								run(async () => {
									if (await confirmDialog(format(t.code.confirmDrop, { name: s.message })))
										await dropStash(s.id);
								})
							}
						>
							{n.remove}
						</RightButton>
					</div>
				))}
				{naming ? (
					<Input
						label={t.code.stashName}
						autoFocus
						value={name}
						onChange={(e) => setName(e.target.value)}
					/>
				) : null}
				<RightButton
					right="code.write"
					disabled={!dirty}
					aria-expanded={naming}
					onClick={() =>
						naming
							? run(async () => {
									await stash(name.trim() || null);
									setName("");
									setNaming(false);
								})
							: setNaming(true)
					}
				>
					{n.putAside}
				</RightButton>
			</section>
		</Card>
	);
}

/** The diff of one side of a file. A file with a staged and an unstaged change names each side. */
function DiffPane({ path, side, both }: { path: string; side: DiffSide; both: boolean }) {
	const { t } = useI18n();
	const diff = useDiff(path, side).data;
	if (!diff) return null;
	const name = t.code[side === "staged" ? "staged" : "unstaged"];
	return (
		<div className="border-t border-n-6">
			{both ? (
				<p className="px-6 pt-3">
					<Badge variant={side === "staged" ? "success" : "neutral"}>{name}</Badge>
				</p>
			) : null}
			{diff.text ? (
				<PlainDiff
					text={diff.text}
					path={path}
					binary={diff.binary}
					truncated={diff.truncated}
					// The staged and the unstaged diff of one file are two regions: the side tells them apart.
					label={`${format(t.code.diff, { path })} ${name}`}
					binaryLabel={t.code.binary}
					truncatedLabel={t.code.truncated}
				/>
			) : (
				<Preview path={path} side={side} />
			)}
		</div>
	);
}

/** The blocks of one conflicted file, one choice each, and the whole-side and hand-edit paths. */
export function ConflictPane({
	file,
	run,
}: {
	file: ConflictFile;
	run: (job: () => Promise<unknown>) => void;
}) {
	const { t } = useI18n();
	const { resolve } = useCodeActions();
	const [choices, setChoices] = useState<Record<number, ConflictChoice>>({});
	// The result that the person types, or null while the blocks decide.
	const [edited, setEdited] = useState<string | null>(null);
	const blocks = file.segments.flatMap((s) => (s.kind === "block" ? [s] : []));
	const picked = blocks.every((_, i) => choices[i] !== undefined);
	const chosen = blocks.filter((_, i) => choices[i] !== undefined).length;
	// The text that the choices give now. A block with no choice yet takes ours.
	const preview = () => {
		let i = 0;
		return file.segments
			.map((s) => {
				if (s.kind === "text") return s.text;
				const c = choices[i++] ?? "ours";
				return `${c === "ours" || c === "both" ? s.ours : ""}${c === "theirs" || c === "both" ? s.theirs : ""}`;
			})
			.join("");
	};
	return (
		<section aria-label={file.path}>
			<div className="flex items-center gap-2 px-3 py-1">
				<h2 className="flex-1 truncate text-ui font-medium">{file.path}</h2>
				{blocks.length ? (
					<span className="font-mono text-12 whitespace-nowrap text-n-11">
						{format(t.code.blocksChosen, { done: chosen, total: blocks.length })}
					</span>
				) : null}
				<OpenInEditor path={file.path} />
				{file.text ? (
					<Button variant="ghost" onClick={() => setEdited(preview())}>
						{t.code.editResult}
					</Button>
				) : null}
				<RightButton
					right="code.write"
					variant="ghost"
					onClick={() => run(() => resolve(file.path, { kind: "whole", side: "ours" }))}
				>
					{t.code.takeOurs}
				</RightButton>
				<RightButton
					right="code.write"
					variant="ghost"
					onClick={() => run(() => resolve(file.path, { kind: "whole", side: "theirs" }))}
				>
					{t.code.takeTheirs}
				</RightButton>
				<RightButton
					right="code.write"
					variant="ghost"
					onClick={() => run(() => resolve(file.path, { kind: "marked" }))}
				>
					{t.code.markResolved}
				</RightButton>
				{file.text ? (
					<RightButton
						right="code.write"
						disabled={!picked}
						onClick={() =>
							run(() =>
								resolve(file.path, {
									kind: "blocks",
									choices: blocks.map((_, i) => choices[i] ?? "ours"),
								}),
							)
						}
					>
						{t.code.resolve}
					</RightButton>
				) : null}
			</div>
			{edited !== null ? (
				<div className="flex flex-col gap-2 px-3 py-2">
					<Textarea
						label={t.code.result}
						value={edited}
						onChange={(e) => setEdited(e.target.value)}
						className="min-h-48 font-mono"
					/>
					<div className="flex gap-2">
						<RightButton
							right="code.write"
							variant="primary"
							onClick={() => run(() => resolve(file.path, { kind: "text", text: edited }))}
						>
							{t.code.saveResult}
						</RightButton>
						<Button variant="ghost" onClick={() => setEdited(null)}>
							{t.code.cancelResult}
						</Button>
					</div>
				</div>
			) : null}
			{blocks.map((b, i) => (
				<ConflictBlock
					// biome-ignore lint/suspicious/noArrayIndexKey: the blocks never reorder
					key={i}
					title={format(t.code.block, { n: i + 1 })}
					ours={b.ours}
					theirs={b.theirs}
					choice={choices[i] ?? null}
					onChoose={(c) => setChoices((x) => ({ ...x, [i]: c }))}
					labels={{
						ours: t.code.ours,
						theirs: t.code.theirs,
						both: t.code.both,
						neither: t.code.neither,
					}}
				/>
			))}
		</section>
	);
}

/**
 * The commit box (`spec:app-redesign#REQ-022`): the message and the one commit. "Write it for me"
 * leaves the staged files in the draft of the assistant. `compact` is the one line of Code / Now; the
 * page of the local changes adds the description, behind its button, and the two automatic choices.
 */
export function CommitBox({ changes, compact }: { changes: ChangesData; compact?: boolean }) {
	const { t } = useI18n();
	const n = t.forge.now;
	const { commit } = useCodeActions();
	const { ask } = useShell();
	const { profile } = usePrefs();
	const { failure, busy, run } = useRun();
	const [summary, setSummary] = useState("");
	const [kind, setKind] = useState<string>("fix");
	const [description, setDescription] = useState("");
	const [more, setMore] = useState(false);
	const count = changes.staged.length;
	const write = (
		<Button
			className={compact ? undefined : "flex-[1_1_130px]"}
			disabled={count === 0}
			onClick={() =>
				ask(format(n.writePrompt, { files: changes.staged.map((f) => f.path).join(", ") }))
			}
		>
			{n.write}
		</Button>
	);
	const submit = (
		<RightButton
			type="submit"
			right="code.write"
			variant="primary"
			className={compact ? undefined : "flex-[1_1_130px]"}
			busy={busy}
			// A read only profile makes no commit, and a conflict or an empty stage refuses it.
			disabled={!canCommit(changes) || profile.readOnly}
		>
			{compact || count === 0
				? t.shell.commit
				: count === 1
					? n.commitFile
					: format(n.commitFiles, { count })}
		</RightButton>
	);
	const message = (
		<>
			<Select
				label={t.code.kind}
				items={COMMIT_TYPES.map((c) => ({ value: c, label: t.code.kinds[c] }))}
				value={kind}
				onValueChange={setKind}
				className="min-w-36"
			/>
			<Input
				label={n.message}
				className={compact ? "flex-[1_1_200px]" : undefined}
				value={summary}
				onChange={(e) => setSummary(e.target.value)}
			/>
		</>
	);
	return (
		<form
			aria-label={t.shell.commit}
			className="flex flex-col gap-3"
			onSubmit={(e) => {
				e.preventDefault();
				void run(async () => {
					// A message with no `<type>:` start gets the chosen kind, so plain words are accepted.
					const typed = new RegExp(`^(${COMMIT_TYPES.join("|")})(\\([^)]*\\))?:`).test(
						summary.trim(),
					);
					// An empty message goes as it is: the core refuses it.
					const plain = summary.trim() !== "" && !typed;
					await commit(plain ? `${kind}: ${summary.trim()}` : summary, description);
					setSummary("");
					setDescription("");
				});
			}}
		>
			{compact ? (
				<div className="flex flex-wrap gap-2.5">
					{message}
					{write}
					{submit}
				</div>
			) : (
				message
			)}
			<ErrorNotice error={failure} />
			{compact ? null : (
				<>
					<div className="flex flex-wrap gap-2.5">
						{write}
						{submit}
					</div>
					<div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-n-6 pt-2">
						<AutoCommit inline />
						<AutoReview inline />
					</div>
					<LinkButton aria-expanded={more} onClick={() => setMore(!more)}>
						{t.ui.more}
					</LinkButton>
					{more ? (
						<Textarea
							label={t.code.description}
							value={description}
							onChange={(e) => setDescription(e.target.value)}
						/>
					) : null}
				</>
			)}
		</form>
	);
}

/**
 * The local changes (`/code/changes`): the conflict banner, one flat list with a checkbox per file (a
 * checked file goes into the commit), the commit box, the changes put aside and the diff of one file.
 */
export function WorkingCopy({ changes }: { changes: ChangesData }) {
	const { t } = useI18n();
	const n = t.forge.now;
	const conflicts = useConflicts().data ?? [];
	const { stage, unstage, discard } = useCodeActions();
	const menu = useMenus();
	const { error, run: runJob } = useRun();
	const rows = flatRows(changes);
	// The first changed file opens by default, and the choice stays with the tab.
	const [path, setPath] = useTabSelection(
		"code:changes",
		rows.map((r) => r.path),
	);
	const { setFilesOpen } = useShell();
	const { gate } = useRights();
	const write = gate("code.write");
	const run = (job: () => Promise<unknown>) => void runJob(job);
	const here = rows.find((r) => r.path === path);
	const conflict = path ? conflicts.find((c) => c.path === path) : undefined;
	// A conflicted file is solved first: it is never chosen.
	const free = rows.filter((r) => !r.conflict);
	const all = free.length > 0 && free.every((r) => r.staged && !r.unstaged);

	/** Discards the changes of one file, the chosen part too, after a confirmation that names it. */
	const discardFile = async (r: FlatRow) => {
		const ask = r.staged ? n.confirmDiscardChosen : t.code.confirmDiscard;
		if (!(await confirmDialog(format(ask, { count: 1, paths: r.path })))) return;
		if (r.staged) await unstage([r.path]);
		// A new file leaves the working copy: nothing of it is in the last commit. After the unstage a
		// renamed file is a new path too.
		const fresh = ["untracked", "added", "renamed"].includes(r.file.state);
		await discard([r.path], fresh);
	};

	// The same actions as the checkbox and the Discard button, for one file. Without `code.write` they show, off.
	const fileMenu = (r: FlatRow): ReactNode => {
		const own = r.conflict
			? {}
			: {
					...(r.unstaged ? { stage: () => run(() => stage([r.path])) } : {}),
					...(r.staged ? { unstage: () => run(() => unstage([r.path])) } : {}),
					discard: () => run(() => discardFile(r)),
				};
		const items = menu("file", { ...own, "copy-path": () => copyText(r.path) }).map((item) =>
			item.id in own ? { ...item, ...write } : item,
		);
		return (
			<ContextMenu items={items}>
				<button
					type="button"
					aria-current={r.path === path ? "true" : undefined}
					onClick={() => setPath(r.path)}
					className="mr-auto min-h-control min-w-0 flex-1 text-left font-mono text-14 break-all"
				>
					{r.file.old_path ? `${r.file.old_path} → ` : ""}
					{r.path}
				</button>
			</ContextMenu>
		);
	};

	return (
		<div className="flex flex-col gap-6">
			<ConflictAgent onSolve={setPath} />
			<div className="flex flex-wrap items-start gap-6">
				<div className="flex min-w-0 flex-[2_1_320px] flex-col gap-4">
					{rows.length ? (
						<Card className="py-2">
							<ul aria-label={t.code.files}>
								{rows.map((r) => (
									<li
										key={r.path}
										className={cn(
											"mx-2 flex min-h-13 items-center gap-3 rounded-md px-5 [&+&]:border-t [&+&]:border-n-6",
											r.path === path && "bg-accent-tint",
										)}
									>
										<Checkbox
											label={format(t.code.select, { name: r.path })}
											hideLabel
											className="transition-none data-[indeterminate]:border-transparent data-[indeterminate]:bg-accent data-[indeterminate]:text-accent-fg"
											checked={r.staged && !r.unstaged}
											indeterminate={r.staged && r.unstaged}
											disabled={r.conflict || write.disabled}
											onCheckedChange={(on) =>
												run(() => (on ? stage([r.path]) : unstage([r.path])))
											}
										/>
										{fileMenu(r)}
										<Counts row={r} />
									</li>
								))}
							</ul>
							<div className="flex flex-wrap gap-2.5 px-5 pt-3 pb-2">
								<RightButton
									right="code.write"
									disabled={free.length === 0}
									onClick={() =>
										run(() =>
											all ? unstage(free.map((r) => r.path)) : stage(free.map((r) => r.path)),
										)
									}
								>
									{all ? n.chooseNone : n.chooseAll}
								</RightButton>
								<RightButton
									right="code.write"
									className="text-danger-text"
									disabled={!here || here.conflict}
									onClick={() => here && run(() => discardFile(here))}
								>
									{t.code.discard}
								</RightButton>
							</div>
						</Card>
					) : null}
					<Card pad className="flex flex-col gap-3">
						<GateNotice push={false} />
						<CommitBox changes={changes} />
					</Card>
					<Stashes dirty={free.length > 0} run={run} />
					{error ? (
						<p role="alert" className="px-3 py-2 text-ui text-danger-text">
							{error}
						</p>
					) : null}
				</div>
				<Card className="flex-[3_1_480px] overflow-hidden">
					{here ? (
						<>
							{/* A conflicted file has its own header, with its path and its actions. */}
							{conflict ? (
								<ConflictPane key={conflict.path} file={conflict} run={run} />
							) : (
								<Row>
									<h2 className="min-w-0 font-mono text-14 font-semibold break-all">{here.path}</h2>
									<Counts row={here} />
									<span className="ml-auto flex flex-wrap items-center gap-2">
										<OpenInEditor path={here.path} plain />
									</span>
								</Row>
							)}
							{here.staged ? (
								<DiffPane path={here.path} side="staged" both={here.unstaged} />
							) : null}
							{here.unstaged ? (
								<DiffPane path={here.path} side="unstaged" both={here.staged} />
							) : null}
							<LocalReview path={here.path} />
						</>
					) : (
						<EmptyState
							title={t.empty.file}
							action={{ label: t.empty.showFiles, onClick: () => setFilesOpen(true) }}
						/>
					)}
				</Card>
			</div>
		</div>
	);
}
