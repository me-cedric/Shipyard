import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useCommitDetail, useCommitDiff, useLog } from "@/lib/code";
import { graph } from "@/lib/code/graph";
import { format, useI18n } from "@/lib/i18n";
import { copyText, useMenus } from "@/lib/menus";
import { useTabSelection } from "@/lib/shell/selection";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { ClockIcon, DocumentTextIcon } from "@/ui/icons";
import { CommitRow } from "@/ui/molecules/commit-row";
import { DiffView } from "@/ui/molecules/diff-view";
import { EmptyState } from "@/ui/molecules/empty-state";
import { FileRow } from "@/ui/molecules/file-row";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";
import { withProject } from "./project-gate";

/** One colour per lane of the graph, in turn. */
const LANE = ["bg-accent", "bg-success", "bg-warning", "bg-info", "bg-danger"];
const lane = (i: number) => LANE[i % LANE.length];
const STEP = 14;

/** One commit: its info, its changed files and the diff of one file at a time (REQ-010). */
function Detail({ sha }: { sha: string }) {
	const { t, lang } = useI18n();
	const menu = useMenus();
	const detail = useCommitDetail(sha).data;
	const [file, setFile] = useState<string | null>(null);
	const current =
		file && detail?.files.some((f) => f.path === file) ? file : detail?.files[0]?.path;
	const diff = useCommitDiff(detail ? sha : null, current ?? null).data;
	if (!detail) return null;
	const { info } = detail;
	return (
		<div className="flex flex-col gap-3 p-3">
			<div className="flex flex-col gap-2 rounded-lg border bg-surface-2 p-3 shadow-1">
				<h2 className="text-16 font-semibold text-n-12">{info.summary}</h2>
				{info.description ? (
					<p className="text-ui whitespace-pre-wrap text-n-12">{info.description}</p>
				) : null}
				<p className="flex flex-wrap items-center gap-2 text-12 text-n-11">
					<Avatar name={info.author_name} className="size-5" />
					{info.author_name}
					<Badge className="font-mono">{info.short}</Badge>
					<span className="flex items-center gap-1">
						<ClockIcon size={12} />
						{new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(
							info.time * 1000,
						)}
					</span>
				</p>
			</div>
			<Panel
				title={t.code.files}
				count={detail.files.length}
				icon={<DocumentTextIcon size={14} />}
				flush
			>
				{detail.files.map((f) => (
					<FileRow
						key={f.path}
						name={f.path}
						state={f.state}
						stateLabel={t.code.state[f.state]}
						selected={f.path === current}
						onSelect={() => setFile(f.path)}
						menu={menu("file", { "copy-path": () => copyText(f.path) })}
					/>
				))}
			</Panel>
			{diff ? (
				<DiffView
					text={diff.text}
					binary={diff.binary}
					truncated={diff.truncated}
					label={format(t.code.diff, { path: diff.path })}
					binaryLabel={t.code.binary}
					truncatedLabel={t.code.truncated}
				/>
			) : null}
		</div>
	);
}

function HistoryView() {
	const { t, lang } = useI18n();
	const menu = useMenus();
	const navigate = useNavigate();
	const log = useLog();
	const end = useRef<HTMLDivElement>(null);
	const { hasNextPage, isFetchingNextPage, fetchNextPage } = log;
	const commits = log.data?.pages.flatMap((p) => p.commits) ?? [];
	// The newest commit opens by default, and the choice stays with the tab.
	const [sha, setSha] = useTabSelection(
		"code:history",
		commits.map((c) => c.sha),
	);
	const rows = graph(commits);
	const lanes = Math.max(1, ...rows.map((r) => r.width));

	// Older commits load when the end of the list scrolls into view. The button does the same by keyboard.
	useEffect(() => {
		const node = end.current;
		if (!(node && hasNextPage) || typeof IntersectionObserver === "undefined") return;
		const watch = new IntersectionObserver(([hit]) => {
			if (hit?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
		});
		watch.observe(node);
		return () => watch.disconnect();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	const date = new Intl.DateTimeFormat(lang, { dateStyle: "medium" });
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PageHeader
				icon={<ClockIcon size={16} />}
				title={t.tabs.code.history}
				count={commits.length}
			/>
			<div className="flex min-h-0 flex-1 gap-3 px-4 pt-1 pb-4">
				<div className="w-[34rem] shrink-0 overflow-y-auto rounded-lg border bg-surface-1 py-1 shadow-1">
					{commits.map((c, n) => (
						<div key={c.sha} className="flex items-stretch">
							<span
								aria-hidden="true"
								data-lane={rows[n]?.lane}
								className="relative shrink-0"
								style={{ width: lanes * STEP + 12 }}
							>
								{rows[n]?.through.map((i) => (
									<span
										key={i}
										className={`absolute inset-y-0 w-0.5 opacity-60 ${lane(i)}`}
										style={{ left: i * STEP + 11 }}
									/>
								))}
								<span
									className={`absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full ring-2 ring-surface-1 ${lane(rows[n]?.lane ?? 0)}`}
									style={{ left: (rows[n]?.lane ?? 0) * STEP + 7 }}
								/>
							</span>
							<div className="min-w-0 flex-1">
								<CommitRow
									short={c.short}
									summary={c.summary}
									author={c.author_name}
									date={date.format(c.time * 1000)}
									labels={c.labels}
									selected={c.sha === sha}
									onSelect={() => setSha(c.sha)}
									menu={menu("commit", {
										open: () => setSha(c.sha),
										"copy-sha": () => copyText(c.sha),
									})}
								/>
							</div>
						</div>
					))}
					{hasNextPage ? (
						<div ref={end} className="p-2">
							<Button
								variant="ghost"
								disabled={isFetchingNextPage}
								onClick={() => void fetchNextPage()}
							>
								{t.code.older}
							</Button>
						</div>
					) : null}
				</div>
				<div className="min-w-0 flex-1 overflow-auto rounded-lg border bg-surface-1 shadow-1">
					{sha ? (
						<Detail sha={sha} />
					) : (
						<EmptyState
							action={{
								label: t.tabs.code.changes,
								onClick: () => void navigate({ to: "/code/changes" }),
							}}
						/>
					)}
				</div>
			</div>
		</div>
	);
}

export const History = withProject(HistoryView);
