import { useI18n } from "@/lib/i18n";
import { FileEditor } from "./file-editor";
import { WithProject } from "./no-project";

const PATH = "docs/openspec/constitution.md";

/** Specs / Constitution: the rules of the project, in the editor (REQ-014). */
export function Constitution() {
	const { t } = useI18n();
	const title = t.tabs.specs.constitution;
	return (
		<WithProject title={title}>
			<div className="flex min-h-0 flex-1 flex-col p-3">
				<h1 className="sr-only">{title}</h1>
				<FileEditor path={PATH} title={title} refId={PATH} />
			</div>
		</WithProject>
	);
}
