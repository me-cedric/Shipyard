import { useI18n } from "@/lib/i18n";
import { DOC_DIR, useDocFile, useDocList } from "@/lib/knowledge";
import { MarkdownEditor } from "@/ui/organisms/markdown-editor";
import { ListTab } from "./list-tab";

/** One Markdown file in the one editor. A change on disk asks before it replaces the file (REQ-011). */
export function PageEditor({
	path,
	title,
	actions,
}: {
	path: string;
	title: string;
	actions?: React.ReactNode;
}) {
	const { t } = useI18n();
	const file = useDocFile(path);
	return (
		<MarkdownEditor
			title={title}
			refId={`doc:${path}`}
			value={file.text}
			onChange={file.setText}
			save={file.conflict ? "conflict" : file.dirty ? "dirty" : "clean"}
			onSave={() => void file.save()}
			canSave={file.ready && file.dirty}
			error={file.error}
			onReload={() => void file.reload()}
			onKeepMine={() => void file.keepMine()}
			actions={actions}
			labels={t.knowledge.editor}
			saveLabel={t.knowledge.editor.save}
		/>
	);
}

/** Knowledge / Handbook: the Markdown pages of the repository as a page tree (REQ-010). */
export function Handbook() {
	const { t } = useI18n();
	const k = t.knowledge.handbook;
	const rows = useDocList().data?.handbook;
	return (
		<ListTab
			title={k.title}
			noun={k.newPage}
			nameLabel={k.name}
			base={DOC_DIR.handbook}
			rows={rows}
			template={(name) => `# ${name}\n`}
		>
			{(row) => <PageEditor path={row.path} title={row.title} />}
		</ListTab>
	);
}
