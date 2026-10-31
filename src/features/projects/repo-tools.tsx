import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type FileDiff, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { ArrowPathIcon } from "@/ui/icons";
import { DiffView } from "@/ui/molecules/diff-view";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Panel } from "@/ui/molecules/panel";

/**
 * Settings / Project: the saved changes (stashes) with their diff and a restore, and the local
 * branches that lag behind their upstream with a fast-forward. Each write needs a click.
 */
export function RepoTools() {
	const { t } = useI18n();
	const g = t.extras.git;
	const qc = useQueryClient();
	const stashes = useQuery({
		queryKey: ["code", "stashes"],
		queryFn: () => unwrap(commands.codeStashList()),
	}).data;
	const behind = (
		useQuery({
			queryKey: ["code", "branches"],
			queryFn: () => unwrap(commands.codeBranches()),
		}).data ?? []
	).filter((b) => b.kind === "local" && b.behind > 0);
	const [shown, setShown] = useState<{ id: string; files: FileDiff[] } | null>(null);
	const [note, setNote] = useState<string | null>(null);
	const [error, setError] = useState<unknown>(null);
	const attempt = async (job: () => Promise<void>) => {
		setError(null);
		setNote(null);
		try {
			await job();
		} catch (e) {
			setError(e);
		}
	};
	if (!stashes?.length && !behind.length && !note && !error) return null;
	return (
		<Panel title={g.title} flush>
			{stashes?.length ? (
				<section aria-label={g.stashes} className="flex flex-col">
					<h3 className="px-3 pt-2 text-12 font-medium text-n-11">{g.stashes}</h3>
					{stashes.map((s) => (
						<div key={s.id} className="flex flex-col gap-1 border-b px-3 py-1 last:border-b-0">
							<div className="flex min-h-8 items-center gap-2">
								<span className="min-w-0 flex-1 truncate text-ui">{s.message}</span>
								<Button
									variant="ghost"
									onClick={() =>
										void attempt(async () =>
											setShown({ id: s.id, files: await unwrap(commands.gitStashDiff(s.id)) }),
										)
									}
								>
									{format(g.show, { name: s.message })}
								</Button>
								<Button
									onClick={() =>
										void attempt(async () => {
											await unwrap(commands.gitStashPop(s.id, true));
											setShown(null);
											await qc.invalidateQueries({ queryKey: ["code"] });
										})
									}
								>
									{format(g.pop, { name: s.message })}
								</Button>
							</div>
							{shown?.id === s.id
								? shown.files.map((f) => (
										<DiffView
											key={f.path}
											text={f.text}
											binary={f.binary}
											truncated={f.truncated}
											label={format(t.assistant.diff, { name: f.path })}
											binaryLabel={t.assistant.diffBinary}
											truncatedLabel={t.assistant.diffTruncated}
										/>
									))
								: null}
						</div>
					))}
				</section>
			) : null}
			{behind.length ? (
				<section aria-label={g.branches} className="flex flex-col">
					<h3 className="px-3 pt-2 text-12 font-medium text-n-11">{g.branches}</h3>
					{behind.map((b) => (
						<div
							key={b.name}
							className="flex min-h-9 items-center gap-2 border-b px-3 last:border-b-0"
						>
							<span className="min-w-0 flex-1 truncate font-mono text-12">{b.name}</span>
							<span className="text-12 text-n-11">{format(g.behind, { count: b.behind })}</span>
							<Button
								onClick={() =>
									void attempt(async () => {
										const r = await unwrap(commands.gitBranchFastForward(b.name, true));
										setNote(format(r === "moved" ? g.moved : g.upToDate, { name: b.name }));
										await qc.invalidateQueries({ queryKey: ["code"] });
									})
								}
							>
								<ArrowPathIcon size={14} />
								{format(g.forward, { name: b.name })}
							</Button>
						</div>
					))}
				</section>
			) : null}
			{note ? (
				<p role="status" className="px-3 py-2 text-ui text-success-text">
					{note}
				</p>
			) : null}
			{error ? <ErrorNotice error={error} className="px-3 py-2 text-ui text-danger-text" /> : null}
		</Panel>
	);
}
