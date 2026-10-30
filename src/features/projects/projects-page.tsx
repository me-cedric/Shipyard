import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type ProjectCard, unwrap } from "@/lib/ipc";
import { useProjectActions, useProjectCards } from "@/lib/projects";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { ClockIcon, FolderOpenIcon, LinkIcon, TrashIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { EmptyState } from "@/ui/molecules/empty-state";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";

const when = (seconds: number, lang: string) =>
	new Date(seconds * 1000).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB");

function ProjectCardView({ p, onError }: { p: ProjectCard; onError: (e: string) => void }) {
	const { t, lang } = useI18n();
	const w = t.workspace.page;
	const { switchTo, remove } = useProjectActions();
	const [open, setOpen] = useState(false);
	return (
		<Card className="flex flex-col overflow-hidden">
			<div className="flex items-start gap-3 p-3">
				<span
					aria-hidden="true"
					className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-gradient font-mono text-16 text-accent-fg shadow-glow"
				>
					{p.name.slice(0, 1).toUpperCase()}
				</span>
				<span className="flex min-w-0 flex-1 flex-col gap-0.5">
					<span className="flex items-center gap-2">
						<span className="truncate text-14 font-medium text-n-12">{p.name}</span>
						{p.branch ? <Badge className="font-mono">{p.branch}</Badge> : null}
					</span>
					<span className="truncate font-mono text-11 text-n-10">{p.path}</span>
				</span>
			</div>
			<p className="flex items-center gap-1.5 truncate px-3 text-ui text-n-11">
				<ClockIcon size={12} />
				<span className="truncate">
					{p.lastCommit
						? `${p.lastCommit}${p.lastCommitTime ? ` · ${when(p.lastCommitTime, lang)}` : ""}`
						: w.noCommit}
				</span>
			</p>
			<div className="flex min-h-7 flex-wrap items-center gap-1 px-3 pt-2">
				{p.ahead > 0 ? <Badge variant="info">{format(w.ahead, { count: p.ahead })}</Badge> : null}
				{p.behind > 0 ? (
					<Badge variant="warning">{format(w.behind, { count: p.behind })}</Badge>
				) : null}
				{p.changes > 0 ? (
					<Badge variant="accent">{format(w.changes, { count: p.changes })}</Badge>
				) : null}
			</div>
			{open ? (
				<dl className="mx-3 mt-2 grid grid-cols-[auto_1fr] gap-x-3 rounded-md bg-n-2 px-2 py-1.5 text-12 text-n-11">
					<dt>{w.remote}</dt>
					<dd className="truncate font-mono">{p.webUrl ?? "—"}</dd>
				</dl>
			) : null}
			<div className="mt-3 flex items-center gap-1 border-t bg-surface-1 px-2 py-1.5">
				<Button
					aria-label={format(w.openName, { name: p.name })}
					onClick={() => void switchTo(p.id).catch((e: unknown) => onError(String(e)))}
				>
					<FolderOpenIcon size={14} />
					{w.open}
				</Button>
				<Button
					variant="ghost"
					aria-expanded={open}
					aria-label={`${open ? w.hideDetails : w.details} ${p.name}`}
					onClick={() => setOpen(!open)}
				>
					{open ? w.hideDetails : w.details}
				</Button>
				<span className="flex-1" />
				{p.webUrl ? (
					<IconButton
						label={`${w.openRemote} ${p.name}`}
						onClick={() =>
							void unwrap(commands.projectOpenRemote(p.id)).catch((e: unknown) =>
								onError(String(e)),
							)
						}
					>
						<LinkIcon size={14} />
					</IconButton>
				) : null}
				<IconButton label={`${w.remove} ${p.name}`} onClick={() => void remove(p)}>
					<TrashIcon size={14} />
				</IconButton>
			</div>
		</Card>
	);
}

/** Home / Projects: one card for each project, grouped by the host of its remote. Legacy source: `pages/Home.tsx` `ProjectCard`. */
export function ProjectsPage() {
	const { t } = useI18n();
	const cards = useProjectCards().data;
	const { openFolder } = useProjectActions();
	const [error, setError] = useState<string | null>(null);
	if (!cards) return null;
	const groups = new Map<string, ProjectCard[]>();
	for (const c of cards) groups.set(c.host ?? "", [...(groups.get(c.host ?? "") ?? []), c]);
	const open = {
		label: t.projects.open,
		icon: <FolderOpenIcon size={14} />,
		onClick: () => void openFolder().catch((e: unknown) => setError(String(e))),
	};
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
			<PageHeader
				icon={<FolderOpenIcon size={16} />}
				title={t.tabs.home.projects}
				count={cards.length}
				action={
					<Button variant="primary" onClick={open.onClick}>
						{open.icon}
						{open.label}
					</Button>
				}
			/>
			{error ? (
				<p role="alert" className="px-4 text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{cards.length === 0 ? (
				<EmptyState layout="cards" action={open} />
			) : (
				<div className="flex flex-col gap-4 px-4">
					{[...groups].map(([host, list]) => (
						<Panel key={host} title={host || t.workspace.page.local} count={list.length}>
							<div className="grid gap-3 p-1 md:grid-cols-2 xl:grid-cols-3">
								{list.map((p) => (
									<ProjectCardView key={p.id} p={p} onError={setError} />
								))}
							</div>
						</Panel>
					))}
				</div>
			)}
		</div>
	);
}
