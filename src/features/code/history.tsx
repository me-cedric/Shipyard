import { useEffect, useRef, useState } from "react";
import { useCommitDetail, useCommitDiff, useLog } from "@/lib/code";
import { graph } from "@/lib/code/graph";
import { format, useI18n } from "@/lib/i18n";
import { copyText, useMenus } from "@/lib/menus";
import { Button } from "@/ui/atoms/button";
import { ClockIcon } from "@/ui/icons";
import { CommitRow } from "@/ui/molecules/commit-row";
import { DiffView } from "@/ui/molecules/diff-view";
import { FileRow } from "@/ui/molecules/file-row";
import { PageHeader } from "@/ui/molecules/page-header";
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
		<div>
			<div className="border-b px-4 py-3">
				<h2 className="text-16 font-semibold text-n-12">{info.summary}</h2>
				{info.description ? (
					<p className="py-1 text-ui whitespace-pre-wrap">{info.description}</p>
				) : null}
				<p className="text-12 text-n-11">
					<span className="font-mono">{info.short}</span> · {info.author_name} ·{" "}
					{new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(
						info.time * 1000,
					)}
				</p>
			</div>
			<section aria-label={t.code.files}>
				<h3 className="px-3 py-1 text-12 font-medium text-n-11">
					{format(t.count, { name: t.code.files, count: detail.files.length })}
				</h3>
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
			</section>
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
	const log = useLog();
	const [sha, setSha] = useState<string | null>(null);
	const end = useRef<HTMLDivElement>(null);
	const { hasNextPage, isFetchingNextPage, fetchNextPage } = log;
	const commits = log.data?.pages.flatMap((p) => p.commits) ?? [];
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
					{sha ? <Detail sha={sha} /> : null}
				</div>
			</div>
		</div>
	);
}

export const History = withProject(HistoryView);
