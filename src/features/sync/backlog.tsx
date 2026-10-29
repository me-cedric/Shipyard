import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { useActiveProject, useProjectActions } from "@/lib/projects";
import { useResolvedRef } from "@/lib/refs";
import { useShell } from "@/lib/shell";
import { useBacklogActions, useWorkItems, type WorkItem } from "@/lib/sync";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { FolderOpenIcon, LinkIcon, PlusIcon, XMarkIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { FilterBar } from "@/ui/molecules/filter-bar";
import { RefChip } from "@/ui/molecules/ref-chip";
import { type WorkCategory, WorkItemRow } from "@/ui/molecules/work-item-row";

const ALL = "all";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The local item that a ticket is linked to, as a chip that opens the inspector. */
function Linked({ id }: { id: string }) {
	const { openRef } = useShell();
	const r = useResolvedRef(id).data;
	return (
		<RefChip
			refId={id}
			state={r?.state ?? "unresolved"}
			title={r?.title ?? undefined}
			onOpen={openRef}
		/>
	);
}

function Row({ item, onError }: { item: WorkItem; onError: (e: string | null) => void }) {
	const { t } = useI18n();
	const { link, unlink } = useBacklogActions();
	const [linking, setLinking] = useState(false);
	const [local, setLocal] = useState("");

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			onError(null);
			await link(local, item.key);
			setLinking(false);
			setLocal("");
		} catch (err) {
			onError(message(err));
		}
	};

	return (
		<WorkItemRow
			itemKey={item.key}
			title={item.title}
			status={item.status}
			category={item.category as WorkCategory}
			assignee={item.assignee ?? undefined}
			claimed={item.claimed ? t.sync.backlog.claimed : undefined}
			linked={item.linked ? <Linked id={item.linked} /> : undefined}
			actions={
				item.linked ? (
					<IconButton
						label={t.sync.backlog.unlink}
						onClick={() => void unlink(item.linked ?? "").catch((err) => onError(message(err)))}
					>
						<XMarkIcon size={14} />
					</IconButton>
				) : (
					<IconButton label={t.sync.backlog.link} onClick={() => setLinking(!linking)}>
						<LinkIcon size={14} />
					</IconButton>
				)
			}
		>
			{linking ? (
				<form className="flex items-center gap-2 px-3 pb-2" onSubmit={submit}>
					<Input
						label={t.sync.backlog.local}
						value={local}
						onChange={(e) => setLocal(e.target.value)}
						className="w-64"
					/>
					<Button type="submit" variant="secondary" disabled={local.trim() === ""}>
						{t.sync.backlog.confirm}
					</Button>
				</form>
			) : null}
		</WorkItemRow>
	);
}

/** Work / Backlog: the mirror of the tracker, with import, adopt and link (`add-sync` REQ-015). */
export function Backlog() {
	const { t } = useI18n();
	const active = useActiveProject().data;
	const { openFolder } = useProjectActions();
	const { planImport, confirmImport, adopt } = useBacklogActions();
	const [query, setQuery] = useState("");
	const [status, setStatus] = useState(ALL);
	const [planned, setPlanned] = useState<number | null>(null);
	const [key, setKey] = useState("");
	const [error, setError] = useState<string | null>(null);
	const everything = useWorkItems({});
	const shown = useWorkItems({ text: query, status: status === ALL ? null : status });

	if (active === undefined || everything.isLoading) return null;
	const guard = async (job: () => Promise<unknown>) => {
		try {
			setError(null);
			await job();
		} catch (e) {
			setError(message(e));
		}
	};
	const startImport = () => guard(async () => setPlanned(await planImport()));
	const statuses = [...new Set((everything.data ?? []).map((i) => i.status))].sort();
	const rows = shown.data ?? [];

	if (active === null)
		return (
			<div className="p-4">
				<h1 className="sr-only">{t.tabs.work.backlog}</h1>
				<EmptyState
					action={{
						label: t.projects.open,
						icon: <FolderOpenIcon size={14} />,
						onClick: () => void openFolder(),
					}}
				/>
			</div>
		);

	const empty = (everything.data ?? []).length === 0 && planned === null;
	return (
		<div className="flex max-w-3xl flex-col gap-4 p-4">
			<h1 className="sr-only">{t.tabs.work.backlog}</h1>
			{empty ? (
				<EmptyState
					action={{
						label: t.sync.backlog.import,
						icon: <PlusIcon size={14} />,
						onClick: () => void startImport(),
					}}
				/>
			) : (
				<>
					<div className="flex flex-wrap items-center gap-2">
						{planned === null ? (
							<Button variant="primary" onClick={() => void startImport()}>
								{t.sync.backlog.import}
							</Button>
						) : (
							<>
								<p role="status" className="text-ui">
									{format(t.sync.backlog.openTickets, { count: planned })}
								</p>
								<Button
									variant="primary"
									onClick={() =>
										void guard(async () => {
											await confirmImport();
											setPlanned(null);
										})
									}
								>
									{t.sync.backlog.confirm}
								</Button>
								<Button variant="ghost" onClick={() => setPlanned(null)}>
									{t.sync.backlog.cancel}
								</Button>
							</>
						)}
						<form
							className="flex items-center gap-2"
							onSubmit={(e) => {
								e.preventDefault();
								void guard(async () => {
									await adopt(key);
									setKey("");
								});
							}}
						>
							<Input
								label={t.sync.backlog.key}
								value={key}
								onChange={(e) => setKey(e.target.value)}
								className="w-40"
							/>
							<Button type="submit" variant="secondary" disabled={key.trim() === ""}>
								{t.sync.backlog.adopt}
							</Button>
						</form>
					</div>
					<div className="flex items-center gap-2">
						<FilterBar
							query={query}
							onQueryChange={setQuery}
							filters={[]}
							active={[]}
							onToggle={() => {}}
						/>
						<Select
							label={t.sync.backlog.status}
							value={status}
							onValueChange={setStatus}
							items={[
								{ value: ALL, label: t.sync.backlog.allStatuses },
								...statuses.map((s) => ({ value: s, label: s })),
							]}
						/>
					</div>
				</>
			)}
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
			{rows.length > 0 ? (
				<section aria-labelledby="backlog-items">
					<h2 id="backlog-items" className="px-3 py-1 text-12 font-medium text-n-11">
						{format(t.count, { name: t.tabs.work.backlog, count: rows.length })}
					</h2>
					{rows.map((item) => (
						<Row key={item.key} item={item} onError={setError} />
					))}
				</section>
			) : null}
		</div>
	);
}
