import { useState } from "react";
import {
	Prop,
	TicketComments,
	TicketDescription,
	TicketFields,
	TicketLabels,
	TicketTitle,
} from "@/features/sync/ticket-thread";
import { useRunActions } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { useResolvedRef } from "@/lib/refs";
import { RightButton, RightIconButton } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { useBacklogActions, useWorkItems } from "@/lib/sync";
import { memberName, useSuggestions, useTeam, useWorkActions, useWorkContext } from "@/lib/work";
import { Avatar } from "@/ui/atoms/avatar";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { StatusDot } from "@/ui/atoms/status-dot";
import { CpuChipIcon, LinkIcon, PlayIcon, XMarkIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { RefChip } from "@/ui/molecules/ref-chip";
import { SettingLink } from "@/ui/molecules/setting-link";
import { useGuard } from "./guard";
import { reasonsOf } from "./reasons";

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

/** A select in a property row: it fills the row and its text truncates, so it never runs past the drawer. */
const FILL = "w-full min-w-0 max-w-full shrink";

/**
 * One ticket in the inspector: its status, its assignee with the ranked members, the pickup mark
 * and the link to a local item. Each write is one click, and a missing capability names itself.
 */
export function TicketDetail({ itemKey }: { itemKey: string }) {
	const { t } = useI18n();
	const d = t.work.ticket;
	const items = useWorkItems({}).data ?? [];
	const item = items.find((i) => i.key === itemKey);
	const ctx = useWorkContext().data;
	const members = useTeam().data?.team.members ?? [];
	const suggestions = useSuggestions(itemKey).data ?? [];
	const act = useWorkActions();
	const { link, unlink } = useBacklogActions();
	const runs = useRunActions();
	const { failure, run } = useGuard();
	const [linking, setLinking] = useState(false);
	const [local, setLocal] = useState("");

	if (!item) return null;
	const caps = ctx?.capabilities;
	const missing = (cap: keyof NonNullable<typeof caps>) =>
		!caps
			? t.work.noTracker
			: caps[cap]
				? null
				: format(t.work.missing, { name: t.connections.flag[cap] });
	const assignReason = missing("assignee");
	const statusReason = missing("transitions");
	const markReason = missing("labels") ?? (ctx?.pickupLabel ? null : t.work.ticket.noLabel);
	const marked = ctx?.pickupLabel ? item.labels.includes(ctx.pickupLabel) : false;
	const eligible = marked && ctx?.me != null && item.member === ctx.me;
	const statuses = [...new Set(items.map((i) => i.status))];

	return (
		<div className="flex min-w-0 flex-col gap-4">
			<div className="flex flex-col gap-1">
				<span className="font-mono text-11 text-n-11">{item.key}</span>
				<TicketTitle itemKey={item.key} />
			</div>

			{/* One column in the order description, properties, comments; two columns when the drawer is wide. */}
			<div className="@container">
				<div className="grid gap-4 @xl:grid-cols-[minmax(0,1fr)_16rem]">
					<div className="min-w-0 @xl:col-start-1 @xl:row-start-1">
						<TicketDescription itemKey={item.key} />
					</div>
					<div className="flex min-w-0 flex-col divide-y divide-n-6 border-y @xl:col-start-2 @xl:row-span-2 @xl:row-start-1 @xl:self-start">
						<Prop label={t.sync.backlog.status}>
							<Select
								label={t.sync.backlog.status}
								className={FILL}
								value={item.status}
								onValueChange={(to) => void run(() => act.transition(item.key, to))}
								items={statuses.map((s) => ({ value: s, label: s }))}
								disabled={statusReason !== null}
							/>
							{statusReason ? <p className="text-12 text-n-11">{statusReason}</p> : null}
						</Prop>

						<Prop label={d.assignee}>
							{assignReason ? <p className="text-12 text-n-11">{assignReason}</p> : null}
							<div className="flex min-w-0 items-center gap-2">
								{item.member ? (
									<Avatar name={memberName(members, item.member)} className="size-5 text-11" />
								) : null}
								<Select
									label={d.assignee}
									className={FILL}
									value={item.member ?? ""}
									disabled={assignReason !== null}
									onValueChange={(handle) => {
										if (handle !== "" && handle !== item.member)
											void run(() => act.assign(item.key, handle));
									}}
									items={[
										...(item.member ? [] : [{ value: "", label: t.sync.backlog.unassigned }]),
										...suggestions.map((s) => ({
											value: s.handle,
											label: memberName(members, s.handle),
											hint: reasonsOf(s.reasons, t)
												.map((r) => r.text)
												.join(", "),
										})),
									]}
								/>
							</div>
							{item.assignee && !item.member ? (
								<p className="flex items-center gap-1.5 pt-1 text-12 text-n-11">
									<StatusDot status="warning" label={t.work.unknownMember} className="size-2" />
									{item.assignee}, {t.work.unknownMember}
								</p>
							) : null}
						</Prop>

						<Prop label={t.work.thread.labels}>
							<TicketLabels itemKey={item.key} />
						</Prop>

						<Prop label={d.agent}>
							<div className="flex flex-wrap items-center gap-2">
								<RightButton
									right="work.edit"
									disabled={markReason !== null || marked}
									onClick={() => void run(() => act.mark(item.key))}
								>
									<CpuChipIcon size={14} />
									{d.mark}
								</RightButton>
								<RightButton
									right="runs.start"
									onClick={() => void run(() => runs.start(item.key))}
								>
									<PlayIcon size={14} />
									{t.factory.start}
								</RightButton>
								{eligible ? (
									<span role="status" className="flex items-center gap-1.5 text-12">
										<StatusDot status="success" label={d.eligible} className="size-2" />
										{d.eligible}
									</span>
								) : null}
							</div>
							{markReason === d.noLabel ? (
								<SettingLink target="/settings/project#pickup-label">{markReason}</SettingLink>
							) : markReason ? (
								<p className="text-12 text-n-11">{markReason}</p>
							) : null}
						</Prop>

						<Prop label={d.linked}>
							{item.linked ? (
								<div className="flex items-center gap-1">
									<Linked id={item.linked} />
									<RightIconButton
										right="work.edit"
										label={t.sync.backlog.unlink}
										onClick={() => void run(() => unlink(item.linked ?? ""))}
									>
										<XMarkIcon size={14} />
									</RightIconButton>
								</div>
							) : linking ? (
								<form
									className="flex items-center gap-2"
									onSubmit={async (e) => {
										e.preventDefault();
										if (await run(() => link(local, item.key))) {
											setLinking(false);
											setLocal("");
										}
									}}
								>
									<Input
										label={t.sync.backlog.local}
										value={local}
										onChange={(e) => setLocal(e.target.value)}
										autoFocus
									/>
									<RightButton right="work.edit" type="submit" disabled={local.trim() === ""}>
										{t.sync.backlog.confirm}
									</RightButton>
								</form>
							) : (
								<div>
									<RightButton right="work.edit" onClick={() => setLinking(true)}>
										<LinkIcon size={14} />
										{t.sync.backlog.link}
									</RightButton>
								</div>
							)}
						</Prop>
						<TicketFields itemKey={item.key} />
					</div>
					<div className="min-w-0 @xl:col-start-1 @xl:row-start-2">
						<TicketComments itemKey={item.key} />
					</div>
				</div>
			</div>

			<ErrorNotice error={failure} />
		</div>
	);
}
