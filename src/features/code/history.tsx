import { useEffect, useRef, useState } from "react";
import { useCommitDetail, useCommitDiff, useLog } from "@/lib/code";
import { graph } from "@/lib/code/graph";
import { format, useI18n } from "@/lib/i18n";
import { copyText, useMenus } from "@/lib/menus";
import { Button } from "@/ui/atoms/button";
import { CommitRow } from "@/ui/molecules/commit-row";
import { DiffView } from "@/ui/molecules/diff-view";
import { FileRow } from "@/ui/molecules/file-row";
import { withProject } from "./project-gate";

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
			<div className="border-b px-3 py-2">
				<h2 className="text-14 font-medium">{info.summary}</h2>
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
		<div className="flex h-full">
			<h1 className="sr-only">{t.tabs.code.history}</h1>
			<div className="w-[32rem] shrink-0 overflow-y-auto border-r">
				{commits.map((c, n) => (
					<div key={c.sha} className="flex items-stretch">
						<span
							aria-hidden="true"
							data-lane={rows[n]?.lane}
							className="relative shrink-0"
							style={{ width: lanes * 12 + 8 }}
						>
							{rows[n]?.through.map((i) => (
								<span
									key={i}
									className="absolute inset-y-0 w-px bg-n-7"
									style={{ left: i * 12 + 10 }}
								/>
							))}
							<span
								className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-accent"
								style={{ left: (rows[n]?.lane ?? 0) * 12 + 7 }}
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
			<div className="min-w-0 flex-1 overflow-auto">{sha ? <Detail sha={sha} /> : null}</div>
		</div>
	);
}

export const History = withProject(HistoryView);
