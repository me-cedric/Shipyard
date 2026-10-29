import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { useActiveProject, useProjectActions } from "@/lib/projects";
import { FolderOpenIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ListDetail } from "@/ui/templates/list-detail";

/** Every Specs view starts from a project. Without one, the view shows ghost rows and one action. */
export function WithProject({ title, children }: { title: string; children: ReactNode }) {
	const { t } = useI18n();
	const active = useActiveProject().data;
	const { openFolder } = useProjectActions();
	if (active === undefined) return null;
	if (active) return children;
	return (
		<ListDetail title={title}>
			<div className="p-4">
				<EmptyState
					action={{
						label: t.projects.open,
						icon: <FolderOpenIcon size={14} />,
						onClick: () => void openFolder(),
					}}
				/>
			</div>
		</ListDetail>
	);
}
