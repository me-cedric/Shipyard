import type { VariantProps } from "class-variance-authority";
import { motion } from "motion/react";
import { Fragment, type ReactNode, useState } from "react";
import { message, useDesignList } from "@/lib/design";
import { useI18n } from "@/lib/i18n";
import { copyText, useMenus } from "@/lib/menus";
import { useActiveProject, useProjectActions } from "@/lib/projects";
import { useFormIntent, useShell } from "@/lib/shell";
import { useTabSelection } from "@/lib/shell/selection";
import { cn } from "@/lib/utils";
import { Badge, type badgeVariants } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { FolderOpenIcon, PlusIcon, QueueListIcon, ViewColumnsIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ViewTabs } from "@/ui/molecules/view-tabs";
import { LIST, useEnter } from "@/ui/motion";
import { Dialog } from "@/ui/organisms/dialog";
import { ListDetail } from "@/ui/templates/list-detail";

/** One line of the list of a tab. `lead` is the number of an ADR. */
export type Row = {
	/** The ref of the artifact. It is also the key of the row. */
	ref: string;
	title: string;
	lead?: string;
	tag?: string | null;
	/** Why the file cannot be read. */
	issue?: string | null;
	/** The tint of the tag chip: the status of an ADR. */
	tone?: VariantProps<typeof badgeVariants>["variant"];
	/** A date under the title on the time line, already formatted. */
	time?: string;
	/** The repository path of the file, for the copy action of the menu. */
	path?: string;
};

export type Create = {
	/** The formats to pick from, or none. */
	formats?: { value: string; label: string }[];
	/** Creates the artifact and returns its ref. */
	run: (name: string, format: string) => Promise<string | undefined>;
};

function NewDialog({
	noun,
	create,
	onClose,
	onCreated,
}: {
	noun: string;
	create: Create;
	onClose: () => void;
	onCreated: (ref: string | undefined) => void;
}) {
	const { t } = useI18n();
	const [name, setName] = useState("");
	const [format, setFormat] = useState(create.formats?.[0]?.value ?? "");
	const [error, setError] = useState<string | null>(null);
	const submit = async () => {
		try {
			setError(null);
			onCreated(await create.run(name.trim(), format));
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
						value={format}
						onValueChange={setFormat}
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

/** The dot of a row on the timeline, in the colour of its tag. */
const DOT: Record<NonNullable<Row["tone"]>, string> = {
	neutral: "bg-n-8",
	accent: "bg-accent",
	success: "bg-success",
	warning: "bg-warning",
	danger: "bg-danger",
	info: "bg-info",
};

/**
 * The frame of a Design tab: the page header with the new action, the list of artifacts and the
 * open one on a large canvas beside it. `thumb` adds a grid of thumbnails; `timeline` draws the
 * rows on a time line. Selecting a row puts its ref in the inspector, where the shell shows the
 * backlinks (REQ-002).
 */
export function ArtifactTab({
	title,
	icon,
	noun,
	rows,
	create,
	pinned,
	notice,
	thumb,
	timeline,
	toolbar,
	form = "",
	children,
}: {
	title: string;
	/** The name of the create form that a link can open (Get started). */
	form?: string;
	icon: ReactNode;
	noun: string;
	rows: Row[];
	/** A row that stays above the list, even when the list is empty. */
	pinned?: Row;
	/** A reason that the list is partial, such as a screens file that does not parse. */
	notice?: string | null;
	create: Create;
	/** The face of a row in the grid view. Without it the tab has no grid. */
	thumb?: (row: Row) => ReactNode;
	timeline?: boolean;
	/** A row of controls under the header, such as an Export menu. */
	toolbar?: ReactNode;
	children: (row: Row) => ReactNode;
}) {
	const { t } = useI18n();
	const active = useActiveProject().data;
	const list = useDesignList();
	const { openRef } = useShell();
	const { openFolder } = useProjectActions();
	const menu = useMenus();
	const all = pinned ? [pinned, ...rows] : rows;
	// The first artifact opens by default, and the choice stays with the tab.
	const [selected, setSelected] = useTabSelection(
		`design:${title}`,
		all.map((r) => r.ref),
	);
	const [adding, setAdding] = useState(false);
	useFormIntent(form, () => setAdding(true));
	const [view, setView] = useState<"list" | "grid">("list");
	const enter = useEnter();

	if (active === undefined) return null;
	if (active === null)
		return (
			<ListDetail title={title} icon={icon}>
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
	if (list.isLoading) return null;
	const open = all.find((r) => r.ref === selected);
	const add = () => setAdding(true);
	const pick = (ref: string) => {
		setSelected(ref);
		setView("list");
		openRef(ref);
	};
	const rowMenu = (r: Row) =>
		menu(r.ref.startsWith("adr:") ? "adr" : "ref", {
			open: () => pick(r.ref),
			"copy-ref": () => copyText(r.ref),
			"copy-path": r.path ? () => copyText(r.path as string) : undefined,
		});
	return (
		<ListDetail
			title={title}
			icon={icon}
			count={rows.length}
			toolbar={toolbar}
			chips={
				thumb && rows.length ? (
					<ViewTabs
						label={title}
						value={view}
						onValueChange={setView}
						tabs={[
							{ value: "list", label: t.design.view.list, icon: <QueueListIcon size={12} /> },
							{ value: "grid", label: t.design.view.grid, icon: <ViewColumnsIcon size={12} /> },
						]}
					/>
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
			{list.error || notice ? (
				<p role="alert" className="px-4 pb-2 text-ui text-danger-text">
					{list.error ? message(list.error) : notice}
				</p>
			) : null}
			{rows.length === 0 && !pinned ? (
				<div className="p-4">
					<EmptyState action={{ label: noun, icon: <PlusIcon size={14} />, onClick: add }} />
				</div>
			) : view === "grid" && thumb ? (
				<motion.ul
					aria-label={title}
					variants={LIST}
					initial={enter}
					animate="shown"
					className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3 overflow-auto px-4 pt-1 pb-4"
				>
					{rows.map((r) => (
						<li key={r.ref}>
							<ContextMenu items={rowMenu(r)}>
								<Card interactive className="overflow-hidden p-0">
									<button
										type="button"
										title={r.title}
										onClick={() => pick(r.ref)}
										className="flex w-full flex-col rounded-lg text-left"
									>
										<span className="flex h-32 items-center justify-center border-b bg-surface-1 bg-dots">
											{thumb(r)}
										</span>
										<span className="flex h-10 items-center gap-2 px-3 text-ui">
											<span className="min-w-0 flex-1 truncate text-n-12">{r.title}</span>
											{r.issue ? <Badge variant="danger">{t.design.unreadable}</Badge> : null}
											{r.tag ? <Badge variant={r.tone}>{r.tag}</Badge> : null}
										</span>
									</button>
								</Card>
							</ContextMenu>
						</li>
					))}
				</motion.ul>
			) : (
				<div className="flex min-h-0 flex-1 gap-3 px-4 pt-1 pb-4">
					<ul
						aria-label={title}
						className="flex w-72 shrink-0 flex-col gap-0.5 overflow-auto rounded-lg border bg-surface-1 p-1.5 shadow-1"
					>
						{all.map((r) => (
							<li
								key={r.ref}
								className={cn(
									"relative",
									// One segment of the time line per row, cut at the first and the last dot.
									timeline &&
										"before:absolute before:inset-y-0 before:left-[11.5px] before:w-px before:bg-n-7 first:before:top-4.5 last:before:bottom-auto last:before:h-4.5",
								)}
							>
								<ContextMenu items={rowMenu(r)}>
									<button
										type="button"
										data-nav=""
										title={r.title}
										aria-current={r.ref === selected ? "true" : undefined}
										onClick={() => pick(r.ref)}
										className={cn(
											"flex min-h-row w-full items-center gap-2 rounded-md px-2 py-1 text-left text-ui text-n-12 transition-colors duration-(--duration-fast) hover:bg-n-3",
											r.ref === selected && "bg-accent-soft",
										)}
									>
										{timeline ? (
											<span
												aria-hidden="true"
												className={cn(
													"z-10 mt-2.5 size-2 shrink-0 self-start rounded-full ring-4 ring-surface-1",
													DOT[r.tone ?? "neutral"],
												)}
											/>
										) : null}
										{timeline ? (
											<span className="flex min-w-0 flex-1 flex-col gap-1 py-1">
												<span className="flex items-center gap-2">
													<span className="font-mono text-12 text-n-11">{r.lead}</span>
													<span className="min-w-0 flex-1 truncate">{r.title}</span>
												</span>
												<span className="flex items-center gap-2">
													{r.tag ? <Badge variant={r.tone}>{r.tag}</Badge> : null}
													<span className="font-mono text-11 text-n-11">{r.time}</span>
												</span>
											</span>
										) : (
											<>
												{r.lead ? (
													<span className="font-mono text-12 text-n-11">{r.lead}</span>
												) : null}
												<span className="min-w-0 flex-1 truncate">{r.title}</span>
												{r.issue ? <Badge variant="danger">{t.design.unreadable}</Badge> : null}
												{r.tag ? <Badge variant={r.tone}>{r.tag}</Badge> : null}
											</>
										)}
									</button>
								</ContextMenu>
							</li>
						))}
						{rows.length === 0 ? (
							<li className="p-3">
								<EmptyState action={{ label: noun, icon: <PlusIcon size={14} />, onClick: add }} />
							</li>
						) : null}
					</ul>
					<div className="flex min-w-0 flex-1 flex-col overflow-auto rounded-lg border bg-surface-1 p-3 shadow-1">
						{open ? (
							<Fragment key={open.ref}>{children(open)}</Fragment>
						) : (
							<div aria-hidden="true" className="flex-1 rounded-md bg-dots mask-radial-from-20%" />
						)}
					</div>
				</div>
			)}
			{adding ? (
				<NewDialog
					noun={noun}
					create={create}
					onClose={() => setAdding(false)}
					onCreated={(ref) => {
						if (!ref) return;
						setSelected(ref);
						setView("list");
						openRef(ref);
					}}
				/>
			) : null}
		</ListDetail>
	);
}
