import { Fragment, type ReactNode, useState } from "react";
import {
	DetailColumn,
	LibraryPage,
	ListCard,
	ListColumn,
	PageColumns,
} from "@/features/library/page-parts";
import { NoProject } from "@/features/shell/no-project";
import { useI18n } from "@/lib/i18n";
import type { PageEntry } from "@/lib/ipc";
import { slug, useCreateDoc } from "@/lib/knowledge";
import { copyText, useAsk, useMenus, useRename, useTrash } from "@/lib/menus";
import { useActiveProject } from "@/lib/projects";
import { useRefFilter } from "@/lib/refs";
import { RightButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useTabSelection } from "@/lib/shell/selection";
import { cn } from "@/lib/utils";
import { Input } from "@/ui/atoms/input";
import { DocumentTextIcon, FolderOpenIcon, PlusIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Loading } from "@/ui/molecules/loading";
import type { PageMenuItem } from "@/ui/molecules/page-header";
import { Dialog } from "@/ui/organisms/dialog";

function NewDialog({
	noun,
	nameLabel,
	create,
	onClose,
}: {
	noun: string;
	nameLabel: string;
	create: (name: string) => Promise<void>;
	onClose: () => void;
}) {
	const { t } = useI18n();
	const [name, setName] = useState("");
	const [error, setError] = useState<unknown>(null);
	const submit = async () => {
		try {
			setError(null);
			await create(name.trim());
			onClose();
		} catch (e) {
			setError(e);
		}
	};
	return (
		<Dialog
			open
			onOpenChange={(open) => !open && onClose()}
			title={noun}
			actions={
				<RightButton
					right="knowledge.edit"
					variant="primary"
					disabled={!name.trim()}
					onClick={() => void submit()}
				>
					{t.design.create}
				</RightButton>
			}
		>
			<form
				className="flex flex-col gap-2"
				onSubmit={(e) => {
					e.preventDefault();
					if (name.trim()) void submit();
				}}
			>
				<Input caption label={nameLabel} value={name} onChange={(e) => setName(e.target.value)} />
				{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
			</form>
		</Dialog>
	);
}

/** One page of the tree: 44 px, the open one with the accent tint. */
const PAGE =
	"flex min-h-control w-full items-center gap-2.5 rounded-md px-3 text-left font-medium text-n-12 transition-colors duration-(--duration-fast) hover:bg-n-3";

/**
 * The frame of a Library page of files: the header with the search, the one primary action and the
 * "More" menu of the open file, the files as cards on the left (a page tree with `tree`) and the
 * open file in a card beside them. A pick opens the `doc:<path>` entity in the inspector (REQ-025).
 */
export function ListTab({
	title,
	icon,
	noun,
	nameLabel,
	find,
	base,
	rows,
	template,
	create,
	menu: pageMenu,
	extra,
	notice,
	thumb,
	pills,
	tree,
	side,
	below,
	children,
}: {
	title: string;
	icon: ReactNode;
	/** The label of the one primary action. */
	noun: string;
	nameLabel: string;
	/** The name of the search field: "Find a page". */
	find: string;
	/** The repository folder of the files. */
	base: string;
	/** `undefined` while the list loads: the view shows nothing, not the empty state. */
	rows: PageEntry[] | undefined;
	/** The text of a new file, from its name. Without `create` the tab needs it. */
	template?: (name: string) => string;
	/** Replaces the new file from `template`: the primary action does this with the name. */
	create?: (name: string) => void;
	/** Secondary header actions, before the primary one. */
	extra?: ReactNode;
	/** Actions of the page for the "More" menu, before the actions of the open file. */
	menu?: PageMenuItem[];
	/** The result of a secondary action. */
	notice?: ReactNode;
	/** The face of a file on its card. */
	thumb?: (row: PageEntry) => ReactNode;
	/** The pills under the name of a file. */
	pills?: (row: PageEntry) => ReactNode;
	/** The files as one page tree with icons, not as cards. */
	tree?: boolean;
	/** Cards under the list, for the open file. */
	side?: (open: PageEntry | undefined) => ReactNode;
	/** Cards under the card of the open file. */
	below?: (open: PageEntry) => ReactNode;
	children: (row: PageEntry) => ReactNode;
}) {
	const { t } = useI18n();
	const active = useActiveProject().data;
	const { openRef } = useShell();
	const createDoc = useCreateDoc();
	const menu = useMenus();
	const trash = useTrash();
	const rename = useRename();
	const askItems = useAsk();
	// The first file opens by default: the page never shows an empty card.
	const [selected, setSelected] = useTabSelection(
		`knowledge:${base}`,
		rows?.map((r) => r.path) ?? [],
	);
	const [adding, setAdding] = useState(false);
	const filter = useRefFilter();
	if (active === null) return <NoProject title={title} icon={icon} />;
	// The heading shows while the list loads: a page always has its level-one heading.
	if (active === undefined || !rows) return <Loading title={title} icon={icon} />;
	const open = rows.find((r) => r.path === selected);
	// The index finds the files by their text, in the same command as the palette.
	const shown = filter.refs ? rows.filter((r) => filter.refs?.has(`doc:${r.path}`)) : rows;
	const add = () => setAdding(true);
	const pick = (path: string) => {
		setSelected(path);
		openRef(`doc:${path}`, true);
	};

	const rowMenu = (r: PageEntry) => [
		...menu("ref", {
			open: () => pick(r.path),
			"copy-ref": () => copyText(`doc:${r.path}`),
			"copy-path": () => copyText(r.path),
			rename: rename.locked ? undefined : () => rename.start(r.path, (_, path) => pick(path)),
			delete: () => void trash(r.path, `doc:${r.path}`),
		}),
		...askItems(`doc:${r.path}`, r.path),
	];

	// A folder is a group. A page at the root has no heading.
	const groups = new Map<string, PageEntry[]>();
	for (const r of shown) {
		const rel = r.path.slice(base.length + 1);
		const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
		groups.set(dir, [...(groups.get(dir) ?? []), r]);
	}
	const line = (r: PageEntry, sub: boolean) => (
		<li key={r.path}>
			<ContextMenu items={rowMenu(r)}>
				<button
					type="button"
					data-nav=""
					title={r.path}
					aria-current={r.path === selected ? "true" : undefined}
					onClick={() => pick(r.path)}
					className={cn(
						PAGE,
						sub && "pl-10.5",
						r.path === selected && "bg-accent-tint text-accent",
					)}
				>
					{sub ? null : <DocumentTextIcon size={20} />}
					<span className="min-w-0 flex-1 truncate">{r.title}</span>
				</button>
			</ContextMenu>
		</li>
	);
	return (
		<LibraryPage
			title={title}
			action={
				rows.length === 0 ? undefined : (
					<>
						<Input
							label={find}
							type="search"
							className="w-65 max-w-full"
							value={filter.text}
							onChange={(e) => filter.setText(e.target.value)}
						/>
						{extra}
						<RightButton
							right="knowledge.edit"
							variant="primary"
							className="min-h-control"
							onClick={add}
						>
							{noun}
						</RightButton>
					</>
				)
			}
			menu={[
				...(pageMenu ?? []),
				...(open
					? rowMenu(open)
							.filter((m) => m.id !== "open")
							.map((m) => ({ label: m.label, onClick: m.onSelect, disabled: m.disabled }))
					: []),
			]}
		>
			{rename.dialog}
			{notice}
			{rows.length === 0 ? (
				<EmptyState
					title={t.empty.nothing}
					action={{ label: noun, icon: <PlusIcon size={14} />, onClick: add }}
				/>
			) : (
				<PageColumns>
					<ListColumn>
						{tree ? (
							<Card className="p-2.5">
								<nav aria-label={title} className="flex flex-col gap-0.5">
									{[...groups].map(([dir, list]) => (
										<Fragment key={dir}>
											{dir ? (
												<section aria-label={dir}>
													<h2 className={cn(PAGE, "hover:bg-transparent")}>
														<FolderOpenIcon size={20} />
														{dir}
													</h2>
													<ul className="flex flex-col gap-0.5">
														{list.map((r) => line(r, true))}
													</ul>
												</section>
											) : (
												<ul className="flex flex-col gap-0.5">{list.map((r) => line(r, false))}</ul>
											)}
										</Fragment>
									))}
								</nav>
							</Card>
						) : (
							<ul aria-label={title} className="flex flex-col gap-2.5">
								{shown.map((r) => (
									<li key={r.path}>
										<ContextMenu items={rowMenu(r)}>
											{thumb ? (
												// `ListCard` has no place for a face above the name: the same look, drawn here.
												<button
													type="button"
													data-nav=""
													title={r.path}
													aria-pressed={r.path === selected}
													onClick={() => pick(r.path)}
													className={cn(
														"flex w-full cursor-pointer flex-col gap-3 rounded-lg bg-surface-2 p-4.5 text-left text-n-12 shadow-2 focus-visible:outline-offset-2",
														r.path === selected && "bg-accent-tint outline-2 outline-accent",
													)}
												>
													<span aria-hidden="true" className="block w-full">
														{thumb(r)}
													</span>
													<span className="max-w-full break-words text-17 font-semibold">
														{r.title}
													</span>
													{pills?.(r)}
												</button>
											) : (
												<ListCard
													name={r.title}
													pills={pills?.(r)}
													selected={r.path === selected}
													data-nav=""
													title={r.path}
													onClick={() => pick(r.path)}
												/>
											)}
										</ContextMenu>
									</li>
								))}
							</ul>
						)}
						{side?.(open)}
					</ListColumn>
					<DetailColumn>
						{open ? (
							<Fragment key={open.path}>
								<Card pad className="@container flex min-w-0 flex-col gap-4.5">
									{children(open)}
								</Card>
								{below?.(open)}
							</Fragment>
						) : null}
					</DetailColumn>
				</PageColumns>
			)}
			{adding ? (
				<NewDialog
					noun={noun}
					nameLabel={nameLabel}
					onClose={() => setAdding(false)}
					create={async (name) => {
						if (create) return create(name);
						const path = `${base}/${slug(name)}.md`;
						await createDoc(path, template?.(name) ?? "");
						pick(path);
					}}
				/>
			) : null}
		</LibraryPage>
	);
}
