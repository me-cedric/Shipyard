import {
	type ComponentProps,
	type Dispatch,
	Fragment,
	type KeyboardEvent,
	type ReactNode,
	type SetStateAction,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { type FileChange, type PullDetail, useForgeActions } from "@/lib/code";
import { usePendingReview } from "@/lib/code/pending-review";
import { format, useI18n } from "@/lib/i18n";
import { foldWords } from "@/lib/refs";
import { RightButton, useRights } from "@/lib/rights";
import { useViewState } from "@/lib/shell/view-state";
import { Badge } from "@/ui/atoms/badge";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { Checkbox } from "@/ui/atoms/checkbox";
import { Input } from "@/ui/atoms/input";
import { LinkButton } from "@/ui/atoms/link-button";
import { Progress } from "@/ui/atoms/progress";
import { Card } from "@/ui/molecules/card";
import { countsOf, type DiffFileItem } from "@/ui/molecules/diff-file-list";
import { DiffView, shownLines } from "@/ui/molecules/diff-view";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { FileRow, type FileState } from "@/ui/molecules/file-row";
import { MenuButton } from "@/ui/molecules/menu-button";
import { InlineBox, type LineBox, PendingCard } from "./inline-comment";
import { DIFF_LOOK, FocusThread } from "./pull-cards";
import { ThreadCard } from "./pull-thread";
import { treeRows } from "./tree";
import { useRun } from "./use-run";
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

/** A picture has no text diff: its row says "Picture" and shows Before and After. */
const isPicture = (path: string) => /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/i.test(path);

/** The lines that an open file adds and removes, at the right of its row. */
function Counts({ patch }: { patch: string }) {
	const { t } = useI18n();
	const n = useMemo(() => countsOf(patch), [patch]);
	return (
		<>
			<span aria-hidden="true" className="flex gap-2 font-semibold">
				<span className="text-success-text">+{n.added}</span>
				{n.removed ? <span className="text-danger-text">−{n.removed}</span> : null}
			</span>
			<span className="sr-only">{format(t.forge.pullFiles.counts, n)}</span>
		</>
	);
}

/**
 * One comment on a file: it goes to the conversation of the pull request and names the file.
 * shortcut: no command of today takes a comment on a file, upgrade when the code host command has one.
 */
function FileComment({ number, path }: { number: number; path: string }) {
	const { t } = useI18n();
	const x = t.flow.look.pull;
	const { comment } = useForgeActions();
	const { failure, busy, run } = useRun();
	const [body, setBody] = useState("");
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				if (body.trim() === "" || busy) return;
				void run(async () => {
					await comment(number, `\`${path}\`: ${body}`);
					setBody("");
				});
			}}
			className="flex flex-wrap gap-2.5 px-6 pt-1 pb-4"
		>
			<Input
				label={x.fileComment}
				value={body}
				onChange={(e) => setBody(e.target.value)}
				className="w-auto flex-[1_1_200px]"
			/>
			<RightButton type="submit" right="code.write" busy={busy} disabled={body.trim() === ""}>
				{x.send}
			</RightButton>
			<ErrorNotice error={failure} className="basis-full" />
		</form>
	);
}

/**
 * The changed files page: "n of m seen", "Find a file", then each file closed with its Seen mark.
 * An open file shows its code, its line comments and one comment field. More holds the file tree
 * and Collapse all.
 */
export function PullFiles({
	detail,
	boxes,
	setBoxes,
	tree: startTree = false,
	menu = [],
	menuHost = null,
	openFirst = false,
}: {
	/** More items of the page that hold other cards (the commits, the spec archive). */
	menu?: ComponentProps<typeof MenuButton>["items"];
	/** Where More draws (the title row of the page). Null: More draws in place. */
	menuHost?: HTMLElement | null;
	/** The first file is open on arrival. */
	openFirst?: boolean;
	/** The file tree shows from the start. Else More opens it. */
	tree?: boolean;
	detail: PullDetail;
	/** The open line boxes with their text: they live in the page and survive a collapsed file or a tab. */
	boxes: LineBox[];
	setBoxes: Dispatch<SetStateAction<LineBox[]>>;
}) {
	const { t } = useI18n();
	const p = t.forge.pullFiles;
	const x = t.flow.look.pull;
	const [tree, setTree] = useState(startTree);
	const [query, setQuery] = useState("");
	const [expanded, setExpanded] = useState<Set<string>>(
		() => new Set(openFirst && detail.files[0] ? [detail.files[0].path] : []),
	);
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
		const put = (line: number, key: string, content: ReactNode, bare = false) => {
			// A card has a border; an open thread brings its own grey box.
			const node = bare ? (
				<Fragment key={key}>{content}</Fragment>
			) : (
				<div key={key} className="rounded-lg border bg-surface-1">
					{content}
				</div>
			);
			if (!lines.has(line)) return void outside.push(node);
			under.set(line, [...(under.get(line) ?? []), node]);
		};
		for (const th of detail.threads)
			if (th.path === f.path && th.line)
				put(
					th.line,
					th.id,
					// An open thread has the form of the changes page; a resolved one keeps its Reopen.
					th.resolved ? (
						<ThreadCard reference={detail.reference} th={th} />
					) : (
						// The thread keeps its role and its name `path:line`, as the thread card has them.
						<article aria-label={`${th.path}${th.line ? `:${th.line}` : ""}`}>
							<FocusThread reference={detail.reference} th={th} className="my-2" />
						</article>
					),
					!th.resolved,
				);
		for (const c of review.comments)
			if (c.path === f.path)
				put(
					c.line,
					c.id,
					<PendingCard
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
					`box:${b.line}`,
					<InlineBox
						reference={detail.reference}
						headSha={detail.headSha}
						path={b.path}
						line={b.line}
						initial={b.text}
						onText={(text) =>
							setBoxes((x) =>
								x.map((y) => (y.path === b.path && y.line === b.line ? { ...y, text } : y)),
							)
						}
						onClose={() => {
							back.current = b;
							setBoxes((x) => x.filter((y) => !(y.path === b.path && y.line === b.line)));
						}}
					/>,
				);
		const notes = Object.fromEntries(
			[...under].map(([line, nodes]) => [
				line,
				<div key={line} className="flex flex-col gap-2">
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

	const seen = format(x.seenCount, { done, total: detail.files.length });
	const outsideOf = (f: DiffFileItem) => {
		const outside = inline(f).outside;
		return outside.length ? (
			<section aria-label={i.outside} className="flex flex-col gap-1 px-6 py-2">
				<h3 tabIndex={-1} data-outside="" className="text-13 text-n-11">
					{i.outside}
				</h3>
				<div className="flex flex-col gap-2">{outside}</div>
			</section>
		) : null;
	};

	const moreMenu = (
		<MenuButton
			iconOnly
			label={t.ui.more}
			icon={<span aria-hidden="true">···</span>}
			items={[
				{ id: "tree", label: x.tree, checked: tree, onSelect: () => setTree(!tree) },
				{
					id: "collapse",
					label: p.collapseAll,
					disabled: expanded.size === 0,
					onSelect: () => setExpanded(new Set()),
				},
				...menu,
			]}
		/>
	);

	return (
		<div className="flex flex-col gap-6">
			{menuHost ? createPortal(moreMenu, menuHost) : null}
			<div className="flex flex-wrap items-center gap-4">
				<div className="mr-auto flex min-w-0 flex-[1_1_200px] flex-col gap-2">
					<span className="font-semibold">{seen}</span>
					<Progress value={done} max={detail.files.length} label={seen} className="max-w-80" />
				</div>
				<Input
					type="search"
					label={x.find}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="max-w-65 flex-[1_1_200px]"
				/>
				{rest.length ? (
					<Button
						onClick={() =>
							setExpanded((e) => new Set([...e, ...rest.slice(0, EXPAND_STEP).map((f) => f.path)]))
						}
					>
						{more
							? format(p.expandNext, { count: Math.min(EXPAND_STEP, rest.length) })
							: p.expandAll}
					</Button>
				) : (
					<Button onClick={() => setExpanded(new Set())}>{p.collapseAll}</Button>
				)}
				{menuHost ? null : moreMenu}
			</div>
			{detail.filesTruncated ? (
				<p role="status" className="text-n-11">
					{format(p.truncatedNote, { count: detail.files.length })}
				</p>
			) : null}
			<div className="flex flex-col gap-6 min-[1100px]:flex-row min-[1100px]:items-start">
				{tree ? (
					// biome-ignore lint/a11y/useSemanticElements: a group of rows with arrow keys, not a form fieldset
					<div
						role="group"
						aria-label={p.tree}
						onKeyDown={move}
						className="rounded-lg bg-surface-2 py-2 shadow-2 min-[1100px]:w-72 min-[1100px]:shrink-0"
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
										setExpanded((e) => new Set(e).add(r.path));
										setJump((j) => ({ path: r.path, n: j.n + 1 }));
									}}
									buttonProps={buttonProps}
								/>
							);
						})}
					</div>
				) : null}
				<Card className="flex-1 overflow-hidden">
					<div ref={list}>
						{files.length ? (
							files.map((f) => {
								const open = expanded.has(f.path);
								const picture = f.patch == null && isPicture(f.path);
								return (
									<div
										key={f.path}
										data-path={f.path}
										className="border-t border-n-4 first:border-t-0"
									>
										<div className="flex min-h-15 flex-wrap items-center gap-x-3 px-6">
											<Checkbox
												hideLabel
												label={format(x.seenFile, { path: f.path })}
												checked={viewed.has(f.path)}
												onCheckedChange={(on) =>
													setMarks({
														sha: detail.headSha,
														paths:
															on === true
																? [...viewedList, f.path]
																: viewedList.filter((v) => v !== f.path),
													})
												}
											/>
											<span aria-hidden="true" className="text-13 font-semibold text-n-11">
												{x.seen}
											</span>
											<button
												type="button"
												aria-expanded={open}
												onClick={() => setExpanded((e) => flip(e, f.path))}
												className="flex min-h-15 min-w-0 flex-1 items-center gap-3 rounded-sm text-left focus-visible:shadow-glow"
											>
												<span className="min-w-0 flex-1 truncate font-mono text-14 font-semibold">
													{f.path}
												</span>
												{/* The count of lines is at the right (screen 90): the comments are in the name of the row. */}
												{commentBadge(commentCount.get(f.path)) ? (
													<span className="sr-only">{commentBadge(commentCount.get(f.path))}</span>
												) : null}
												{open ? null : picture ? (
													<Badge>{x.picture}</Badge>
												) : (
													<span className={buttonVariants()}>{x.open}</span>
												)}
											</button>
											{open ? (
												<span className="flex items-center gap-3">
													<LinkButton
														aria-label={`${x.wholeFile}: ${f.path}`}
														onClick={() => setViewing(f.path)}
													>
														{x.wholeFile}
													</LinkButton>
													{picture ? (
														<Badge>{x.picture}</Badge>
													) : f.patch ? (
														<Counts patch={f.patch} />
													) : null}
												</span>
											) : null}
										</div>
										{open ? (
											// An open diff far off screen skips its layout and paint until it comes near (no JS).
											<div className="[contain-intrinsic-size:auto_24rem] [content-visibility:auto]">
												{picture ? (
													<div className="grid grid-cols-2 gap-3 px-6 pb-5">
														{[t.code.before, t.code.after].map((name) => (
															<div key={name} className="flex min-w-0 flex-col gap-1.5">
																<span className="text-13 font-semibold text-n-11">{name}</span>
																{/* shortcut: no command of today reads a file of a pull request, upgrade when one does */}
																<div className="flex h-37.5 items-center justify-center rounded-lg border border-dashed border-n-7 bg-n-2 text-n-11">
																	{t.code.noPreview}
																</div>
															</div>
														))}
													</div>
												) : f.patch == null ? (
													<p className="px-6 pb-3 text-n-11">{t.code.noPreview}</p>
												) : (
													<div className={`border-t border-n-4 ${DIFF_LOOK}`}>
														<DiffView
															text={f.patch}
															path={f.path}
															label={format(t.code.diff, { path: f.path })}
															binaryLabel={t.code.binary}
															truncatedLabel={t.code.truncated}
															showAllLabel={p.showAll}
															notes={inline(f).notes}
															lineActionLabel={i.addComment}
															lineActionDisabled={write.disabled ? write.reason : undefined}
															hiddenNotesLabel={i.hiddenNotes}
															onLineAction={({ newLine }) =>
																setBoxes((b) =>
																	b.some((y) => y.path === f.path && y.line === newLine)
																		? b
																		: [...b, { path: f.path, line: newLine, text: "" }],
																)
															}
														/>
													</div>
												)}
												{outsideOf(f)}
												<FileComment number={detail.number} path={f.path} />
											</div>
										) : null}
									</div>
								);
							})
						) : (
							<p className="px-6 py-4 text-n-11">{p.noMatch}</p>
						)}
						{gone.length ? (
							<section
								aria-label={i.gone}
								className="flex flex-col gap-1 border-t border-n-4 px-6 py-3"
							>
								<h3 tabIndex={-1} data-gone="" className="text-13 text-n-11">
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
				</Card>
			</div>
			{viewing ? <FileDialog path={viewing} onClose={() => setViewing(null)} /> : null}
		</div>
	);
}
