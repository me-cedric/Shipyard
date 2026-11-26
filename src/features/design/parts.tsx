import { Link } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { WithProject } from "@/features/shell/no-project";
import { refPage } from "@/features/shell/ref-page";
import { message, useDesignList } from "@/lib/design";
import { format, useI18n } from "@/lib/i18n";
import { copyText, useAsk, useMenus, useRename, useTrash } from "@/lib/menus";
import { useBacklinks } from "@/lib/refs";
import { RightButton } from "@/lib/rights";
import { useFormIntent, useShell } from "@/lib/shell";
import { useTabSelection } from "@/lib/shell/selection";
import { Badge } from "@/ui/atoms/badge";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { Card } from "@/ui/molecules/card";
import { ContextMenu, type MenuItem } from "@/ui/molecules/context-menu";
import { EmptyState } from "@/ui/molecules/empty-state";
import { Loading } from "@/ui/molecules/loading";
import type { PageMenuItem } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";
import { Dialog } from "@/ui/organisms/dialog";
import { LinkedCard, LinkedRow, ListCard, PageColumns } from "@/ui/templates/library-page";

/** One item of a Design page: a file, an ADR or a screen. */
export type Item = {
	/** The ref of the item. It is also its key. */
	ref: string;
	title: string;
	/** The repository path of the file, for the copy, rename and delete actions. */
	path?: string;
	/** Why the file cannot be read. */
	issue?: string | null;
};

export type Create = {
	/** The formats to pick from, or none. */
	formats?: { value: string; label: string }[];
	/** Creates the item and returns its ref. */
	run: (name: string, format: string) => Promise<string | undefined>;
};

/** A Design page needs a project and its list: the loading pattern, then the page. */
export function DesignGate({ title, children }: { title: string; children: ReactNode }) {
	const list = useDesignList();
	return (
		<WithProject title={title} icon={null}>
			{list.isLoading ? <Loading title={title} /> : children}
		</WithProject>
	);
}

/** The form of a new item: its name, and its format when the page has several. */
export function NewDialog({
	title,
	create,
	format: first,
	onClose,
	onCreated,
}: {
	title: string;
	create: Create;
	/** The format that the form starts on. */
	format?: string;
	onClose: () => void;
	onCreated: (ref: string | undefined) => void;
}) {
	const { t } = useI18n();
	const [name, setName] = useState("");
	const [picked, setPicked] = useState(first ?? create.formats?.[0]?.value ?? "");
	const [error, setError] = useState<string | null>(null);
	const submit = async () => {
		try {
			setError(null);
			onCreated(await create.run(name.trim(), picked));
			onClose();
		} catch (e) {
			setError(message(e));
		}
	};
	return (
		<Dialog
			open
			onOpenChange={(open) => !open && onClose()}
			title={title}
			actions={
				<RightButton
					right="design.edit"
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
				<Input
					caption
					label={t.design.name}
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
				{create.formats ? (
					<Select
						caption
						label={t.design.format}
						items={create.formats}
						value={picked}
						onValueChange={setPicked}
					/>
				) : null}
				{error ? (
					<p role="alert" className="text-ui text-danger-text">
						{error}
					</p>
				) : null}
			</form>
		</Dialog>
	);
}

/**
 * The open item of a Design page and the actions of an item. The first item opens by default, and
 * the choice stays with the page. A pick puts the ref in the inspector, where the shell shows the
 * backlinks and the next step (REQ-002, REQ-020).
 */
export function useItems(title: string, items: Item[]) {
	const { t } = useI18n();
	const { openRef, ask } = useShell();
	const menu = useMenus();
	const trash = useTrash();
	const rename = useRename();
	const askItems = useAsk();
	const [selected, setSelected] = useTabSelection(
		`design:${title}`,
		items.map((i) => i.ref),
	);
	const [created, setCreated] = useState<string>();
	const pick = (ref: string) => {
		setSelected(ref);
		// A row that the page selects keeps the inspector at the side.
		openRef(ref, true);
	};
	/** The context menu of an item. */
	const menuOf = (i: Item): MenuItem[] => [
		...menu(i.ref.startsWith("adr:") ? "adr" : "ref", {
			open: () => pick(i.ref),
			"copy-ref": () => copyText(i.ref),
			"copy-path": i.path ? () => copyText(i.path as string) : undefined,
			rename:
				i.path && !rename.locked
					? () => rename.start(i.path as string, (ref) => pick(ref))
					: undefined,
			delete: i.path ? () => void trash(i.path as string, i.ref) : undefined,
		}),
		...askItems(i.ref, i.path),
	];
	return {
		selected,
		open: items.find((i) => i.ref === selected),
		pick,
		menuOf,
		/** The ref of the item that the person just made: its reader shows the text. */
		created,
		onCreated: (ref: string | undefined) => {
			if (!ref) return;
			setCreated(ref);
			pick(ref);
		},
		renameDialog: rename.dialog,
		/** The "More" menu of the page: the actions of the open item, without Open. */
		pageMenu: (i: Item | undefined): PageMenuItem[] =>
			i
				? menuOf(i)
						.filter((m) => m.id !== "open")
						.map((m) => ({ label: m.label, onClick: m.onSelect, disabled: m.disabled }))
				: [],
		/** Fills the message box of the assistant with a request about the item. It does not send. */
		askChange: (i: Item) => ask(format(t.design.page.askPrompt, { name: i.title, ref: i.ref })),
	};
}

/** The items as cards, in a list that has the name of the page. A secondary click opens the item menu. */
export function ItemList({
	label,
	items,
	selected,
	onPick,
	menuOf,
	pills,
	className,
}: {
	label: string;
	items: Item[];
	selected: string | null;
	onPick: (ref: string) => void;
	menuOf: (item: Item) => MenuItem[];
	/** The pills under the name of an item. "Not readable" comes first. */
	pills?: (item: Item) => ReactNode;
	className?: string;
}) {
	const { t } = useI18n();
	return (
		<ul aria-label={label} className={className ?? "flex flex-col gap-2.5"}>
			{items.map((i) => {
				const own = pills?.(i);
				return (
					<li key={i.ref}>
						<ContextMenu items={menuOf(i)}>
							<ListCard
								name={i.title}
								selected={i.ref === selected}
								onClick={() => onPick(i.ref)}
								pills={
									i.issue || own ? (
										<>
											{i.issue ? <Badge variant="danger">{t.design.unreadable}</Badge> : null}
											{own}
										</>
									) : undefined
								}
							/>
						</ContextMenu>
					</li>
				);
			})}
		</ul>
	);
}

/** The card "Used by": the items that cite the ref, each with its kind and a link to its page. */
export function UsedBy({ refId }: { refId: string }) {
	const { t } = useI18n();
	const { openRef } = useShell();
	const groups = useBacklinks(refId).data ?? [];
	const kinds = t.refKind as Record<string, string>;
	if (groups.length === 0) return null;
	return (
		<LinkedCard title={t.design.page.usedBy}>
			{groups.flatMap((g) =>
				g.items.map((b) => {
					const page = refPage(b.source);
					const name = b.title || b.source.slice(b.source.indexOf(":") + 1);
					const leading = <Badge key={b.source}>{kinds[g.kind] ?? g.kind}</Badge>;
					return page && page !== "/projects" ? (
						<LinkedRow
							key={b.source}
							label={name}
							leading={leading}
							trailing={<span />}
							render={(p) => <Link to={page} onClick={() => openRef(b.source)} {...p} />}
						/>
					) : (
						<LinkedRow
							key={b.source}
							label={name}
							leading={leading}
							trailing={<span />}
							render={(p) => <button type="button" onClick={() => openRef(b.source)} {...p} />}
						/>
					);
				}),
			)}
		</LinkedCard>
	);
}

/**
 * The state of a Design page: the open item with its actions, and the form of a new item. `form` is
 * the name of the create form that a link can open (Get started). Put `dialogs` in the page.
 */
export function usePage(title: string, items: Item[], create: Create, newTitle: string, form = "") {
	const it = useItems(title, items);
	// The format that the form starts on; "" is the first one.
	const [adding, setAdding] = useState<string | null>(null);
	useFormIntent(form, () => setAdding(""));
	return {
		...it,
		add: (format = "") => setAdding(format),
		dialogs: (
			<>
				{it.renameDialog}
				{adding === null ? null : (
					<NewDialog
						title={newTitle}
						create={create}
						format={adding || undefined}
						onClose={() => setAdding(null)}
						onCreated={it.onCreated}
					/>
				)}
			</>
		),
	};
}

/** The error of the list, or a reason that the list is partial. */
export function ListNotice({ notice }: { notice?: string | null }) {
	const list = useDesignList();
	const text = list.error ? message(list.error) : notice;
	return text ? (
		<p role="alert" className="text-danger-text">
			{text}
		</p>
	) : null;
}

/** A page with no item: one action that makes the first one. */
export function Empty({ label, onAdd }: { label: string; onAdd: () => void }) {
	const { t } = useI18n();
	return <EmptyState title={t.empty.nothing} action={{ label, onClick: onAdd }} />;
}

/** The grey panel of a picture: a diagram, a model or the tables. */
export function Canvas({ className, children }: { className?: string; children: ReactNode }) {
	return (
		<section
			className={`relative flex min-h-[560px] min-w-0 ${className ?? "flex-[3_1_420px]"} flex-col rounded-lg bg-n-4 p-4`}
		>
			{children}
		</section>
	);
}

/** The text of a file in a card: the file name and Save in the head, the editor under them. */
export function TextCard({
	name,
	save,
	children,
}: {
	name: string;
	save: ReactNode;
	children: ReactNode;
}) {
	return (
		<Card className="flex min-w-0 flex-[2_1_320px] flex-col overflow-hidden">
			<Row>
				<span className="min-w-0 break-all font-mono font-semibold">{name}</span>
				{save}
			</Row>
			<div className="flex min-h-80 flex-1 flex-col border-t border-n-6 *:flex-1 *:rounded-none *:border-0">
				{children}
			</div>
		</Card>
	);
}

/** A picture and its text side by side: the picture left, the text right. */
export function Reader({ children }: { children: ReactNode }) {
	return <PageColumns className="items-stretch">{children}</PageColumns>;
}

/**
 * "Edit" of a header: it shows the text and puts the focus in it. `area` goes on the part that
 * holds the text field.
 */
export function useEdit(showText: () => void) {
	const area = useRef<HTMLDivElement>(null);
	const [asked, setAsked] = useState(0);
	useEffect(() => {
		if (asked) area.current?.querySelector<HTMLElement>("textarea, input")?.focus();
	}, [asked]);
	return {
		area,
		edit: () => {
			showText();
			setAsked((n) => n + 1);
		},
	};
}

/** The file name of a path. */
export const fileName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
