import { useI18n } from "@/lib/i18n";
import { LockClosedIcon } from "@/ui/icons";
import { ListDetail } from "@/ui/templates/list-detail";
import { FileEditor } from "./file-editor";
import { WithProject } from "./no-project";

const PATH = "docs/openspec/constitution.md";

/** Specs / Constitution: the rules of the project, in the editor (REQ-014). */
export function Constitution() {
	const { t } = useI18n();
	const title = t.tabs.specs.constitution;
	return (
		<WithProject title={title}>
			<ListDetail title={title} icon={<LockClosedIcon size={16} />}>
				<div className="mx-4 mb-4 flex min-h-0 flex-1 flex-col rounded-lg border bg-surface-1 p-3 shadow-1">
					<FileEditor path={PATH} title={title} refId={PATH} read />
				</div>
			</ListDetail>
		</WithProject>
	);
}
