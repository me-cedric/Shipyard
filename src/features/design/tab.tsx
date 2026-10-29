import { Fragment, type ReactNode, useState } from "react";
import { message, useDesignList } from "@/lib/design";
import { useI18n } from "@/lib/i18n";
import { useActiveProject, useProjectActions } from "@/lib/projects";
import { useShell } from "@/lib/shell";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { FolderOpenIcon, PlusIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
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

/**
 * The frame of a Design tab: the list of artifacts, the new action, and the open one beside it.
 * Selecting a row puts its ref in the inspector, where the shell shows the backlinks (REQ-002).
 */
export function ArtifactTab({
	title,
	noun,
	rows,
	create,
	pinned,
	notice,
	children,
}: {
	title: string;
	noun: string;
	rows: Row[];
	/** A row that stays above the list, even when the list is empty. */
	pinned?: Row;
	/** A reason that the list is partial, such as a screens file that does not parse. */
	notice?: string | null;
	create: Create;
	children: (row: Row) => ReactNode;
}) {
	const { t } = useI18n();
	const active = useActiveProject().data;
	const list = useDesignList();
	const { openRef } = useShell();
	const { openFolder } = useProjectActions();
	const [selected, setSelected] = useState<string | null>(null);
	const [adding, setAdding] = useState(false);

	if (active === undefined) return null;
	if (active === null)
		return (
			<ListDetail title={title}>
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
	const all = pinned ? [pinned, ...rows] : rows;
	const open = all.find((r) => r.ref === selected);
	const add = () => setAdding(true);
	return (
		<ListDetail
			title={title}
			toolbar={
				<>
					<span className="flex-1" />
					{rows.length === 0 ? null : (
						<Button variant="primary" onClick={add}>
							<PlusIcon size={14} />
							{noun}
						</Button>
					)}
				</>
			}
		>
			{list.error || notice ? (
				<p role="alert" className="px-3 py-1 text-ui text-danger-text">
					{list.error ? message(list.error) : notice}
				</p>
			) : null}
			{rows.length === 0 && !pinned ? (
				<div className="p-4">
					<EmptyState action={{ label: noun, icon: <PlusIcon size={14} />, onClick: add }} />
				</div>
			) : (
				<div className="flex min-h-0 flex-1">
					<ul aria-label={title} className="w-80 shrink-0 overflow-auto border-r">
						{all.map((r) => (
							<li key={r.ref}>
								<button
									type="button"
									data-nav=""
									title={r.title}
									aria-current={r.ref === selected ? "true" : undefined}
									onClick={() => {
										setSelected(r.ref);
										openRef(r.ref);
									}}
									className={cn(
										"flex h-row w-full items-center gap-2 border-b px-3 text-left text-ui hover:bg-n-3",
										r.ref === selected && "bg-n-4",
									)}
								>
									{r.lead ? <span className="font-mono text-12 text-n-11">{r.lead}</span> : null}
									<span className="min-w-0 flex-1 truncate">{r.title}</span>
									{r.issue ? <Badge variant="danger">{t.design.unreadable}</Badge> : null}
									{r.tag ? <Badge>{r.tag}</Badge> : null}
								</button>
							</li>
						))}
						{rows.length === 0 ? (
							<li className="p-3">
								<EmptyState action={{ label: noun, icon: <PlusIcon size={14} />, onClick: add }} />
							</li>
						) : null}
					</ul>
					<div className="flex min-w-0 flex-1 flex-col overflow-auto p-3">
						{open ? <Fragment key={open.ref}>{children(open)}</Fragment> : null}
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
						openRef(ref);
					}}
				/>
			) : null}
		</ListDetail>
	);
}
