import { Link } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";
import { LinkedCard, LinkedRow } from "@/features/library/page-parts";
import { format, useI18n } from "@/lib/i18n";
import { DOC_DIR, useDocFile, useDocList } from "@/lib/knowledge";
import { copyText } from "@/lib/menus";
import { useBacklinks } from "@/lib/refs";
import { RightButton, useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useDraftCount } from "@/lib/shell/drafts";
import { clearEditRequest, wantsEdit } from "@/lib/shell/selection";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Segmented } from "@/ui/atoms/segmented";
import { StatusDot } from "@/ui/atoms/status-dot";
import { BookOpenIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { MenuButton, type MenuButtonItem } from "@/ui/molecules/menu-button";
import { useSides } from "@/ui/molecules/pane-toggle";
import { Row } from "@/ui/molecules/row";
import { markdown } from "@/ui/molecules/syntax";
import { AUTOSAVE_MS } from "@/ui/organisms/editor-frame";
import { LeaveGuard } from "@/ui/organisms/leave-guard";
import { blocks, MarkdownView } from "@/ui/organisms/markdown-view";
import { ListTab } from "./list-tab";

const DOTS = (
	<svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
		<circle cx="3" cy="8" r="1.25" />
		<circle cx="8" cy="8" r="1.25" />
		<circle cx="13" cy="8" r="1.25" />
	</svg>
);

const QUESTION = (
	<svg
		aria-hidden="true"
		viewBox="0 0 24 24"
		className="size-5"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.5"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<circle cx="12" cy="12" r="9" />
		<path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.2-1.5 2.3M12 17v.5" />
	</svg>
);

/** The text of a page without its first heading: the card shows that title already. */
const withoutTitle = (text: string) => text.replace(/^\s*# [^\n]*\n+/, "");

/** The header of the card of an open file: the name, then the controls, then the "More" menu. */
export function CardHeader({
	title,
	more,
	children,
}: {
	title: string;
	/** The items of the "More" menu of the card. */
	more?: MenuButtonItem[];
	children?: React.ReactNode;
}) {
	const { t } = useI18n();
	return (
		<header className="flex flex-wrap items-center gap-4">
			<h2 className="mr-auto min-w-0 break-words text-30 font-semibold text-n-12">{title}</h2>
			{children}
			{more?.length ? (
				<MenuButton iconOnly label={`${t.ui.more} ${title}`} icon={DOTS} items={more} />
			) : null}
		</header>
	);
}

/**
 * One Markdown file in the card of a Library page: Read or Text, Edit, and the "More" menu with
 * the reference. It opens on the page to read. The text saves itself after a short pause; a change
 * on disk asks before it replaces the file (REQ-011), and a draft asks before the person leaves.
 */
export function PageCard({
	path,
	title,
	more,
	contents,
	footer,
}: {
	path: string;
	title: string;
	/** More items of the "More" menu of the card: Rename, Delete. */
	more?: MenuButtonItem[];
	/** The read view has a table of contents. */
	contents?: boolean;
	/** A row under the page, behind a divider. */
	footer?: React.ReactNode;
}) {
	const { t } = useI18n();
	const e = t.knowledge.editor;
	const file = useDocFile(path);
	const { openRef } = useShell();
	const reason = useRights().gate("knowledge.edit").reason;
	// An Edit request is read once for each page.
	const [asked] = useState(() => wantsEdit(path));
	useEffect(() => void clearEditRequest(path), [path]);
	// The key of the old editor: the stored choice of a person stays.
	const { sides, choose } = useSides(
		`markdown:doc:${path}`,
		asked || file.conflict || !!file.error,
	);
	const anchor = useId();
	const canSave = file.ready && file.dirty && !file.conflict && !reason;
	const save = file.save;
	useEffect(() => {
		if (!canSave || file.error) return;
		const id = setTimeout(() => void save(), AUTOSAVE_MS);
		return () => clearTimeout(id);
	}, [canSave, file.error, save]);
	useDraftCount(file.dirty || file.conflict);
	const body = withoutTitle(file.text);
	const toc =
		contents && !sides.editor
			? blocks(body).flatMap((b, i) =>
					b.type === "h" && b.level > 1 ? [{ i, level: b.level, text: b.text }] : [],
				)
			: [];
	return (
		<section aria-label={title} className="flex min-w-0 flex-col gap-4.5">
			<LeaveGuard dirty={file.dirty || file.conflict} />
			<CardHeader
				title={title}
				more={[
					...(sides.editor
						? [
								{
									id: "both",
									label: t.editing.sides.both,
									checked: sides.preview,
									onSelect: () => choose(sides.preview ? "editor" : "both"),
								},
							]
						: []),
					{ id: "copy", label: t.context.copyRef, onSelect: () => void copyText(`doc:${path}`) },
					...(more ?? []),
				]}
			>
				{file.dirty ? <StatusDot status="warning" label={e.dirty} /> : null}
				<div>
					<Segmented
						label={t.editing.view.label}
						value={sides.editor ? "text" : "read"}
						onValueChange={(to) => choose(to === "text" ? "editor" : "preview")}
						items={[
							{ value: "read", label: t.editing.sides.read },
							{ value: "text", label: t.editing.view.text },
						]}
					/>
				</div>
				{sides.editor ? (
					<Button
						className="min-h-control"
						disabled={!canSave}
						reason={reason}
						onClick={() => void file.save()}
					>
						{e.save}
					</Button>
				) : (
					<RightButton
						right="knowledge.edit"
						className="min-h-control"
						onClick={() => choose("editor")}
					>
						{t.knowledge.handbook.edit}
					</RightButton>
				)}
			</CardHeader>
			{file.conflict ? (
				<div
					role="alert"
					className="flex flex-wrap items-center gap-2 rounded-md bg-warning-subtle px-4 py-2 text-warning-text"
				>
					<span className="flex-1">{e.conflict}</span>
					<Button className="min-h-control" onClick={() => void file.keepMine()}>
						{e.keepMine}
					</Button>
					<Button variant="primary" className="min-h-control" onClick={() => void file.reload()}>
						{e.reload}
					</Button>
				</div>
			) : null}
			{sides.editor ? (
				<div
					className={cn(
						"grid h-[60vh] min-h-64 grid-rows-1 gap-3",
						sides.preview ? "grid-cols-2" : "grid-cols-1",
					)}
				>
					<CodeEditor
						label={e.text}
						value={file.text}
						onChange={file.setText}
						highlight={markdown}
					/>
					{sides.preview ? (
						<div className="min-h-0 overflow-auto">
							<MarkdownView source={file.text} label={e.preview} />
						</div>
					) : null}
				</div>
			) : (
				<div className="flex flex-col gap-6 @4xl:flex-row">
					<div className="min-w-0 max-w-[70ch] flex-1">
						<MarkdownView source={body} label={title} anchor={anchor} reading onOpenRef={openRef} />
					</div>
					{toc.length ? (
						<nav
							aria-label={t.knowledge.handbook.contents}
							className="flex shrink-0 flex-col gap-0.5 @4xl:w-56"
						>
							<h3 className="pb-1 text-13 font-semibold text-n-11">
								{t.knowledge.handbook.contents}
							</h3>
							{toc.map((h) => (
								<button
									key={h.i}
									type="button"
									onClick={() =>
										document.getElementById(`${anchor}-${h.i}`)?.scrollIntoView({ block: "start" })
									}
									className={cn(
										"min-h-control truncate rounded-sm border-l border-n-6 text-left text-n-11 hover:border-accent hover:text-n-12",
										h.level === 2 ? "pl-3" : "pl-6",
									)}
								>
									{h.text}
								</button>
							))}
						</nav>
					) : null}
				</div>
			)}
			{file.error ? (
				<p role="alert" className="rounded-md bg-danger-subtle px-4 py-2 text-danger-text">
					{file.error}
				</p>
			) : null}
			{footer ? (
				<div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-n-5 pt-4">
					{footer}
				</div>
			) : null}
		</section>
	);
}

/** The cards under the page tree: the manual of the app, and the items that cite the open page. */
function HandbookSide({ path }: { path?: string }) {
	const { t } = useI18n();
	const k = t.knowledge.handbook;
	const { openRef } = useShell();
	const cited = useBacklinks(path ? `doc:${path}` : null).data ?? [];
	const kinds = t.refKind as Record<string, string>;
	return (
		<>
			<Card className="py-2">
				<Row render={(p) => <Link to="/library/manual" {...p} />}>
					{QUESTION}
					<span className="min-w-0 font-semibold">{k.manual}</span>
					<Badge className="ml-auto">F1</Badge>
				</Row>
			</Card>
			{path && cited.length ? (
				<LinkedCard title={k.backlinks}>
					{cited.flatMap((g) =>
						g.items.map((i) => (
							<LinkedRow
								key={i.source}
								label={i.title || i.source.slice(i.source.indexOf(":") + 1)}
								leading={<Badge>{kinds[g.kind] ?? g.kind}</Badge>}
								render={(p) => <button type="button" onClick={() => openRef(i.source)} {...p} />}
							/>
						)),
					)}
				</LinkedCard>
			) : null}
		</>
	);
}

/** A page of the handbook with the row that asks an agent to update it. */
function HandbookCard({ path, title }: { path: string; title: string }) {
	const { t } = useI18n();
	const { ask } = useShell();
	const k = t.knowledge.handbook;
	return (
		<PageCard
			path={path}
			title={title}
			contents
			footer={
				<Button className="min-h-control" onClick={() => ask(format(k.askUpdate, { path }))}>
					{k.askUpdateLabel}
				</Button>
			}
		/>
	);
}

/** Library / Handbook: the Markdown pages of the repository as a page tree (REQ-010). */
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
			find={k.find}
			base={DOC_DIR.handbook}
			rows={rows}
			template={(name) => `# ${name}\n`}
			tree
			side={(open) => <HandbookSide path={open?.path} />}
		>
			{(row) => <HandbookCard path={row.path} title={row.title} />}
		</ListTab>
	);
}
