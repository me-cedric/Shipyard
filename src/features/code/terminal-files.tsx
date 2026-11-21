import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useChanges, useEditors } from "@/lib/code";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { revealPath } from "@/lib/menus";
import { usePrefs } from "@/lib/prefs";
import { useActiveProject } from "@/lib/projects";
import { RightButton } from "@/lib/rights";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { ChevronDownIcon, ChevronRightIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { type FileAction, FileActionDialog } from "./file-actions";
import { fileRows, findFiles } from "./file-drawer";
import { flatRows } from "./tree";

const ROW =
	"flex min-h-control w-full items-center gap-2.5 px-4 text-left hover:bg-n-2 aria-pressed:bg-n-3";
const MAX_FOUND = 200;
const parentOf = (p: string) => p.slice(0, Math.max(p.lastIndexOf("/"), 0));

/**
 * The files of the working copy as a card: a search, the tree with a pill on each changed file, and
 * the actions of the chosen row. The writes use the same dialog as the file drawer.
 */
export function TerminalFiles() {
	const { t } = useI18n();
	const tp = t.forge.terminalPage;
	const active = useActiveProject().data;
	const qc = useQueryClient();
	const { profile } = usePrefs();
	const editor = useEditors().data?.[0];
	const changes = useChanges().data;
	const files = useQuery({
		queryKey: ["code", "files", active?.id],
		queryFn: () => unwrap(commands.codeFileList()),
		enabled: Boolean(active),
	});
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
	const [picked, setChosen] = useState<{ path: string; folder: boolean } | null>(null);
	const [action, setAction] = useState<FileAction | null>(null);
	const [made, setMade] = useState<string[]>([]);
	const [error, setError] = useState<unknown>(null);
	const changed = useMemo(
		() => new Set(changes ? flatRows(changes).map((r) => r.path) : []),
		[changes],
	);
	const paths = useMemo(
		() => [...(files.data ?? []), ...made.map((m) => `${m}/`)],
		[files.data, made],
	);
	const found = query.trim() ? findFiles(paths, query).slice(0, MAX_FOUND) : null;
	const rows = useMemo(() => fileRows(paths, open), [paths, open]);
	const list = found ? found.map((p) => ({ path: p, name: p, depth: 0, folder: false })) : rows;
	const toggle = (path: string) => {
		const next = new Set(open);
		if (!next.delete(path)) next.add(path);
		setOpen(next);
	};
	// With no pick, the first changed file is chosen, so that its actions are ready.
	const first = list.find((r) => !r.folder && changed.has(r.path));
	const chosen = picked ?? (first ? { path: first.path, folder: false } : null);
	const file = chosen && !chosen.folder ? chosen.path : null;
	// New items go inside a chosen folder, beside a chosen file, else at the root.
	const here = chosen ? (chosen.folder ? chosen.path : parentOf(chosen.path)) : "";
	const writes = !profile.readOnly;
	return (
		<Card className="flex h-150 min-w-0 flex-[1_1_260px] flex-col py-2">
			<section aria-label={t.code.files} className="flex min-h-0 flex-1 flex-col">
				<div className="flex items-center gap-2.5 px-4 py-2.5">
					<h2 className="mr-auto text-13 font-semibold text-n-11">{t.code.files}</h2>
					<Input
						label={tp.find}
						placeholder={tp.find}
						type="search"
						className="flex-[1_1_120px]"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
				</div>
				<ul aria-label={t.code.files} className="min-h-0 flex-1 overflow-y-auto">
					{list.map((r) => (
						<li key={r.path}>
							<button
								type="button"
								aria-pressed={chosen?.path === r.path}
								aria-expanded={r.folder ? open.has(r.path) : undefined}
								title={r.path}
								style={{ paddingLeft: 16 + r.depth * 24 + (r.folder ? 0 : 6) }}
								className={ROW}
								onClick={() => {
									setChosen({ path: r.path, folder: r.folder });
									if (r.folder) toggle(r.path);
								}}
							>
								{r.folder ? (
									<>
										<span aria-hidden="true" className="flex text-n-10">
											{open.has(r.path) ? (
												<ChevronDownIcon size={14} />
											) : (
												<ChevronRightIcon size={14} />
											)}
										</span>
										<span className="min-w-0 truncate font-semibold">{r.name}</span>
									</>
								) : (
									<>
										<span className="min-w-0 truncate font-mono">{r.name}</span>
										{changed.has(r.path) ? (
											<Badge variant="accent" className="ml-auto">
												{tp.changed}
											</Badge>
										) : null}
									</>
								)}
							</button>
						</li>
					))}
					{list.length === 0 && files.data ? (
						<li className="px-4 py-2 text-n-11">{t.panels.files.none}</li>
					) : null}
				</ul>
				<ErrorNotice error={error ?? files.error} className="px-4 py-2 text-danger-text" />
				<div className="mt-auto flex flex-wrap gap-2.5 px-4 py-3">
					<Button
						className="flex-[1_1_120px]"
						disabled={!(editor && file)}
						onClick={() => {
							if (!(editor && file)) return;
							setError(null);
							unwrap(commands.editorOpen(editor.id, file, null)).catch(setError);
						}}
					>
						{t.forge.history.openEditor}
					</Button>
					<Button
						className="flex-[1_1_120px]"
						disabled={!chosen}
						onClick={() => chosen && revealPath(chosen.path)}
					>
						{tp.reveal}
					</Button>
					<RightButton
						right="code.write"
						className="flex-[1_1_80px]"
						disabled={!writes}
						onClick={() => setAction({ kind: "file", path: here })}
					>
						{tp.create}
					</RightButton>
					<RightButton
						right="code.write"
						className="flex-[1_1_80px]"
						disabled={!(writes && chosen)}
						onClick={() =>
							chosen && setAction({ kind: "rename", path: chosen.path, folder: chosen.folder })
						}
					>
						{t.personal.files.rename}
					</RightButton>
					<RightButton
						right="code.write"
						className="flex-[1_1_80px] text-danger-text"
						disabled={!(writes && chosen)}
						onClick={() =>
							chosen && setAction({ kind: "delete", path: chosen.path, folder: chosen.folder })
						}
					>
						{t.code.delete}
					</RightButton>
				</div>
			</section>
			{action ? (
				<FileActionDialog
					action={action}
					onClose={() => setAction(null)}
					onDone={(a, path) => {
						if (a.kind === "folder") setMade((m) => [...m, path]);
						if (a.kind === "folder" || a.kind === "file")
							setOpen((o) => new Set([...o, a.path].filter(Boolean)));
						setChosen(null);
						setAction(null);
						void qc.invalidateQueries({ queryKey: ["code"] });
					}}
				/>
			) : null}
		</Card>
	);
}
