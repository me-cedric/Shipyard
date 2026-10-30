import { motion } from "motion/react";
import { Fragment, type ReactNode, useState } from "react";
import { NoProject } from "@/features/work/no-project";
import { format, useI18n } from "@/lib/i18n";
import type { PageEntry } from "@/lib/ipc";
import { message, slug, useCreateDoc } from "@/lib/knowledge";
import { useActiveProject } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { PlusIcon, Squares2X2Icon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { EmptyState } from "@/ui/molecules/empty-state";
import { LIST, useEnter } from "@/ui/motion";
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
 * The frame of a Knowledge view of files: the page header with the one primary action, the page
 * tree in a panel and the open file on a panel beside it. With `thumb`, the files show first as a
 * grid of cards. A row opens its `doc:<path>` entity in the inspector (REQ-025).
 */
export function ListTab({
	title,
	icon,
	noun,
	nameLabel,
	base,
	rows,
	template,
	toolbar,
	notice,
	thumb,
	children,
}: {
	title: string;
	icon: ReactNode;
	/** The label of the one primary action. */
	noun: string;
	nameLabel: string;
	/** The repository folder of the files. */
	base: string;
	/** `undefined` while the list loads: the view shows nothing, not the empty state. */
	rows: PageEntry[] | undefined;
	/** The text of a new file, from its name. */
	template: (name: string) => string;
	/** Secondary content under the header: a strip of figures or exports. */
	toolbar?: ReactNode;
	/** The result of a secondary action. */
	notice?: ReactNode;
	/** The face of a file in the grid. Without it the tab has no grid. */
	thumb?: (row: PageEntry) => ReactNode;
	children: (row: PageEntry) => ReactNode;
}) {
	const { t } = useI18n();
	const active = useActiveProject().data;
	const { openRef } = useShell();
	const createDoc = useCreateDoc();
	const enter = useEnter();
	const [selected, setSelected] = useState<string | null>(null);
	const [adding, setAdding] = useState(false);
	if (active === undefined) return null;
	if (active === null) return <NoProject title={title} />;
	if (!rows) return null;
	const open = rows.find((r) => r.path === selected);
	const add = () => setAdding(true);
	const pick = (path: string) => {
		setSelected(path);
		openRef(`doc:${path}`);
	};

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
				onClick={() => pick(r.path)}
				className={cn(
					"flex h-row w-full items-center gap-2 rounded-md px-2 text-left text-ui text-n-12 transition-colors duration-(--duration-fast) hover:bg-n-3",
					r.path === selected && "bg-accent-soft",
				)}
			>
				<span className="min-w-0 flex-1 truncate">{r.title}</span>
			</button>
		</li>
	);
	return (
		<ListDetail
			title={title}
			icon={icon}
			count={rows.length}
			chips={
				open && thumb ? (
					<Button variant="ghost" onClick={() => setSelected(null)}>
						<Squares2X2Icon size={14} />
						{t.design.view.grid}
					</Button>
				) : undefined
			}
			action={
				rows.length === 0 ? undefined : (
					<Button variant="primary" onClick={add}>
						<PlusIcon size={14} />
						{noun}
					</Button>
				)
			}
		>
			{toolbar ? <div className="px-4 pb-3">{toolbar}</div> : null}
			{notice}
			{rows.length === 0 ? (
				<div className="p-4">
					<EmptyState
						layout={thumb ? "cards" : "rows"}
						action={{ label: noun, icon: <PlusIcon size={14} />, onClick: add }}
					/>
				</div>
			) : thumb && !open ? (
				<motion.ul
					aria-label={title}
					variants={LIST}
					initial={enter}
					animate="shown"
					className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3 overflow-auto px-4 pt-1 pb-4"
				>
					{rows.map((r) => (
						<li key={r.path}>
							<Card interactive className="overflow-hidden p-0">
								<button
									type="button"
									data-nav=""
									title={r.path}
									onClick={() => pick(r.path)}
									className="flex w-full flex-col rounded-lg text-left"
								>
									<span aria-hidden="true" className="block border-b bg-surface-1 p-3">
										{thumb(r)}
									</span>
									<span className="flex h-10 items-center px-3 text-ui text-n-12">
										<span className="min-w-0 flex-1 truncate">{r.title}</span>
									</span>
								</button>
							</Card>
						</li>
					))}
				</motion.ul>
			) : (
				<div className="flex min-h-0 flex-1 gap-3 px-4 pt-1 pb-4">
					<nav
						aria-label={title}
						className="flex w-64 shrink-0 flex-col gap-2 overflow-auto rounded-lg border bg-surface-1 p-1.5 shadow-1"
					>
						{[...groups].map(([dir, list]) => (
							<Fragment key={dir}>
								{dir ? (
									<section aria-label={dir}>
										<h2 className="px-2 pt-1 pb-0.5 text-12 font-medium text-n-11">
											{format(t.count, { name: dir, count: list.length })}
										</h2>
										<ul className="flex flex-col gap-0.5">{list.map(line)}</ul>
									</section>
								) : (
									<ul className="flex flex-col gap-0.5">{list.map(line)}</ul>
								)}
							</Fragment>
						))}
					</nav>
					<div className="@container flex min-w-0 flex-1 flex-col overflow-auto rounded-lg border bg-surface-1 p-3 shadow-1">
						{open ? (
							<Fragment key={open.path}>{children(open)}</Fragment>
						) : (
							<div aria-hidden="true" className="flex-1 rounded-md bg-dots mask-radial-from-20%" />
						)}
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
						pick(path);
					}}
				/>
			) : null}
		</ListDetail>
	);
}
