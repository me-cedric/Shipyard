import { type ReactNode, useState } from "react";
import {
	type Changes as ChangesData,
	type ConflictFile,
	canCommit,
	type DiffSide,
	type FileChange,
	useChanges,
	useCodeActions,
	useConflicts,
	useDiff,
	useStashes,
} from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { confirmDialog } from "@/lib/ipc";
import { copyText, type Handlers, useMenus } from "@/lib/menus";
import { usePrefs } from "@/lib/prefs";
import { RightButton, useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useTabSelection } from "@/lib/shell/selection";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Textarea } from "@/ui/atoms/textarea";
import { ConflictBlock, type ConflictChoice } from "@/ui/molecules/conflict-block";
import type { MenuItem } from "@/ui/molecules/context-menu";
import { DiffView } from "@/ui/molecules/diff-view";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { FileRow } from "@/ui/molecules/file-row";
import { Panel } from "@/ui/molecules/panel";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { SplitPane } from "@/ui/molecules/split-pane";
import { ConflictAgent } from "./conflict-agent";
import { OpenInEditor } from "./open-in-editor";
import { Preview } from "./preview";
import { GateNotice } from "./push-target";
import { treeRows } from "./tree";
import { useRun } from "./use-run";

type Group = "conflicts" | "staged" | "unstaged";

/** One group of the working copy: a heading with its count, its actions and the folder tree. */
function FileGroup({
	group,
	files,
	selected,
	onSelect,
	actions,
	menu,
}: {
	group: Group;
	files: FileChange[];
	selected: string | null;
	onSelect: (path: string) => void;
	/** The buttons of the group. They act on the checked files, or on all of them. */
	actions?: (paths: string[], files: FileChange[]) => ReactNode;
	/** The context menu of a file. */
	menu?: (file: FileChange) => MenuItem[];
}) {
	const { t } = useI18n();
	const [checked, setChecked] = useState<string[]>([]);
	const live = checked.filter((p) => files.some((f) => f.path === p));
	const targets = live.length ? live : files.map((f) => f.path);
	const toggle = (paths: string[], on: boolean) =>
		setChecked((c) => (on ? [...new Set([...c, ...paths])] : c.filter((p) => !paths.includes(p))));
	return (
		<Panel
			title={t.code[group]}
			count={files.length}
			tone={group === "conflicts" ? "danger" : group === "staged" ? "success" : undefined}
			toolbar={files.length ? actions?.(targets, files) : null}
			flush
			className="shrink-0"
			bodyClassName="py-1"
		>
			{files.length === 0 ? (
				<p className="px-3 py-1 text-ui text-n-11">
					{group === "staged" ? t.code.noneStaged : t.code.noneUnstaged}
				</p>
			) : null}
			{treeRows(files).map((r) =>
				r.kind === "folder" ? (
					<FileRow
						key={`d:${r.path}`}
						name={r.name}
						depth={r.depth}
						check={{
							checked: r.files.every((p) => live.includes(p)),
							label: format(t.code.select, { name: r.path }),
							onChange: (on) => toggle(r.files, on),
						}}
					/>
				) : (
					<FileRow
						key={`f:${r.path}`}
						name={r.name}
						depth={r.depth}
						state={r.file.state}
						stateLabel={t.code.state[r.file.state]}
						selected={selected === r.path}
						onSelect={() => onSelect(r.path)}
						menu={menu?.(r.file)}
						check={{
							checked: live.includes(r.path),
							label: format(t.code.select, { name: r.path }),
							onChange: (on) => toggle([r.path], on),
						}}
					/>
				),
			)}
		</Panel>
	);
}

/** The stashes and the button that makes one (REQ-006). */
function Stashes({ dirty, run }: { dirty: boolean; run: (job: () => Promise<unknown>) => void }) {
	const { t } = useI18n();
	const stashes = useStashes().data ?? [];
	const { stash, applyStash, dropStash } = useCodeActions();
	const [name, setName] = useState("");
	return (
		<Panel
			title={t.code.stashes}
			count={stashes.length}
			flush
			className="shrink-0"
			bodyClassName="py-2"
		>
			<div className="flex items-center gap-2 px-3 pb-1">
				<Input label={t.code.stashName} value={name} onChange={(e) => setName(e.target.value)} />
				<RightButton
					right="code.write"
					disabled={!dirty}
					onClick={() =>
						run(async () => {
							await stash(name.trim() || null);
							setName("");
						})
					}
				>
					{t.code.stash}
				</RightButton>
			</div>
			{stashes.map((s) => (
				<SettingsRow key={s.id} label={s.message}>
					<RightButton
						right="code.write"
						variant="ghost"
						onClick={() => run(() => applyStash(s.index))}
					>
						{t.code.apply}
					</RightButton>
					<RightButton
						right="code.write"
						variant="ghost"
						onClick={() =>
							run(async () => {
								if (await confirmDialog(format(t.code.confirmDrop, { name: s.message })))
									await dropStash(s.id);
							})
						}
					>
						{t.code.drop}
					</RightButton>
				</SettingsRow>
			))}
		</Panel>
	);
}

/** The diff of one side of a file. */
function DiffPane({ path, side }: { path: string; side: DiffSide }) {
	const { t } = useI18n();
	const diff = useDiff(path, side).data;
	if (!diff) return null;
	return (
		<div>
			<h2 className="sticky top-0 z-10 flex h-10 items-center gap-2 border-b bg-surface-1 px-3 text-12 font-medium text-n-11">
				<span className="truncate font-mono text-n-12">{path}</span>
				<Badge variant={side === "staged" ? "success" : "neutral"}>
					{t.code[side === "staged" ? "staged" : "unstaged"]}
				</Badge>
			</h2>
			{diff.text ? (
				<DiffView
					text={diff.text}
					path={path}
					binary={diff.binary}
					truncated={diff.truncated}
					// The staged and the unstaged diff of one file are two regions: the side tells them apart.
					label={`${format(t.code.diff, { path })} ${t.code[side === "staged" ? "staged" : "unstaged"]}`}
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
					<span className="font-mono text-12 text-n-11">
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

const inGroups = (c: ChangesData, path: string) => ({
	staged: c.staged.some((f) => f.path === path),
	unstaged: [...c.unstaged, ...c.untracked].some((f) => f.path === path),
	conflict: c.conflicted.some((f) => f.path === path),
});

/**
 * The commit box of Code / Now (`spec:app-redesign#REQ-022`): the message, the description and the one
 * commit. "Write it for me" leaves the staged files in the draft of the assistant.
 */
function CommitBox({ changes }: { changes: ChangesData }) {
	const { t } = useI18n();
	const { commit } = useCodeActions();
	const { ask } = useShell();
	const { profile } = usePrefs();
	const { failure, busy, run } = useRun();
	const [summary, setSummary] = useState("");
	const [description, setDescription] = useState("");
	return (
		<form
			aria-label={t.shell.commit}
			className="flex shrink-0 flex-col gap-2 rounded-lg border bg-surface-1 p-3 shadow-1"
			onSubmit={(e) => {
				e.preventDefault();
				void run(async () => {
					await commit(summary, description);
					setSummary("");
					setDescription("");
				});
			}}
		>
			<Input
				label={t.code.summary}
				className="min-h-control"
				value={summary}
				onChange={(e) => setSummary(e.target.value)}
			/>
			<Textarea
				label={t.code.description}
				value={description}
				onChange={(e) => setDescription(e.target.value)}
			/>
			<ErrorNotice error={failure} />
			<div className="flex flex-wrap gap-2">
				<Button
					className="min-h-control flex-1"
					disabled={changes.staged.length === 0}
					onClick={() =>
						ask(
							format(t.forge.now.writePrompt, {
								files: changes.staged.map((f) => f.path).join(", "),
							}),
						)
					}
				>
					{t.forge.now.write}
				</Button>
				<RightButton
					type="submit"
					right="code.write"
					variant="primary"
					className="min-h-control flex-1"
					busy={busy}
					// A read only profile makes no commit, and a conflict or an empty stage refuses it.
					disabled={!canCommit(changes) || profile.readOnly}
				>
					{t.shell.commit}
				</RightButton>
			</div>
		</form>
	);
}

/** The files to commit of Code / Now: the groups, the commit box, the stashes and the diff of one file. */
export function WorkingCopy() {
	const { t } = useI18n();
	const changes = useChanges(true).data;
	const conflicts = useConflicts().data ?? [];
	const { stage, unstage, discard } = useCodeActions();
	const menu = useMenus();
	const { error, run: runJob } = useRun();
	// The first changed file opens by default, and the choice stays with the tab.
	const [path, setPath] = useTabSelection(
		"code:changes",
		changes
			? [...changes.conflicted, ...changes.staged, ...changes.unstaged, ...changes.untracked].map(
					(f) => f.path,
				)
			: [],
	);
	const { setFilesOpen } = useShell();
	const { gate } = useRights();
	const run = (job: () => Promise<unknown>) => void runJob(job);
	if (!changes) return null;
	const unstaged = [...changes.unstaged, ...changes.untracked];
	const here = path ? inGroups(changes, path) : null;
	const conflict = path ? conflicts.find((c) => c.path === path) : undefined;

	const discardGroup = async (paths: string[], files: FileChange[]) => {
		const list = paths.join(", ");
		if (!(await confirmDialog(format(t.code.confirmDiscard, { count: paths.length, paths: list }))))
			return;
		const untracked = files.some((f) => paths.includes(f.path) && f.state === "untracked");
		await discard(paths, untracked);
	};

	// The same actions as the group buttons, for one file. Without `code.write` they show, off.
	const fileMenu = (file: FileChange, own: Handlers) =>
		menu("file", {
			...own,
			"copy-path": () => copyText(file.path),
		}).map((item) => (item.id in own ? { ...item, ...gate("code.write") } : item));

	const count = changes.staged.length + unstaged.length + changes.conflicted.length;
	return (
		<section aria-labelledby="code-now-files" className="flex flex-col gap-3">
			<h2 id="code-now-files" className="text-16 font-semibold text-n-12">
				{count === 0
					? t.forge.now.clean
					: count === 1
						? t.forge.now.file
						: format(t.forge.now.files, { count })}
			</h2>
			{/* The list sets the height, so the commit box is never cut; the diff keeps a fixed height and stays in view. */}
			<div className="flex items-start gap-3">
				<SplitPane id="code-changes-width" label={t.forge.resize.changes} fallback={384}>
					<div className="flex shrink-0 flex-col gap-3 overflow-y-auto">
						<GateNotice push={false} />
						{changes.conflicted.length ? <ConflictAgent /> : null}
						{changes.conflicted.length ? (
							<FileGroup
								group="conflicts"
								files={changes.conflicted}
								selected={path}
								onSelect={setPath}
								menu={(f) => menu("file", { "copy-path": () => copyText(f.path) })}
							/>
						) : null}
						<FileGroup
							group="staged"
							files={changes.staged}
							selected={path}
							onSelect={setPath}
							menu={(f) => fileMenu(f, { unstage: () => run(() => unstage([f.path])) })}
							actions={(paths) => (
								<RightButton
									right="code.write"
									variant="ghost"
									onClick={() => run(() => unstage(paths))}
								>
									{format(t.count, { name: t.code.unstage, count: paths.length })}
								</RightButton>
							)}
						/>
						<FileGroup
							group="unstaged"
							files={unstaged}
							selected={path}
							onSelect={setPath}
							menu={(f) =>
								fileMenu(f, {
									stage: () => run(() => stage([f.path])),
									discard: () => run(() => discardGroup([f.path], [f])),
								})
							}
							actions={(paths, files) => (
								<>
									<RightButton
										right="code.write"
										variant="ghost"
										onClick={() => run(() => discardGroup(paths, files))}
									>
										{format(t.count, { name: t.code.discard, count: paths.length })}
									</RightButton>
									<RightButton
										right="code.write"
										variant="primary"
										onClick={() => run(() => stage(paths))}
									>
										{format(t.count, { name: t.code.stage, count: paths.length })}
									</RightButton>
								</>
							)}
						/>
						<CommitBox changes={changes} />
						<Stashes dirty={changes.staged.length + unstaged.length > 0} run={run} />
						{error ? (
							<p role="alert" className="px-3 py-2 text-ui text-danger-text">
								{error}
							</p>
						) : null}
					</div>
				</SplitPane>
				<div className="sticky top-0 h-[36rem] min-w-0 flex-1 overflow-auto rounded-lg border bg-surface-1 shadow-1">
					{conflict ? <ConflictPane key={conflict.path} file={conflict} run={run} /> : null}
					{path && here?.staged ? <DiffPane path={path} side="staged" /> : null}
					{path && here?.unstaged ? <DiffPane path={path} side="unstaged" /> : null}
					{path ? null : (
						<EmptyState
							title={t.empty.file}
							action={{ label: t.panels.files.toggle, onClick: () => setFilesOpen(true) }}
						/>
					)}
				</div>
			</div>
		</section>
	);
}
