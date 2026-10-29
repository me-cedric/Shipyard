import { useI18n } from "@/lib/i18n";
import { useProjectActions } from "@/lib/projects";
import { FolderOpenIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ListDetail } from "@/ui/templates/list-detail";

/** Every Work view starts from a project. Without one, the view shows ghost rows and one action. */
export function NoProject({ title }: { title: string }) {
	const { t } = useI18n();
	const { openFolder } = useProjectActions();
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
