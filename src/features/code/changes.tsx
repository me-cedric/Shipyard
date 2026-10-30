import { type ReactNode, useState } from "react";
import {
	type Changes as ChangesData,
	type ConflictFile,
	type DiffSide,
	type FileChange,
	useChanges,
	useCodeActions,
	useConflicts,
	useDiff,
	usePulls,
	useStashes,
} from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { confirmDialog } from "@/lib/ipc";
import { copyText, type Handlers, useMenus } from "@/lib/menus";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { CodeBracketIcon } from "@/ui/icons";
import { ConflictBlock, type ConflictChoice } from "@/ui/molecules/conflict-block";
import type { MenuItem } from "@/ui/molecules/context-menu";
import { DiffView } from "@/ui/molecules/diff-view";
import { FileRow } from "@/ui/molecules/file-row";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { StatStrip } from "@/ui/molecules/stat-strip";
import { ConflictAgent } from "./conflict-agent";
import { withProject } from "./project-gate";
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
				<Button
					disabled={!dirty}
					onClick={() =>
						run(async () => {
							await stash(name.trim() || null);
							setName("");
						})
					}
				>
					{t.code.stash}
				</Button>
			</div>
			{stashes.map((s) => (
				<SettingsRow key={s.id} label={s.message}>
					<Button variant="ghost" onClick={() => run(() => applyStash(s.index))}>
						{t.code.apply}
					</Button>
					<Button
						variant="ghost"
						onClick={() =>
							run(async () => {
								if (await confirmDialog(format(t.code.confirmDrop, { name: s.message })))
									await dropStash(s.id);
							})
						}
					>
						{t.code.drop}
					</Button>
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
			<DiffView
				text={diff.text}
				binary={diff.binary}
				truncated={diff.truncated}
				label={format(t.code.diff, { path })}
				binaryLabel={t.code.binary}
				truncatedLabel={t.code.truncated}
			/>
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
	const blocks = file.segments.flatMap((s) => (s.kind === "block" ? [s] : []));
	const picked = blocks.every((_, i) => choices[i] !== undefined);
	return (
		<section aria-label={file.path}>
			<div className="flex items-center gap-2 px-3 py-1">
				<h2 className="flex-1 truncate text-ui font-medium">{file.path}</h2>
				<Button
					variant="ghost"
					onClick={() => run(() => resolve(file.path, { kind: "whole", side: "ours" }))}
				>
					{t.code.takeOurs}
				</Button>
				<Button
					variant="ghost"
					onClick={() => run(() => resolve(file.path, { kind: "whole", side: "theirs" }))}
				>
					{t.code.takeTheirs}
				</Button>
				<Button variant="ghost" onClick={() => run(() => resolve(file.path, { kind: "marked" }))}>
					{t.code.markResolved}
				</Button>
				{file.text ? (
					<Button
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
					</Button>
				) : null}
			</div>
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

function ChangesView() {
	const { t } = useI18n();
	const changes = useChanges(true).data;
	const pulls = usePulls().data;
	const conflicts = useConflicts().data ?? [];
	const { stage, unstage, discard } = useCodeActions();
	const menu = useMenus();
	const { error, run: runJob } = useRun();
	const [path, setPath] = useState<string | null>(null);
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

	// The same actions as the group buttons, for one file.
	const fileMenu = (file: FileChange, own: Handlers) =>
		menu("file", {
			...own,
			"copy-path": () => copyText(file.path),
		});

	const open = (pulls ?? []).filter((r) => r.state === "open");
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				icon={<CodeBracketIcon size={16} />}
				title={t.tabs.code.changes}
				count={changes.staged.length + unstaged.length + changes.conflicted.length}
				chips={changes.branch ? <Badge className="font-mono">{changes.branch}</Badge> : undefined}
			/>
			<StatStrip
				className="px-4"
				items={[
					{
						label: t.ui.changes,
						value: String(changes.staged.length + unstaged.length),
						delta: format(t.count, { name: t.code.staged, count: changes.staged.length }),
						tone: "accent",
					},
					{ label: t.ui.ahead, value: String(changes.ahead), tone: "success" },
					{ label: t.ui.behind, value: String(changes.behind), tone: "warning" },
					{
						label: t.tabs.code["pull-requests"],
						value: String(open.length),
						delta: open.some((r) => r.ci === "failing") ? t.forge.ci.failing : undefined,
						tone: open.some((r) => r.ci === "failing") ? "danger" : "info",
					},
				]}
			/>
			<div className="flex min-h-0 flex-1 gap-3 px-4 pt-3 pb-4">
				<div className="flex w-96 shrink-0 flex-col gap-3 overflow-y-auto">
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
							<Button variant="ghost" onClick={() => run(() => unstage(paths))}>
								{format(t.count, { name: t.code.unstage, count: paths.length })}
							</Button>
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
								<Button variant="ghost" onClick={() => run(() => discardGroup(paths, files))}>
									{format(t.count, { name: t.code.discard, count: paths.length })}
								</Button>
								<Button variant="primary" onClick={() => run(() => stage(paths))}>
									{format(t.count, { name: t.code.stage, count: paths.length })}
								</Button>
							</>
						)}
					/>
					<Stashes dirty={changes.staged.length + unstaged.length > 0} run={run} />
					{error ? (
						<p role="alert" className="px-3 py-2 text-ui text-danger-text">
							{error}
						</p>
					) : null}
				</div>
				<div className="min-w-0 flex-1 overflow-auto rounded-lg border bg-surface-1 shadow-1">
					{conflict ? <ConflictPane key={conflict.path} file={conflict} run={run} /> : null}
					{path && here?.staged ? <DiffPane path={path} side="staged" /> : null}
					{path && here?.unstaged ? <DiffPane path={path} side="unstaged" /> : null}
				</div>
			</div>
		</div>
	);
}

export const Changes = withProject(ChangesView);
