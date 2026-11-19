import { Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { CloneDialog } from "@/features/projects/clone-dialog";
import { NewProjectDialog } from "@/features/projects/new-project/new-project-dialog";
import { useI18n } from "@/lib/i18n";
import { outcomeError, useActiveProject, useProjectActions } from "@/lib/projects";
import { Button, buttonVariants } from "@/ui/atoms/button";
import { Card } from "@/ui/molecules/card";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { MARK, useBare } from "./bare";

/**
 * The page of every place that needs a project and has none: one centred card, without the shell.
 * It starts a new project, clones a repository or opens a folder: the same three ways as the
 * Projects page. Open a project goes to the project list, which shows with the shell. A folder
 * that the person drops on the window opens too. The place gives `title`
 * and `icon` to its loading pattern; this page has its own title.
 */
export function NoProject(_: { title: string; icon: ReactNode }) {
	useBare();
	const { t } = useI18n();
	const { openFolder } = useProjectActions();
	const [error, setError] = useState<unknown>(null);
	const [cloning, setCloning] = useState(false);
	const [creating, setCreating] = useState(false);
	return (
		<div className="flex min-h-full flex-col items-center justify-center px-4 py-12">
			<Card
				pad
				role="region"
				aria-labelledby="no-project"
				className="flex w-full max-w-130 flex-col items-center gap-5 py-10 text-center"
			>
				<span aria-hidden="true" className={MARK} />
				<h1 id="no-project" className="text-30 font-semibold text-n-12">
					{t.workspace.moment.noProject}
				</h1>
				<div className="flex flex-wrap justify-center gap-3">
					<Button onClick={() => setCreating(true)}>{t.creator.title}</Button>
					<Button onClick={() => setCloning(true)}>{t.projects.clone}</Button>
					<Button
						onClick={() =>
							void openFolder()
								.then((o) => setError(o && outcomeError(t, o)))
								.catch((e: unknown) => setError(e))
						}
					>
						{t.projects.open}
					</Button>
					<Link to="/projects" className={buttonVariants({ variant: "primary" })}>
						{t.onboarding.steps.project.title}
					</Link>
				</div>
				{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
			</Card>
			<CloneDialog open={cloning} onClose={() => setCloning(false)} />
			<NewProjectDialog open={creating} onClose={() => setCreating(false)} />
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
