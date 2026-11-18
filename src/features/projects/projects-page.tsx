import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ENDED, useRuns } from "@/lib/factory";
import { useNeedsYou } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import { commands, type ProjectCard, unwrap } from "@/lib/ipc";
import { useActiveProject, useProjectActions, useProjectCards } from "@/lib/projects";
import { useFormIntent } from "@/lib/shell";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { ArrowDownTrayIcon, FolderOpenIcon, LinkIcon, PlusIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { PageHeader } from "@/ui/molecules/page-header";
import { CloneDialog } from "./clone-dialog";
import { StartError, useProjectStart } from "./first-run";
import { NewProjectDialog } from "./new-project/new-project-dialog";

const when = (seconds: number, lang: string) =>
	new Date(seconds * 1000).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB");

/** What the open project holds now: the things that need the person and the agents at work. */
function OpenFacts() {
	const { t } = useI18n();
	const w = t.workspace.page;
	const needs = useNeedsYou().items.length;
	const agents = (useRuns().data ?? []).filter((r) => !ENDED.includes(r.state)).length;
	return (
		<>
			<Badge>{format(w.needYou, { count: needs })}</Badge>
			<Badge variant="info">{format(w.agents, { count: agents })}</Badge>
			<Badge variant="success">{w.openNow}</Badge>
		</>
	);
}

function ProjectCardView({
	p,
	open,
	onOpen,
	onError,
}: {
	p: ProjectCard;
	/** This is the open project. */
	open: boolean;
	onOpen: () => void;
	onError: (e: unknown) => void;
}) {
	const { t, lang } = useI18n();
	const w = t.workspace.page;
	const { remove, close } = useProjectActions();
	const [details, setDetails] = useState(false);
	// The open project sits under the page title; the others sit under "Opened before" (axe heading-order).
	const Name = open ? "h2" : "h3";
	return (
		<li
			aria-label={p.name}
			aria-current={open ? "true" : undefined}
			className="flex flex-col gap-3 rounded-xl border-2 border-transparent bg-surface-2 p-4 shadow-1 aria-[current=true]:border-accent"
		>
			<span
				aria-hidden="true"
				className="flex size-12 items-center justify-center rounded-lg bg-accent-subtle text-20 font-semibold text-accent-text"
			>
				{p.name.slice(0, 1).toUpperCase()}
			</span>
			<Name title={p.path} className="truncate text-16 font-semibold text-n-12">
				{p.name}
			</Name>
			<div className="flex flex-wrap items-center gap-1">
				{open ? <OpenFacts /> : null}
				{/* The code host of the remote, as the groups of the page of before showed it. */}
				<Badge>{p.host ?? w.local}</Badge>
				{p.branch ? <Badge className="font-mono">{p.branch}</Badge> : null}
				{p.ahead > 0 ? <Badge variant="info">{format(w.ahead, { count: p.ahead })}</Badge> : null}
				{p.behind > 0 ? (
					<Badge variant="warning">{format(w.behind, { count: p.behind })}</Badge>
				) : null}
				{p.changes > 0 ? (
					<Badge variant="accent">{format(w.changes, { count: p.changes })}</Badge>
				) : null}
			</div>
			<p className="truncate text-14 text-n-11">
				{p.lastCommit
					? `${p.lastCommit}${p.lastCommitTime ? ` · ${when(p.lastCommitTime, lang)}` : ""}`
					: w.noCommit}
			</p>
			{details ? (
				<dl className="grid grid-cols-[auto_1fr] gap-x-3 text-14 text-n-11">
					<dt>{w.folder}</dt>
					<dd className="truncate font-mono">{p.path}</dd>
					<dt>{w.remote}</dt>
					<dd className="truncate font-mono">{p.webUrl ?? p.host ?? w.local}</dd>
				</dl>
			) : null}
			<div className="flex flex-wrap gap-2">
				<Button
					variant={open ? "primary" : undefined}
					className="min-h-control flex-1"
					aria-label={format(w.openName, { name: p.name })}
					onClick={onOpen}
				>
					{w.open}
				</Button>
				{open ? (
					<Button className="min-h-control flex-1" onClick={() => void close()}>
						{t.projects.close}
					</Button>
				) : null}
				<Button
					className="min-h-control flex-1"
					aria-label={`${t.projects.remove}: ${p.name}`}
					onClick={() => void remove(p)}
				>
					{t.projects.remove}
				</Button>
			</div>
			<div className="flex flex-wrap gap-2">
				<Button
					variant="ghost"
					className="min-h-control"
					aria-expanded={details}
					aria-label={`${details ? w.hideDetails : w.details} ${p.name}`}
					onClick={() => setDetails(!details)}
				>
					{details ? w.hideDetails : w.details}
				</Button>
				{p.webUrl ? (
					<Button
						variant="ghost"
						className="min-h-control"
						aria-label={`${w.openRemote} ${p.name}`}
						onClick={() =>
							void unwrap(commands.projectOpenRemote(p.id)).catch((e: unknown) => onError(e))
						}
					>
						<LinkIcon size={14} />
						{w.openRemote}
					</Button>
				) : null}
			</div>
		</li>
	);
}

/**
 * Projects (`spec:app-redesign#REQ-003`), behind the project name: the open project with what needs
 * the person and its agents at work, the projects opened before, and the ways to start one (open a
 * folder, clone, new project, drop a folder). Import a project opens its one place, This project.
 */
export function ProjectsPage() {
	const { t } = useI18n();
	const w = t.workspace.page;
	const cards = useProjectCards().data;
	const active = useActiveProject().data;
	const router = useRouter();
	const { openFolder, switchTo } = useProjectActions();
	const start = useProjectStart();
	const [error, setError] = useState<unknown>(null);
	const [cloning, setCloning] = useState(false);
	const [creating, setCreating] = useState(false);
	// The guided start opens the creator.
	useFormIntent("project", () => setCreating(true));
	const title = t.tabs.home.projects;
	// The heading shows while the cards load: a page always has its level-one heading.
	if (!cards) return <PageHeader icon={<FolderOpenIcon size={16} />} title={title} />;
	const open = cards.find((c) => c.id === active?.id);
	const before = cards.filter((c) => c !== open);
	// The open project opens on the page before Projects. Projects as the first page has none:
	// the last view opens, and it is never Projects itself.
	const back = () =>
		router.history.canGoBack()
			? router.history.back()
			: router.history.push(
					active?.lastView && active.lastView !== "/projects" ? active.lastView : "/",
				);
	const card = (p: ProjectCard) => (
		<ProjectCardView
			key={p.id}
			p={p}
			open={p === open}
			onError={setError}
			onOpen={() =>
				// Another project becomes the open project.
				p === open ? back() : void switchTo(p.id).catch((e: unknown) => setError(e))
			}
		/>
	);
	const grid = "grid gap-4 md:grid-cols-2 xl:grid-cols-3";
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
			<PageHeader
				icon={<FolderOpenIcon size={16} />}
				title={title}
				count={cards.length}
				action={
					<span className="flex flex-wrap gap-2">
						{active ? (
							<Button
								className="min-h-control"
								onClick={() => router.history.push("/setup/project#section-import")}
							>
								{t.projects.projectImport.import}
							</Button>
						) : null}
						<Button
							className="min-h-control"
							disabled={start.busy}
							onClick={() => void start.run(openFolder)}
						>
							<FolderOpenIcon size={14} />
							{t.projects.open}
						</Button>
						<Button className="min-h-control" onClick={() => setCloning(true)}>
							<ArrowDownTrayIcon size={14} />
							{t.projects.clone}
						</Button>
						<Button variant="primary" className="min-h-control" onClick={() => setCreating(true)}>
							<PlusIcon size={14} />
							{t.creator.title}
						</Button>
					</span>
				}
			/>
			<CloneDialog open={cloning} onClose={() => setCloning(false)} />
			<NewProjectDialog open={creating} onClose={() => setCreating(false)} />
			<div className="flex flex-col gap-4 px-4">
				<StartError start={start} />
				{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
				{open ? (
					<ul aria-label={w.openNow} className={grid}>
						{card(open)}
					</ul>
				) : null}
				{before.length ? (
					<section aria-labelledby="projects-before" className="flex flex-col gap-2">
						<h2 id="projects-before" className="text-16 font-semibold text-n-12">
							{w.before}
						</h2>
						<ul aria-labelledby="projects-before" className={grid}>
							{before.map(card)}
						</ul>
					</section>
				) : null}
				{cards.length === 0 ? <p className="text-14 text-n-11">{t.empty.projects}</p> : null}
				{/* The shell opens a folder that the person drops on the window (`useDropFolder`). */}
				<p className="flex min-h-24 items-center justify-center rounded-xl border-2 border-dashed border-n-7 text-14 text-n-11">
					{w.drop}
				</p>
			</div>
		</div>
	);
}
