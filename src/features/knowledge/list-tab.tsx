import { Fragment, type ReactNode, useState } from "react";
import { NoProject } from "@/features/work/no-project";
import { useI18n } from "@/lib/i18n";
import type { PageEntry } from "@/lib/ipc";
import { message, slug, useCreateDoc } from "@/lib/knowledge";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { PlusIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { GroupSection } from "@/ui/molecules/group-section";
import { Dialog } from "@/ui/organisms/dialog";
import { ListDetail } from "@/ui/templates/list-detail";

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
	const [error, setError] = useState<string | null>(null);
	const submit = async () => {
		try {
			setError(null);
			await create(name.trim());
			onClose();
		} catch (e) {
			setError(message(e));
		}
	};
	return (
		<Dialog
			open
			onOpenChange={(open) => !open && onClose()}
			title={noun}
			actions={
				<Button variant="primary" disabled={!name.trim()} onClick={() => void submit()}>
					{t.design.create}
				</Button>
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
 * The frame of a Knowledge view of files: the page tree, the one primary action to create a file,
 * and the open file beside the tree. A row opens its `doc:<path>` entity in the inspector (REQ-025).
 */
export function ListTab({
	title,
	noun,
	nameLabel,
	base,
	rows,
	template,
	toolbar,
	notice,
	children,
}: {
	title: string;
	/** The label of the one primary action. */
	noun: string;
	nameLabel: string;
	/** The repository folder of the files. */
	base: string;
	/** `undefined` while the list loads: the view shows nothing, not the empty state. */
	rows: PageEntry[] | undefined;
	/** The text of a new file, from its name. */
	template: (name: string) => string;
	/** Secondary actions, left of the primary one. */
	toolbar?: ReactNode;
	/** The result of a secondary action. */
	notice?: ReactNode;
	children: (row: PageEntry) => ReactNode;
}) {
	const active = useActiveProject().data;
	const { openRef } = useShell();
	const createDoc = useCreateDoc();
	const [selected, setSelected] = useState<string | null>(null);
	const [adding, setAdding] = useState(false);
	if (active === undefined) return null;
	if (active === null) return <NoProject title={title} />;
	if (!rows) return null;
	const open = rows.find((r) => r.path === selected);
	const add = () => setAdding(true);

	// A folder is a group. A page at the root has no heading.
	const groups = new Map<string, PageEntry[]>();
	for (const r of rows) {
		const rel = r.path.slice(base.length + 1);
		const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
		groups.set(dir, [...(groups.get(dir) ?? []), r]);
	}
	const line = (r: PageEntry) => (
		<li key={r.path}>
			<button
				type="button"
				data-nav=""
				title={r.path}
				aria-current={r.path === selected ? "true" : undefined}
				onClick={() => {
					setSelected(r.path);
					openRef(`doc:${r.path}`);
				}}
				className={cn(
					"flex h-row w-full items-center gap-2 border-b px-3 text-left text-ui hover:bg-n-3",
					r.path === selected && "bg-n-4",
				)}
			>
				<span className="min-w-0 flex-1 truncate">{r.title}</span>
			</button>
		</li>
	);
	return (
		<ListDetail
			title={title}
			toolbar={
				<>
					<span className="flex-1" />
					{toolbar}
					{rows.length === 0 ? null : (
						<Button variant="primary" onClick={add}>
							<PlusIcon size={14} />
							{noun}
						</Button>
					)}
				</>
			}
		>
			{notice}
			{rows.length === 0 ? (
				<div className="p-4">
					<EmptyState action={{ label: noun, icon: <PlusIcon size={14} />, onClick: add }} />
				</div>
			) : (
				<div className="flex min-h-0 flex-1">
					<nav aria-label={title} className="w-72 shrink-0 overflow-auto border-r">
						{[...groups].map(([dir, list]) => (
							<Fragment key={dir}>
								{dir ? (
									<GroupSection name={dir} count={list.length}>
										<ul>{list.map(line)}</ul>
									</GroupSection>
								) : (
									<ul>{list.map(line)}</ul>
								)}
							</Fragment>
						))}
					</nav>
					<div className="flex min-w-0 flex-1 flex-col overflow-auto p-3">
						{open ? <Fragment key={open.path}>{children(open)}</Fragment> : null}
					</div>
				</div>
			)}
			{adding ? (
				<NewDialog
					noun={noun}
					nameLabel={nameLabel}
					onClose={() => setAdding(false)}
					create={async (name) => {
						const path = `${base}/${slug(name)}.md`;
						await createDoc(path, template(name));
						setSelected(path);
						openRef(`doc:${path}`);
					}}
				/>
			) : null}
		</ListDetail>
	);
}
