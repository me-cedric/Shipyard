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
	useStashes,
} from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { confirmDialog } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { ConflictBlock, type ConflictChoice } from "@/ui/molecules/conflict-block";
import { DiffView } from "@/ui/molecules/diff-view";
import { FileRow } from "@/ui/molecules/file-row";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { withProject } from "./project-gate";
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
}: {
	group: Group;
	files: FileChange[];
	selected: string | null;
	onSelect: (path: string) => void;
	/** The buttons of the group. They act on the checked files, or on all of them. */
	actions?: (paths: string[], files: FileChange[]) => ReactNode;
}) {
	const { t } = useI18n();
	const [checked, setChecked] = useState<string[]>([]);
	const live = checked.filter((p) => files.some((f) => f.path === p));
	const targets = live.length ? live : files.map((f) => f.path);
	const toggle = (paths: string[], on: boolean) =>
		setChecked((c) => (on ? [...new Set([...c, ...paths])] : c.filter((p) => !paths.includes(p))));
	return (
		<section aria-label={t.code[group]} className="border-b pb-1">
			<div className="flex min-h-row items-center gap-2 px-3">
				<h2 className="flex-1 text-12 font-medium text-n-11">
					{format(t.count, { name: t.code[group], count: files.length })}
				</h2>
				{files.length ? actions?.(targets, files) : null}
			</div>
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
						check={{
							checked: live.includes(r.path),
							label: format(t.code.select, { name: r.path }),
							onChange: (on) => toggle([r.path], on),
						}}
					/>
				),
			)}
		</section>
	);
}

/** The stashes and the button that makes one (REQ-006). */
function Stashes({ dirty, run }: { dirty: boolean; run: (job: () => Promise<unknown>) => void }) {
	const { t } = useI18n();
	const stashes = useStashes().data ?? [];
	const { stash, applyStash, dropStash } = useCodeActions();
	const [name, setName] = useState("");
	return (
		<section aria-label={t.code.stashes}>
			<div className="flex min-h-row items-center gap-2 px-3">
				<h2 className="flex-1 text-12 font-medium text-n-11">
					{format(t.count, { name: t.code.stashes, count: stashes.length })}
				</h2>
			</div>
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
									await dropStash(s.index);
							})
						}
					>
						{t.code.drop}
					</Button>
				</SettingsRow>
			))}
		</section>
	);
}

/** The diff of one side of a file. */
function DiffPane({ path, side }: { path: string; side: DiffSide }) {
	const { t } = useI18n();
	const diff = useDiff(path, side).data;
	if (!diff) return null;
	return (
		<div>
			<h2 className="px-3 py-1 text-12 font-medium text-n-11">
				{t.code[side === "staged" ? "staged" : "unstaged"]}
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
function ConflictPane({
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
	const conflicts = useConflicts().data ?? [];
	const { stage, unstage, discard } = useCodeActions();
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

	return (
		<div className="flex h-full">
			<h1 className="sr-only">{t.tabs.code.changes}</h1>
			<div className="w-96 shrink-0 overflow-y-auto border-r">
				{changes.conflicted.length ? (
					<FileGroup
						group="conflicts"
						files={changes.conflicted}
						selected={path}
						onSelect={setPath}
					/>
				) : null}
				<FileGroup
					group="staged"
					files={changes.staged}
					selected={path}
					onSelect={setPath}
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
			<div className="min-w-0 flex-1 overflow-auto">
				{conflict ? <ConflictPane key={conflict.path} file={conflict} run={run} /> : null}
				{path && here?.staged ? <DiffPane path={path} side="staged" /> : null}
				{path && here?.unstaged ? <DiffPane path={path} side="unstaged" /> : null}
			</div>
		</div>
	);
}

export const Changes = withProject(ChangesView);
