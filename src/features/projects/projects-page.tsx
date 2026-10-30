import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands, type ProjectCard, unwrap } from "@/lib/ipc";
import { useProjectActions, useProjectCards } from "@/lib/projects";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { FolderOpenIcon, LinkIcon, TrashIcon } from "@/ui/icons";
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
		<Card className="flex flex-col gap-2 p-3">
			<div className="flex items-center gap-2">
				<span className="truncate text-14 font-medium text-n-12">{p.name}</span>
				{p.branch ? <Badge className="font-mono">{p.branch}</Badge> : null}
			</div>
			<p className="truncate text-ui text-n-11">
				{p.lastCommit
					? `${p.lastCommit}${p.lastCommitTime ? ` · ${when(p.lastCommitTime, lang)}` : ""}`
					: w.noCommit}
			</p>
			<div className="flex flex-wrap items-center gap-1">
				{p.ahead > 0 ? <Badge>{format(w.ahead, { count: p.ahead })}</Badge> : null}
				{p.behind > 0 ? <Badge>{format(w.behind, { count: p.behind })}</Badge> : null}
				{p.changes > 0 ? <Badge>{format(w.changes, { count: p.changes })}</Badge> : null}
			</div>
			<div className="flex flex-wrap items-center gap-1">
				<Button
					variant="primary"
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
				{p.webUrl ? (
					<Button
						variant="ghost"
						aria-label={`${w.openRemote} ${p.name}`}
						onClick={() =>
							void unwrap(commands.projectOpenRemote(p.id)).catch((e: unknown) =>
								onError(String(e)),
							)
						}
					>
						<LinkIcon size={14} />
						{w.openRemote}
					</Button>
				) : null}
				<Button variant="ghost" aria-label={`${w.remove} ${p.name}`} onClick={() => void remove(p)}>
					<TrashIcon size={14} />
					{w.remove}
				</Button>
			</div>
			{open ? (
				<dl className="grid grid-cols-[auto_1fr] gap-x-3 text-12 text-n-11">
					<dt>{w.folder}</dt>
					<dd className="truncate font-mono">{p.path}</dd>
					{p.webUrl ? (
						<>
							<dt>{w.remote}</dt>
							<dd className="truncate font-mono">{p.webUrl}</dd>
						</>
					) : null}
				</dl>
			) : null}
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
							<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
