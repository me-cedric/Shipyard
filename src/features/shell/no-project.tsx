import { type ReactNode, useState } from "react";
import { CloneDialog } from "@/features/projects/clone-dialog";
import { NewProjectDialog } from "@/features/projects/new-project/new-project-dialog";
import { useI18n } from "@/lib/i18n";
import { outcomeError, useActiveProject, useProjectActions } from "@/lib/projects";
import { Button } from "@/ui/atoms/button";
import { ArrowDownTrayIcon, FolderOpenIcon, PlusIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import { ListDetail } from "@/ui/templates/list-detail";

/**
 * The page of every space that needs a project and has none: open a folder, clone a repository or
 * start a new project. The same three ways as Home / Projects. The title is the `h1` of the space.
 */
export function NoProject({ title, icon }: { title: string; icon?: ReactNode }) {
	const { t } = useI18n();
	const { openFolder } = useProjectActions();
	const [error, setError] = useState<unknown>(null);
	const [cloning, setCloning] = useState(false);
	const [creating, setCreating] = useState(false);
	return (
		<ListDetail title={title} icon={icon}>
			<div className="flex flex-col items-center p-4">
				<EmptyState
					title={t.empty.project}
					action={{
						label: t.projects.open,
						icon: <FolderOpenIcon size={14} />,
						onClick: () =>
							void openFolder()
								.then((o) => setError(o && outcomeError(t, o)))
								.catch((e: unknown) => setError(e)),
					}}
					extra={
						<>
							<Button onClick={() => setCloning(true)}>
								<ArrowDownTrayIcon size={14} />
								{t.projects.clone}
							</Button>
							<Button onClick={() => setCreating(true)}>
								<PlusIcon size={14} />
								{t.creator.title}
							</Button>
						</>
					}
				/>
				{error ? <ErrorNotice error={error} className="pt-3 text-ui text-danger-text" /> : null}
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
	icon?: ReactNode;
	children: ReactNode;
}) {
	const active = useActiveProject().data;
	if (active === undefined) return <Loading title={title} icon={icon} />;
	return active ? children : <NoProject title={title} icon={icon} />;
}
