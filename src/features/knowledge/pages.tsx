import { useId, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { DOC_DIR, useDocFile, useDocList } from "@/lib/knowledge";
import { useBacklinks } from "@/lib/refs";
import { useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { BookOpenIcon, PencilIcon } from "@/ui/icons";
import { BacklinkList } from "@/ui/molecules/backlink-list";
import { Panel } from "@/ui/molecules/panel";
import { RefChip } from "@/ui/molecules/ref-chip";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { MarkdownEditor } from "@/ui/organisms/markdown-editor";
import { blocks, MarkdownView } from "@/ui/organisms/markdown-view";
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

/**
 * One handbook page. Read mode sets the page in a 680 px measure with its table of contents and
 * the entities that cite it; edit mode is the one editor.
 */
function HandbookPage({ path, title }: { path: string; title: string }) {
	const { t } = useI18n();
	const k = t.knowledge.handbook;
	const [mode, setMode] = useState<"read" | "edit">("read");
	const file = useDocFile(path);
	const { openRef } = useShell();
	const anchor = useId();
	const cited = useBacklinks(`doc:${path}`).data ?? [];
	const toc = blocks(file.text).flatMap((b, i) =>
		b.type === "h" && b.level > 1 ? [{ i, level: b.level, text: b.text }] : [],
	);
	const modes = (
		<ViewTabs
			label={k.mode}
			value={mode}
			onValueChange={setMode}
			tabs={[
				{ value: "read", label: k.read, icon: <BookOpenIcon size={12} /> },
				{ value: "edit", label: k.edit, icon: <PencilIcon size={12} /> },
			]}
		/>
	);
	if (mode === "edit") return <PageEditor path={path} title={title} actions={modes} />;
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3">
			<div className="flex items-center gap-2">
				<RefChip refId={`doc:${path}`} state="resolved" />
				<span className="flex-1" />
				{modes}
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto @4xl:flex-row @4xl:overflow-visible">
				<div className="min-w-0 @4xl:flex-1 @4xl:overflow-auto">
					<div className="mx-auto max-w-[680px] pb-4">
						<MarkdownView source={file.text} label={title} anchor={anchor} reading />
					</div>
				</div>
				<aside className="mx-auto flex w-full max-w-[680px] shrink-0 flex-col gap-3 @4xl:w-56">
					{toc.length ? (
						<nav aria-label={k.contents} className="flex flex-col gap-0.5">
							<h2 className="pb-1 text-12 font-medium text-n-11">{k.contents}</h2>
							{toc.map((h) => (
								<button
									key={h.i}
									type="button"
									onClick={() =>
										document.getElementById(`${anchor}-${h.i}`)?.scrollIntoView({ block: "start" })
									}
									className={cn(
										"truncate rounded-sm border-l border-n-6 py-0.5 text-left text-12 text-n-11 hover:border-accent hover:text-n-12",
										h.level === 2 ? "pl-2" : "pl-5",
									)}
								>
									{h.text}
								</button>
							))}
						</nav>
					) : null}
					<Panel
						title={k.backlinks}
						count={cited.reduce((n, g) => n + g.items.length, 0)}
						bodyClassName="p-2"
					>
						<BacklinkList
							groups={cited.map((g) => ({
								kind: g.kind,
								items: g.items.map((i) => ({ ref: i.source, title: i.title })),
							}))}
							onOpen={openRef}
						/>
					</Panel>
				</aside>
			</div>
		</div>
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
			icon={<BookOpenIcon size={16} />}
			noun={k.newPage}
			nameLabel={k.name}
			base={DOC_DIR.handbook}
			rows={rows}
			template={(name) => `# ${name}\n`}
		>
			{(row) => <HandbookPage path={row.path} title={row.title} />}
		</ListTab>
	);
}
