import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { FileChange, PullDetail } from "@/lib/code";
import { usePendingReview } from "@/lib/code/pending-review";
import { format, useI18n } from "@/lib/i18n";
import { foldWords } from "@/lib/refs";
import { useRights } from "@/lib/rights";
import { useViewState } from "@/lib/shell/view-state";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Progress } from "@/ui/atoms/progress";
import { countsOf, type DiffFileItem, DiffFileList } from "@/ui/molecules/diff-file-list";
import { shownLines } from "@/ui/molecules/diff-view";
import { FileRow, type FileState } from "@/ui/molecules/file-row";
import { InlineBox, PendingCard } from "./inline-comment";
import { ThreadCard } from "./pull-thread";
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
	const i = t.forge.pullInline;
	const review = usePendingReview(detail.reference);
	const write = useRights().gate("code.write");
	// Pending comments on a file that left the pull request: no diff shows them, so they get a group of their own.
	const gone = review.comments.filter((c) => !detail.files.some((f) => f.path === c.path));
	const commentBadge = (n?: number) =>
		n ? format(n === 1 ? i.commentsOne : i.commentsMany, { n }) : undefined;
	// The boxes that are open, and the line button that takes the focus back when one closes.
	const [boxes, setBoxes] = useState<{ path: string; line: number }[]>([]);
	const back = useRef<{ path: string; line: number } | null>(null);
	// The new-file lines of each patch that the diff shows, found when a file first needs them.
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new file list starts a new cache
	const shown = useMemo(() => new Map<string, Set<number>>(), [detail.files]);
	// Threads on a line and pending comments, for the badge of each file.
	const commentCount = useMemo(() => {
		const n = new Map<string, number>();
		const add = (path?: string | null) => path && n.set(path, (n.get(path) ?? 0) + 1);
		for (const th of detail.threads) if (th.line) add(th.path);
		for (const c of review.comments) add(c.path);
		return n;
	}, [detail.threads, review.comments]);

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

	// After a box closes or a card is deleted the focus goes to the "+" of its line, else to the heading of its group.
	// biome-ignore lint/correctness/useExhaustiveDependencies: it runs when a box or a pending comment goes
	useEffect(() => {
		const to = back.current;
		if (!to || boxes.some((b) => b.path === to.path && b.line === to.line)) return;
		back.current = null;
		const file = [...(list.current?.querySelectorAll<HTMLElement>("[data-path]") ?? [])].find(
			(el) => el.dataset.path === to.path,
		);
		(
			file?.querySelector<HTMLElement>(`[data-line-action="${to.line}"]`) ??
			file?.querySelector<HTMLElement>("[data-outside]") ??
			list.current?.querySelector<HTMLElement>("[data-gone]")
		)?.focus();
	}, [boxes, review.comments]);

	/** Under each line: its review threads, its pending comments and its open box. The rest go to the foot of the file. */
	const inline = (f: DiffFileItem) => {
		const lines = shown.get(f.path) ?? shownLines(f.patch ?? "");
		shown.set(f.path, lines);
		const under = new Map<number, ReactNode[]>();
		const outside: ReactNode[] = [];
		const put = (line: number, node: ReactNode) => {
			if (!lines.has(line)) return void outside.push(node);
			under.set(line, [...(under.get(line) ?? []), node]);
		};
		for (const th of detail.threads)
			if (th.path === f.path && th.line)
				put(th.line, <ThreadCard key={th.id} reference={detail.reference} th={th} />);
		for (const c of review.comments)
			if (c.path === f.path)
				put(
					c.line,
					<PendingCard
						key={c.id}
						c={c}
						outdated={c.headSha !== detail.headSha}
						storageError={review.storageError}
						onSave={(body) => review.update(c.id, body)}
						onRemove={() => {
							back.current = { path: c.path, line: c.line };
							review.remove(c.id);
						}}
					/>,
				);
		for (const b of boxes)
			if (b.path === f.path)
				put(
					b.line,
					<InlineBox
						key={`box:${b.line}`}
						reference={detail.reference}
						headSha={detail.headSha}
						path={b.path}
						line={b.line}
						onClose={() => {
							back.current = b;
							setBoxes((x) => x.filter((y) => y !== b));
						}}
					/>,
				);
		const notes = Object.fromEntries(
			[...under].map(([line, nodes]) => [
				line,
				<div key={line} className="flex flex-col divide-y rounded-lg border bg-surface-1">
					{nodes}
				</div>,
			]),
		);
		return { notes, outside };
	};

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
								badge={commentBadge(commentCount.get(r.path))}
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
								comments: commentCount.get(f.path),
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
							diffProps={(f) =>
								expanded.has(f.path)
									? {
											notes: inline(f).notes,
											lineActionLabel: i.addComment,
											lineActionDisabled: write.disabled ? write.reason : undefined,
											hiddenNotesLabel: i.hiddenNotes,
											onLineAction: ({ newLine }) =>
												setBoxes((x) =>
													x.some((b) => b.path === f.path && b.line === newLine)
														? x
														: [...x, { path: f.path, line: newLine }],
												),
										}
									: {}
							}
							foot={(f) => {
								const outside = expanded.has(f.path) ? inline(f).outside : [];
								return outside.length ? (
									<section aria-label={i.outside} className="flex flex-col gap-1 px-3 py-2">
										<h3 tabIndex={-1} data-outside="" className="text-12 text-n-11">
											{i.outside}
										</h3>
										<div className="flex flex-col divide-y rounded-lg border bg-surface-1">
											{outside}
										</div>
									</section>
								) : null;
							}}
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
					{gone.length ? (
						<section aria-label={i.gone} className="flex flex-col gap-1 border-t px-3 py-2">
							<h3 tabIndex={-1} data-gone="" className="text-12 text-n-11">
								{i.gone}
							</h3>
							<div className="flex flex-col divide-y rounded-lg border bg-surface-1">
								{gone.map((c) => (
									<div key={c.id}>
										<p className="px-3 pt-2 font-mono text-12 text-n-11">
											{c.path}:{c.line}
										</p>
										<PendingCard
											c={c}
											outdated={c.headSha !== detail.headSha}
											storageError={review.storageError}
											onSave={(body) => review.update(c.id, body)}
											onRemove={() => {
												back.current = { path: c.path, line: c.line };
												review.remove(c.id);
											}}
										/>
									</div>
								))}
							</div>
						</section>
					) : null}
				</div>
			</div>
			{viewing ? <FileDialog path={viewing} onClose={() => setViewing(null)} /> : null}
		</div>
	);
}
