import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { FileChange, PullDetail } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { foldWords } from "@/lib/refs";
import { useViewState } from "@/lib/shell/view-state";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Progress } from "@/ui/atoms/progress";
import { countsOf, DiffFileList } from "@/ui/molecules/diff-file-list";
import { FileRow, type FileState } from "@/ui/molecules/file-row";
import { treeRows } from "./tree";
import { FileDialog } from "./viewer";

const FILE_STATE: Record<string, FileState> = {
	added: "added",
	modified: "modified",
	removed: "deleted",
	renamed: "renamed",
};

const stateOf = (status: string): FileState => FILE_STATE[status] ?? "modified";

/** How many files Expand all opens at once: each open file mounts its diff. */
export const EXPAND_STEP = 30;

/** The "Files changed" tab: a filter and a tree of the files, then the files closed with their counts. */
export function PullFiles({ detail }: { detail: PullDetail }) {
	const { t } = useI18n();
	const p = t.forge.pullFiles;
	const [query, setQuery] = useState("");
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [closed, setClosed] = useState<Set<string>>(new Set());
	// Each click on a tree file counts: a second click on the same file scrolls again.
	const [jump, setJump] = useState<{ path: string | null; n: number }>({ path: null, n: 0 });
	const current = jump.path;
	const [active, setActive] = useState<string | null>(null);
	const [viewing, setViewing] = useState<string | null>(null);
	// One key for each pull request, with the push it belongs to: a new push starts the marks again and no old key stays.
	const [marks, setMarks] = useViewState<{ sha: string; paths: string[] }>(
		`pull-viewed:${detail.reference}`,
		{ sha: "", paths: [] },
	);
	const viewedList = marks.sha === detail.headSha ? marks.paths : [];
	const list = useRef<HTMLDivElement>(null);

	const files = useMemo(() => {
		const words = foldWords(query);
		const hits = detail.files.filter((f) => {
			const hay = foldWords(f.path).join(" ");
			return words.every((w) => hay.includes(w));
		});
		// The list reads in the order of the tree: folders first, then names.
		const byPath = new Map(hits.map((f) => [f.path, f]));
		return treeRows(
			hits.map<FileChange>((f) => ({ path: f.path, old_path: null, state: stateOf(f.status) })),
		).flatMap((r) => {
			const f = r.kind === "file" ? byPath.get(r.path) : undefined;
			return f ? [f] : [];
		});
	}, [detail.files, query]);
	const totals = useMemo(() => {
		let added = 0;
		let removed = 0;
		for (const f of detail.files) {
			const n = countsOf(f.patch ?? "");
			added += n.added;
			removed += n.removed;
		}
		return { added, removed };
	}, [detail.files]);
	// Expand all opens the first 30 closed files. Once some are open on a long list, the button offers the next ones.
	const rest = files.filter((f) => !expanded.has(f.path));
	const more = files.length > EXPAND_STEP && rest.length > 0 && rest.length < files.length;
	const viewed = useMemo(() => new Set(viewedList), [viewedList]);
	const done = detail.files.filter((f) => viewed.has(f.path)).length;

	const rows = treeRows(
		files.map<FileChange>((f) => ({ path: f.path, old_path: null, state: stateOf(f.status) })),
	).filter((r) => ![...closed].some((c) => r.path.startsWith(`${c}/`)));
	const key = (r: (typeof rows)[number]) => `${r.kind}:${r.path}`;
	const tab = active && rows.some((r) => key(r) === active) ? active : rows[0] && key(rows[0]);

	// The row of a file that the tree opened scrolls into view once it is drawn.
	useEffect(() => {
		if (jump.n === 0 || !current) return;
		const rowsOf = list.current?.querySelectorAll<HTMLElement>("[data-path]") ?? [];
		for (const el of rowsOf) if (el.dataset.path === current) el.scrollIntoView({ block: "start" });
	}, [jump, current]);

	const flip = (set: Set<string>, path: string) => {
		const next = new Set(set);
		if (!next.delete(path)) next.add(path);
		return next;
	};
	const move = (e: KeyboardEvent<HTMLDivElement>) => {
		if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
		e.preventDefault();
		const buttons = [...e.currentTarget.querySelectorAll("button")];
		const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
		const to =
			e.key === "Home"
				? 0
				: e.key === "End"
					? buttons.length - 1
					: at + (e.key === "ArrowDown" ? 1 : -1);
		buttons[Math.min(Math.max(to, 0), buttons.length - 1)]?.focus();
	};

	return (
		<div className="flex flex-col gap-3 min-[1100px]:flex-row min-[1100px]:items-start">
			<div className="flex min-w-0 flex-col gap-2 min-[1100px]:w-72 min-[1100px]:shrink-0">
				<Input
					type="search"
					label={p.filter}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				{/* biome-ignore lint/a11y/useSemanticElements: a group of rows with arrow keys, not a form fieldset */}
				<div
					role="group"
					aria-label={p.tree}
					onKeyDown={move}
					className="rounded-lg border bg-surface-2 py-1"
				>
					{rows.map((r) => {
						const k = key(r);
						const buttonProps = {
							tabIndex: k === tab ? 0 : -1,
							onFocus: () => setActive(k),
						};
						return r.kind === "folder" ? (
							<FileRow
								key={k}
								name={r.name}
								depth={r.depth}
								onSelect={() => setClosed((c) => flip(c, r.path))}
								buttonProps={{ ...buttonProps, "aria-expanded": !closed.has(r.path) }}
							/>
						) : (
							<FileRow
								key={k}
								name={r.name}
								depth={r.depth}
								state={r.file.state}
								stateLabel={t.code.state[r.file.state]}
								selected={current === r.path}
								onSelect={() => {
									setExpanded((x) => new Set(x).add(r.path));
									setJump((j) => ({ path: r.path, n: j.n + 1 }));
								}}
								buttonProps={buttonProps}
							/>
						);
					})}
				</div>
			</div>
			<div className="min-w-0 flex-1 overflow-hidden rounded-lg border bg-surface-2">
				<div className="flex flex-wrap items-center gap-3 border-b px-3 py-1 text-ui text-n-11">
					<span>{format(p.count, { n: files.length })}</span>
					<span aria-hidden="true" className="font-mono text-11">
						<span className="text-success-text">+{totals.added}</span>{" "}
						<span className="text-danger-text">−{totals.removed}</span>
					</span>
					<span className="sr-only">{format(p.counts, totals)}</span>
					<Button
						variant="ghost"
						disabled={!rest.length}
						onClick={() =>
							setExpanded((x) => new Set([...x, ...rest.slice(0, EXPAND_STEP).map((f) => f.path)]))
						}
					>
						{more
							? format(p.expandNext, { count: Math.min(EXPAND_STEP, rest.length) })
							: p.expandAll}
					</Button>
					<Button variant="ghost" onClick={() => setExpanded(new Set())}>
						{p.collapseAll}
					</Button>
					<span className="ml-auto flex items-center gap-2">
						<span>{format(p.viewed, { done, total: detail.files.length })}</span>
						<Progress
							value={done}
							max={detail.files.length}
							label={format(p.viewed, { done, total: detail.files.length })}
							className="w-24"
						/>
					</span>
				</div>
				{detail.filesTruncated ? (
					<p role="status" className="border-b px-3 py-1 text-ui text-n-11">
						{format(p.truncatedNote, { count: detail.files.length })}
					</p>
				) : null}
				<div ref={list}>
					{files.length ? (
						<DiffFileList
							files={files.map((f) => ({
								path: f.path,
								state: stateOf(f.status),
								patch: f.patch,
							}))}
							expanded={expanded}
							onToggle={(path) => setExpanded((x) => flip(x, path))}
							viewed={viewed}
							onViewedChange={(path, on) =>
								setMarks({
									sha: detail.headSha,
									paths: on ? [...viewedList, path] : viewedList.filter((x) => x !== path),
								})
							}
							head={(f) => (
								<div className="px-3 pt-1">
									<Button variant="ghost" onClick={() => setViewing(f.path)}>
										{format(t.forge.openFile, { path: f.path })}
									</Button>
								</div>
							)}
						/>
					) : (
						<p className="px-3 py-2 text-ui text-n-11">{p.noMatch}</p>
					)}
				</div>
			</div>
			{viewing ? <FileDialog path={viewing} onClose={() => setViewing(null)} /> : null}
		</div>
	);
}
