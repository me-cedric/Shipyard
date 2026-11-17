import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { connectTarget } from "@/features/onboarding/checklist";
import { connectionKeys } from "@/features/settings/connections/keys";
import { NameDialog } from "@/features/specs/name-dialog";
import { TicketDialog } from "@/features/specs/ticket-dialog";
import { type Filters, ItemFilters } from "@/features/work/filters";
import { useGuard } from "@/features/work/guard";
import { useOpenSetting } from "@/lib/errors";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { projectKeys } from "@/lib/projects";
import { RightButton, RightIconButton } from "@/lib/rights";
import { askForm, useFormIntent } from "@/lib/shell";
import { useSpecsActions } from "@/lib/specs";
import { useBacklogActions, type WorkItem } from "@/lib/sync";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { LinkIcon, PlusIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { Terms } from "@/ui/molecules/term";

/** The address of the page of a feature, found by the ref of one of its parts. */
export const useGoFeature = () => {
	const navigate = useNavigate();
	return (ref: string, section?: "brief") =>
		void navigate({
			to: "/flow/feature/$featureId",
			params: { featureId: ref },
			search: section ? { section } : {},
		});
};

/**
 * The controls of Flow / List that are not about one row: the filters of the tickets, Bring a ticket
 * by its key, Import with Confirm, New change and From a ticket. The empty states of the backlog
 * (no issue tracker, no ticket) stay here, too.
 */
export function ListControls({
	items,
	loading,
	loadError,
	filters,
	onFilters,
}: {
	items: WorkItem[];
	loading: boolean;
	loadError: unknown;
	filters: Filters;
	onFilters: (next: Filters) => void;
}) {
	const { t } = useI18n();
	const go = useGoFeature();
	const act = useSpecsActions();
	const qc = useQueryClient();
	const { planImport, confirmImport, adopt } = useBacklogActions();
	const { failure, busy, run } = useGuard();
	const openSetting = useOpenSetting();
	const [planned, setPlanned] = useState<number | null>(null);
	const [bringing, setBringing] = useState(false);
	const [key, setKey] = useState("");
	const [creating, setCreating] = useState(false);
	const [fromTicket, setFromTicket] = useState(false);
	useFormIntent("change", () => setCreating(true));
	// Get started asks to assign: the first ticket without an assignee opens on its page, with its assignee field.
	useFormIntent(
		"assign",
		() => {
			const item = items.find((i) => !i.assignee);
			if (item) go(`wi:${item.key}`, "brief");
		},
		!loading,
	);
	// The same cache as Settings / Project. A project without a linked issue tracker has nothing to import.
	const settings = useQuery({
		queryKey: projectKeys.settings,
		queryFn: () => unwrap(commands.projectSettings()),
	}).data;
	const connections = useQuery({
		queryKey: connectionKeys.list,
		queryFn: () => unwrap(commands.connectionsList()),
	}).data;
	const startImport = () => run(async () => setPlanned(await planImport()));
	const noTickets = items.length === 0 && planned === null;
	const empty = !loading && noTickets;
	return (
		<>
			<div className="flex shrink-0 flex-wrap items-center gap-3">
				<ItemFilters
					items={items}
					value={filters}
					onChange={onFilters}
					fields={["status", "assignee", "label", "run"]}
				/>
				<span className="flex-1" />
				{bringing ? (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							void run(async () => {
								await adopt(key);
								await qc.invalidateQueries({ queryKey: ["features"] });
								setKey("");
								setBringing(false);
							});
						}}
						onKeyDown={(e) => e.key === "Escape" && setBringing(false)}
					>
						<Input
							label={t.sync.backlog.key}
							value={key}
							onChange={(e) => setKey(e.target.value)}
							className="w-36"
							autoFocus
						/>
					</form>
				) : (
					<RightIconButton
						right="work.edit"
						label={t.flow.bring}
						className="min-h-control"
						onClick={() => setBringing(true)}
					>
						<PlusIcon size={14} />
					</RightIconButton>
				)}
				{planned === null ? (
					noTickets ? null : (
						<RightButton
							right="work.edit"
							className="min-h-control"
							busy={busy}
							onClick={() => void startImport()}
						>
							{t.sync.backlog.import}
						</RightButton>
					)
				) : (
					<>
						<p role="status" className="text-ui">
							{format(t.sync.backlog.openTickets, { count: planned })}
						</p>
						<RightButton
							right="work.edit"
							variant="primary"
							className="min-h-control"
							busy={busy}
							onClick={() =>
								void run(async () => {
									await confirmImport();
									await qc.invalidateQueries({ queryKey: ["features"] });
									setPlanned(null);
								})
							}
						>
							{t.sync.backlog.confirm}
						</RightButton>
						<Button variant="ghost" className="min-h-control" onClick={() => setPlanned(null)}>
							{t.sync.backlog.cancel}
						</Button>
					</>
				)}
				<Button className="min-h-control" onClick={() => setFromTicket(true)}>
					{t.specs.fromTicket}
				</Button>
				<RightButton right="specs.edit" className="min-h-control" onClick={() => setCreating(true)}>
					<PlusIcon size={14} />
					{t.specs.newChange}
				</RightButton>
			</div>
			<ErrorNotice error={failure} className="w-full" />
			{empty ? (
				<div className="p-2">
					{loadError ? (
						<ErrorNotice error={loadError} className="justify-center" />
					) : settings && !settings.file?.connections?.tracker ? (
						<EmptyState
							title={<Terms>{t.glossary.noTracker}</Terms>}
							icon={<LinkIcon size={28} />}
							action={{
								label: t.glossary.connectTracker,
								icon: <LinkIcon size={14} />,
								onClick: () => {
									const to = connectTarget(
										"tracker",
										connections?.some((c) => c.group === "tracker"),
									);
									if (to.form) askForm(to.form);
									openSetting(to.hash ? `${to.to}#${to.hash}` : to.to);
								},
							}}
						/>
					) : (
						<EmptyState
							title={t.empty.tickets}
							action={{
								label: t.sync.backlog.import,
								icon: <PlusIcon size={14} />,
								onClick: () => void startImport(),
								busy,
							}}
						/>
					)}
				</div>
			) : null}
			{fromTicket ? (
				<TicketDialog
					onOpen={(c) => {
						setFromTicket(false);
						void qc.invalidateQueries({ queryKey: ["features"] });
						go(`change:${c.id}`, "brief");
					}}
					onClose={() => setFromTicket(false)}
				/>
			) : null}
			{creating ? (
				<NameDialog
					title={t.specs.newChange}
					label={t.specs.changeId}
					onCreate={async (id) => {
						const c = await act.createChange(id);
						await qc.invalidateQueries({ queryKey: ["features"] });
						go(`change:${c.id}`, "brief");
					}}
					onClose={() => setCreating(false)}
				/>
			) : null}
		</>
	);
}
