import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ENDED, useRuns } from "@/lib/factory";
import { useNeedsYou } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import type { ProjectCard } from "@/lib/ipc";
import { useActiveProject, useProjectActions, useProjectCards } from "@/lib/projects";
import { useFormIntent } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { FolderOpenIcon, PlusIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { PageHeader } from "@/ui/molecules/page-header";
import { CloneDialog } from "./clone-dialog";
import { StartError, useProjectStart } from "./first-run";
import { CardDetails } from "./project-details";

/** What the open project holds now, as sentences: the things that need the person and the agents at work. */
function OpenFacts() {
	const { t } = useI18n();
	const w = t.workspace.page;
	const needs = useNeedsYou().items.length;
	const agents = (useRuns().data ?? []).filter((r) => !ENDED.includes(r.state)).length;
	return (
		<>
			<Badge variant={needs ? "you" : "neutral"}>
				{needs === 0 ? w.needsNone : needs === 1 ? w.needsOne : format(w.needYou, { count: needs })}
			</Badge>
			<Badge variant={agents ? "info" : "neutral"}>
				{agents === 0
					? w.agentsNone
					: agents === 1
						? w.agentOne
						: format(w.agents, { count: agents })}
			</Badge>
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
	const { t } = useI18n();
	const w = t.workspace.page;
	const { remove, close } = useProjectActions();
	const [details, setDetails] = useState(false);
	// The open project sits under the page title; the others sit under "Opened before" (axe heading-order).
	const Name = open ? "h2" : "h3";
	const wide = "min-h-control flex-[1_1_100px]";
	return (
		<li
			aria-label={p.name}
			aria-current={open ? "true" : undefined}
			className="flex min-w-0 flex-col gap-3 rounded-lg bg-surface-2 p-4.5 shadow-2 aria-[current=true]:bg-accent-tint aria-[current=true]:outline-2 aria-[current=true]:outline-accent"
		>
			<div className="flex items-start justify-between">
				<span
					aria-hidden="true"
					className={cn("size-12 rounded-field", open ? "bg-accent" : "bg-n-8")}
				/>
				{/* The folder, the code host, the branch and the last commit stay behind this one control. */}
				<IconButton
					label={`${w.details} ${p.name}`}
					aria-expanded={details}
					onClick={() => setDetails(!details)}
				>
					<svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
						<circle cx="3" cy="8" r="1.25" />
						<circle cx="8" cy="8" r="1.25" />
						<circle cx="13" cy="8" r="1.25" />
					</svg>
				</IconButton>
			</div>
			<Name className="truncate text-20 font-semibold text-n-12">{p.name}</Name>
			{open ? (
				<div className="flex flex-wrap items-center gap-1.5">
					<OpenFacts />
				</div>
			) : null}
			{details ? <CardDetails p={p} onError={onError} /> : null}
			<div className="flex flex-wrap gap-2.5">
				<Button
					variant={open ? "primary" : undefined}
					className={wide}
					aria-label={format(w.openName, { name: p.name })}
					onClick={onOpen}
				>
					{w.open}
				</Button>
				{open ? (
					<Button className={wide} aria-label={t.projects.close} onClick={() => void close()}>
						{t.common.close}
					</Button>
				) : (
					<Button
						className={wide}
						aria-label={`${w.removeList}: ${p.name}`}
						onClick={() => void remove(p)}
					>
						{w.removeList}
					</Button>
				)}
			</div>
		</li>
	);
}

/**
 * Projects (`spec:app-redesign#REQ-003`), behind the project name: the open project with what needs
 * the person and its agents at work, the projects opened before, and the ways to start one (open a
 * folder, clone, new project, drop a folder). Import projects opens its one place, This project.
 * New project is a page of its own (`/projects/new`).
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
	const create = () => router.history.push("/projects/new");
	// The guided start opens the creator.
	useFormIntent("project", create);
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
	const grid = "grid grid-cols-[repeat(auto-fill,minmax(min(360px,100%),1fr))] gap-3.5";
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 pb-4 [&>[data-page-header]]:-mb-4">
			<PageHeader
				icon={<FolderOpenIcon size={16} />}
				title={title}
				action={
					<span className="flex flex-wrap gap-4">
						{active ? (
							<Button
								className="min-h-control"
								onClick={() => router.history.push("/setup/project#section-import")}
							>
								{w.importProjects}
							</Button>
						) : null}
						<Button
							className="min-h-control"
							disabled={start.busy}
							onClick={() => void start.run(openFolder)}
						>
							{w.openFolder}
						</Button>
						<Button className="min-h-control" onClick={() => setCloning(true)}>
							{w.cloneHost}
						</Button>
						<Button variant="primary" className="min-h-control" onClick={create}>
							<PlusIcon size={14} />
							{t.creator.title}
						</Button>
					</span>
				}
			/>
			<CloneDialog open={cloning} onClose={() => setCloning(false)} />
			<div className="flex flex-col gap-4 px-4">
				<StartError start={start} />
				{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
				{open ? (
					<ul aria-label={w.openNow} className={grid}>
						{card(open)}
					</ul>
				) : null}
				{before.length ? (
					<section aria-labelledby="projects-before" className="flex flex-col gap-6.5">
						<h2 id="projects-before" className="text-17 font-semibold text-n-12">
							{w.before}
						</h2>
						<ul aria-labelledby="projects-before" className={grid}>
							{before.map(card)}
						</ul>
					</section>
				) : null}
				{cards.length === 0 ? <p className="text-14 text-n-11">{t.empty.projects}</p> : null}
				{/* The shell opens a folder that the person drops on the window (`useDropFolder`). */}
				<p className="flex min-h-30 items-center justify-center rounded-lg border-2 border-dashed border-n-9 text-17 font-semibold text-n-11">
					{w.drop}
				</p>
			</div>
		</div>
	);
}
