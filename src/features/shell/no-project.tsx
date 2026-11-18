import { type ReactNode, useState } from "react";
import { CloneDialog } from "@/features/projects/clone-dialog";
import { NewProjectDialog } from "@/features/projects/new-project/new-project-dialog";
import { useI18n } from "@/lib/i18n";
import { outcomeError, useActiveProject, useProjectActions } from "@/lib/projects";
import { Button } from "@/ui/atoms/button";
import { ArrowDownTrayIcon, FolderOpenIcon, PlusIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { ListDetail } from "@/ui/templates/list-detail";

/**
 * The page of every place that needs a project and has none: open a folder, clone a repository or
 * start a new project. The same three ways as the Projects page. The title is the `h1` of the place.
 */
export function NoProject({ title, icon }: { title: string; icon: ReactNode }) {
	const { t } = useI18n();
	const { openFolder } = useProjectActions();
	const [error, setError] = useState<unknown>(null);
	const [cloning, setCloning] = useState(false);
	const [creating, setCreating] = useState(false);
	return (
		<ListDetail title={title} icon={icon}>
			<div className="flex flex-col items-center p-4">
				<section
					aria-labelledby="no-project"
					className="flex w-full max-w-xl flex-col items-center gap-4 rounded-xl bg-surface-2 p-8 shadow-1"
				>
					<h2 id="no-project" className="text-20 font-semibold text-n-12">
						{t.workspace.moment.noProject}
					</h2>
					<div className="flex flex-wrap justify-center gap-2">
						<Button className="min-h-control" onClick={() => setCreating(true)}>
							<PlusIcon size={14} />
							{t.creator.title}
						</Button>
						<Button className="min-h-control" onClick={() => setCloning(true)}>
							<ArrowDownTrayIcon size={14} />
							{t.projects.clone}
						</Button>
						<Button
							variant="primary"
							className="min-h-control"
							onClick={() =>
								void openFolder()
									.then((o) => setError(o && outcomeError(t, o)))
									.catch((e: unknown) => setError(e))
							}
						>
							<FolderOpenIcon size={14} />
							{t.projects.open}
						</Button>
					</div>
					{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
				</section>
			</div>
			<CloneDialog open={cloning} onClose={() => setCloning(false)} />
			<NewProjectDialog open={creating} onClose={() => setCreating(false)} />
		</ListDetail>
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
