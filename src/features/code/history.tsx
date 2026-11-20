import { Link, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { featureHref, useFeatures } from "@/features/flow/feature";
import { PageExport } from "@/features/reports/page-export";
import {
	useAvatars,
	useBlame,
	useCommitDetail,
	useCommitDiff,
	useEditors,
	useLog,
} from "@/lib/code";
import { graph } from "@/lib/code/graph";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { copyText, useMenus } from "@/lib/menus";
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useTabSelection } from "@/lib/shell/selection";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { LinkButton, linkClass } from "@/ui/atoms/link-button";
import { Segmented } from "@/ui/atoms/segmented";
import { Card } from "@/ui/molecules/card";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { DiffView } from "@/ui/molecules/diff-view";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { PageHeader } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";
import { SplitPane } from "@/ui/molecules/split-pane";
import { BranchSelector } from "./branch-selector";
import { featureOf } from "./branches-feature";
import { withProject } from "./project-gate";
import { diffCounts } from "./viewer";

/** One colour per lane of the graph, in turn. */
const LANE = ["bg-accent", "bg-success", "bg-warning", "bg-info", "bg-danger"];
const lane = (i: number) => LANE[i % LANE.length];
const STEP = 14;
/** The commits that show first, and the commits that "Older commits" adds. */
const PAGE = 5;
const LABEL = { branch: "accent", remote: "neutral", tag: "warning" } as const;

type FileState = keyof ReturnType<typeof useI18n>["t"]["code"]["state"];

/** The lines that one file of a commit adds and removes, in green and red. A file with no line change names its state. */
function FileCounts({ sha, file }: { sha: string; file: { path: string; state: FileState } }) {
	const { t } = useI18n();
	const diff = useCommitDiff(sha, file.path).data;
	if (!diff) return null;
	const { added, removed } = diffCounts(diff.text);
	if (!(added || removed))
		return (
			<span className="shrink-0 text-13 font-semibold text-n-11">{t.code.state[file.state]}</span>
		);
	return (
		<>
			{added ? <span className="font-semibold text-success-text">+{added}</span> : null}
			{removed ? <span className="font-semibold text-danger-text">−{removed}</span> : null}
		</>
	);
}

/**
 * One commit: who and when, the message, its feature and its changed files. A file opens its diff
 * (REQ-010). The buttons open a file in the editor, show who changed each line and hand the undo
 * to the assistant. The labels, the short id and the export are behind More.
 */
function Detail({ sha }: { sha: string }) {
	const { t, lang } = useI18n();
	const h = t.forge.history;
	const menu = useMenus();
	const { ask } = useShell();
	const moreId = useId();
	const detail = useCommitDetail(sha).data;
	const avatars = useAvatars(detail ? [detail.info.author_email] : []);
	const features = useFeatures().data ?? [];
	const editor = useEditors().data?.[0];
	// A click on a file opens its diff; a click on the open file closes it.
	const [file, setFile] = useState<string | null>(null);
	const [blaming, setBlaming] = useState(false);
	const [more, setMore] = useState(false);
	const [error, setError] = useState<unknown>(null);
	const picked = file ?? null;
	const open = picked && detail?.files.some((f) => f.path === picked) ? picked : null;
	// The buttons act on the open file, else on the first file of the commit.
	const target = open ?? detail?.files[0]?.path ?? null;
	const diff = useCommitDiff(detail && open ? sha : null, open).data;
	const blame = useBlame(target ?? "", blaming && target !== null);
	if (!detail) return null;
	const { info } = detail;
	const feature = featureOf(
		`${info.summary} ${info.labels.map((l) => l.name).join(" ")}`,
		features,
	);
	return (
		<div className="flex min-w-0 flex-1 flex-col gap-4">
			<Card pad className="flex flex-col gap-3">
				<div className="flex items-center gap-3">
					<Avatar name={info.author_name} src={avatars[info.author_email.trim().toLowerCase()]} />
					<span className="min-w-0 truncate font-semibold">{info.author_name}</span>
					<span className="ml-auto shrink-0 text-n-11">
						{new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(
							info.time * 1000,
						)}
					</span>
				</div>
				<h2 className="text-20 font-semibold text-n-12">{info.summary}</h2>
				{info.description ? (
					<p className="whitespace-pre-wrap text-n-12">{info.description}</p>
				) : null}
				{feature ? (
					<Link {...featureHref(feature)} className={linkClass}>
						{format(h.feature, { title: feature.title })}
					</Link>
				) : null}
			</Card>
			<Card className="py-2">
				<section aria-label={t.code.files}>
					<h2 className="px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11">
						{detail.files.length === 1 ? h.file : format(h.files, { count: detail.files.length })}
					</h2>
					{detail.files.map((f) => (
						<ContextMenu key={f.path} items={menu("file", { "copy-path": () => copyText(f.path) })}>
							<Row
								render={(props) => (
									<button
										type="button"
										aria-expanded={f.path === open}
										onClick={() => setFile(f.path === open ? null : f.path)}
										{...props}
										className={cn(props.className, "w-full text-left hover:bg-n-2")}
									/>
								)}
							>
								<span className="mr-auto min-w-0 truncate font-mono text-13">{f.path}</span>
								<FileCounts sha={sha} file={f} />
							</Row>
						</ContextMenu>
					))}
				</section>
			</Card>
			{diff ? (
				<DiffView
					text={diff.text}
					path={diff.path}
					binary={diff.binary}
					truncated={diff.truncated}
					label={format(t.code.diff, { path: diff.path })}
					binaryLabel={t.code.binary}
					truncatedLabel={t.code.truncated}
				/>
			) : null}
			<div className="flex flex-wrap gap-2.5 *:flex-[1_1_220px] [&_button]:w-full">
				{editor && target ? (
					<Button
						onClick={() => {
							setError(null);
							unwrap(commands.editorOpen(editor.id, target, null)).catch(setError);
						}}
					>
						{h.openEditor}
					</Button>
				) : null}
				{target ? (
					<Button aria-pressed={blaming} onClick={() => setBlaming(!blaming)}>
						{h.blame}
					</Button>
				) : null}
				<RightButton
					right="code.write"
					className="border-danger/50 text-danger-text"
					onClick={() => ask(format(h.undoAsk, { short: info.short, summary: info.summary }))}
				>
					{h.undo}
				</RightButton>
			</div>
			<ErrorNotice error={error ?? blame.error} className="text-danger-text" />
			{blaming && blame.data && target ? (
				<Card className="py-2">
					<ol
						aria-label={format(h.blameOf, { path: target })}
						className="max-h-64 overflow-auto px-6 text-13"
					>
						{blame.data.map((b) => (
							<li key={b.line} className="flex gap-3 py-0.5">
								<span className="w-8 shrink-0 text-right font-mono text-n-11">{b.line}</span>
								<span className="min-w-0 flex-1 truncate">{b.author}</span>
								{b.time ? (
									<span className="shrink-0 text-n-11">
										{new Intl.DateTimeFormat(lang, { dateStyle: "medium" }).format(b.time * 1000)}
									</span>
								) : null}
							</li>
						))}
					</ol>
				</Card>
			) : null}
			<LinkButton
				className="self-start"
				aria-expanded={more}
				aria-controls={moreId}
				onClick={() => setMore(!more)}
			>
				{t.ui.more}
			</LinkButton>
			{more ? (
				<div id={moreId} className="flex flex-wrap items-center gap-2">
					<Badge className="font-mono">{info.short}</Badge>
					{info.labels.map((l) => (
						<Badge key={`${l.kind}:${l.name}`} variant={LABEL[l.kind]}>
							{l.name}
						</Badge>
					))}
					<PageExport page="workDone" />
				</div>
			) : null}
		</div>
	);
}

function HistoryView() {
	const { t, lang } = useI18n();
	const h = t.forge.history;
	const menu = useMenus();
	const navigate = useNavigate();
	const log = useLog();
	const { hasNextPage, isFetchingNextPage, fetchNextPage } = log;
	const [show, setShow] = useState<"commits" | "tags">("commits");
	const [query, setQuery] = useState("");
	const [limit, setLimit] = useState(PAGE);
	const all = log.data?.pages.flatMap((p) => p.commits) ?? [];
	const needle = query.trim().toLowerCase();
	// The search and the Tags choice narrow the commits that are loaded. "Older commits" loads more.
	const commits = all.filter(
		(c) =>
			(show === "commits" || c.labels.some((l) => l.kind === "tag")) &&
			(!needle ||
				[c.summary, c.author_name, c.short].some((x) => x.toLowerCase().includes(needle))),
	);
	// The newest commit opens by default, and the choice stays with the tab.
	const [sha, setSha] = useTabSelection(
		"code:history",
		commits.map((c) => c.sha),
	);
	const avatars = useAvatars(commits.map((c) => c.author_email));
	const rows = graph(all);
	const rowOf = new Map(all.map((c, n) => [c.sha, rows[n]]));
	const lanes = Math.max(1, ...rows.map((r) => r.width));
	// The rail of the graph shows for a history with side lines, on the whole list only.
	const rail = lanes > 1 && commits.length === all.length;

	// The selected commit stays in view, even past the limit.
	const shown = commits.filter((c, i) => i < limit || c.sha === sha);
	const more = hasNextPage || shown.length < commits.length;
	const older = () => {
		setLimit(limit + PAGE);
		if (hasNextPage && limit + PAGE >= commits.length) void fetchNextPage();
	};

	const date = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<PageHeader title={t.tabs.code.history} />
			<div className="flex flex-wrap items-center gap-4 px-4 pt-1 pb-5.5">
				<BranchSelector />
				<div className="w-56 shrink-0 [&_button]:flex-[1_1_0]">
					<Segmented
						label={h.show}
						value={show}
						onValueChange={setShow}
						items={[
							{ value: "commits", label: h.commits },
							{ value: "tags", label: h.tags },
						]}
					/>
				</div>
				<Input
					label={h.search}
					type="search"
					className="max-w-105 flex-[1_1_200px]"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
			</div>
			<div className="flex items-start gap-6 px-4 pb-10">
				<SplitPane id="code-history-width" label={t.forge.resize.history} fallback={688} max={1000}>
					<Card className="py-2">
						{shown.map((c) => {
							const row = rowOf.get(c.sha);
							const tags = c.labels.filter((l) => l.kind === "tag");
							return (
								<div key={c.sha} className="flex items-stretch [&+&]:border-t [&+&]:border-n-6">
									<span
										aria-hidden="true"
										data-lane={row?.lane}
										hidden={!rail}
										className="relative shrink-0"
										style={{ width: lanes * STEP + 12 }}
									>
										{row?.through.map((i) => (
											<span
												key={i}
												className={`absolute inset-y-0 w-0.5 opacity-60 ${lane(i)}`}
												style={{ left: i * STEP + 11 }}
											/>
										))}
										<span
											className={`absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full ring-2 ring-surface-2 ${lane(row?.lane ?? 0)}`}
											style={{ left: (row?.lane ?? 0) * STEP + 7 }}
										/>
									</span>
									<ContextMenu
										items={menu("commit", {
											open: () => setSha(c.sha),
											"copy-sha": () => copyText(c.sha),
										})}
									>
										<button
											type="button"
											aria-pressed={c.sha === sha}
											onClick={() => setSha(c.sha)}
											className="flex min-h-17 min-w-0 flex-1 flex-wrap items-center gap-3 px-6 py-2 text-left hover:bg-n-2 aria-pressed:bg-accent-tint"
										>
											<Avatar
												name={c.author_name}
												src={avatars[c.author_email.trim().toLowerCase()]}
											/>
											<span className="flex min-w-0 flex-[1_1_200px] flex-col">
												<span className="truncate font-semibold">{c.summary}</span>
												<span className="truncate text-n-11">
													{format(h.by, {
														author: c.author_name,
														time: date.format(c.time * 1000),
													})}
												</span>
											</span>
											{tags.map((l) => (
												<Badge key={l.name} variant="warning">
													{l.name}
												</Badge>
											))}
											{c.sha === sha ? <Badge variant="accent">{h.shown}</Badge> : null}
										</button>
									</ContextMenu>
								</div>
							);
						})}
						{commits.length === 0 && log.data ? (
							<p className="px-6 py-4 text-n-11">{h.none}</p>
						) : null}
						{more ? (
							<div className="border-t border-n-6 px-6 py-2">
								<LinkButton disabled={isFetchingNextPage} onClick={older}>
									{h.older}
								</LinkButton>
							</div>
						) : null}
					</Card>
				</SplitPane>
				{sha ? (
					<Detail key={sha} sha={sha} />
				) : (
					<div className="min-w-0 flex-1">
						<EmptyState
							title={t.empty.commit}
							action={{
								label: t.ui.place.code,
								onClick: () => void navigate({ to: "/code/now" }),
							}}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

export const History = withProject(HistoryView, "history");
