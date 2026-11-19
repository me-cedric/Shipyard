import { Menu } from "@base-ui/react/menu";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { CloneDialog } from "@/features/projects/clone-dialog";
import { useI18n } from "@/lib/i18n";
import { outcomeError, useActiveProject, useProjectActions, useProjects } from "@/lib/projects";
import { Button } from "@/ui/atoms/button";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { MenuList } from "@/ui/molecules/menu-button";
import { MARK, useBare } from "./bare";

/**
 * The page of every place that needs a project and has none: one compact centred card, without the
 * shell. New project opens the creator. Open a project opens a menu: the recent projects, the
 * project list, a local folder and a clone, the same ways as the Projects page. A folder that the
 * person drops on the window opens too. The place gives `title` and `icon` to its loading pattern;
 * this page has its own title.
 */
export function NoProject(_: { title: string; icon: ReactNode }) {
	useBare();
	const { t } = useI18n();
	const { openFolder, switchTo } = useProjectActions();
	const recent = [...(useProjects().data ?? [])]
		.sort((a, b) => b.lastUsed - a.lastUsed)
		.slice(0, 5);
	const navigate = useNavigate();
	const [error, setError] = useState<unknown>(null);
	const [cloning, setCloning] = useState(false);
	const fail = (e: unknown) => setError(e);
	const items = [
		...recent.map((p) => ({
			id: p.id,
			label: p.name,
			onSelect: () => void switchTo(p.id).catch(fail),
		})),
		{ id: "all", label: t.tabs.home.projects, onSelect: () => void navigate({ to: "/projects" }) },
		{
			id: "folder",
			label: t.projects.open,
			onSelect: () =>
				void openFolder()
					.then((o) => setError(o && outcomeError(t, o)))
					.catch(fail),
		},
		{ id: "clone", label: t.projects.clone, onSelect: () => setCloning(true) },
	];
	return (
		<div className="flex min-h-full flex-col items-center justify-center px-4 py-12">
			<Card
				pad
				role="region"
				aria-labelledby="no-project"
				className="flex w-full max-w-md flex-col items-center gap-5 py-12 text-center"
			>
				<span aria-hidden="true" className={MARK} />
				<h1 id="no-project" className="text-30 font-semibold text-n-12">
					{t.workspace.moment.noProject}
				</h1>
				<div className="flex flex-wrap justify-center gap-3">
					<Button onClick={() => void navigate({ to: "/projects/new" })}>{t.creator.title}</Button>
					<Menu.Root>
						<Menu.Trigger render={<Button variant="primary" />}>
							{t.onboarding.steps.project.title}
						</Menu.Trigger>
						<MenuList items={items} />
					</Menu.Root>
				</div>
				{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
			</Card>
			<CloneDialog open={cloning} onClose={() => setCloning(false)} />
		</div>
	);
}

/** A space whose views need a project: the loading pattern, then the page or the view. */
export function WithProject({
	title,
	icon,
	children,
}: {
	title: string;
	icon: ReactNode;
	children: ReactNode;
}) {
	const active = useActiveProject().data;
	if (active === undefined) return <Loading title={title} icon={icon} />;
	return active ? children : <NoProject title={title} icon={icon} />;
}
