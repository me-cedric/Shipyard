import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { useResolvedRef } from "@/lib/refs";
import { useShell } from "@/lib/shell";
import { useBacklogActions, useWorkItems } from "@/lib/sync";
import { memberName, useSuggestions, useTeam, useWorkActions, useWorkContext } from "@/lib/work";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";
import { StatusDot } from "@/ui/atoms/status-dot";
import { CpuChipIcon, LinkIcon, XMarkIcon } from "@/ui/icons";
import { SuggestionRow } from "@/ui/molecules/member-row";
import { RefChip } from "@/ui/molecules/ref-chip";
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
	const { error, run } = useGuard();
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
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-1">
				<span className="font-mono text-11 text-n-11">{item.key}</span>
				<p className="text-ui font-medium">{item.title}</p>
				{item.labels.length > 0 ? (
					<div className="flex flex-wrap gap-1">
						{item.labels.map((l) => (
							<Badge key={l}>{l}</Badge>
						))}
					</div>
				) : null}
			</div>

			<section className="flex flex-col gap-1">
				<h3 className="text-12 font-medium text-n-11">{t.sync.backlog.status}</h3>
				<Select
					label={t.sync.backlog.status}
					value={item.status}
					onValueChange={(to) => void run(() => act.transition(item.key, to))}
					items={statuses.map((s) => ({ value: s, label: s }))}
					disabled={statusReason !== null}
				/>
				{statusReason ? <p className="text-12 text-n-11">{statusReason}</p> : null}
			</section>

			<section className="flex flex-col">
				<h3 className="pb-1 text-12 font-medium text-n-11">{d.assignee}</h3>
				{assignReason ? <p className="pb-1 text-12 text-n-11">{assignReason}</p> : null}
				{suggestions.map((s) => {
					const name = memberName(members, s.handle);
					const current = item.member === s.handle;
					return (
						<SuggestionRow
							key={s.handle}
							name={name}
							current={current}
							reasons={reasonsOf(s.reasons, t)}
							action={
								<Button
									variant="ghost"
									disabled={assignReason !== null || current}
									aria-label={format(d.assign, { name })}
									onClick={() => void run(() => act.assign(item.key, s.handle))}
								>
									{d.assignShort}
								</Button>
							}
						/>
					);
				})}
				{item.assignee && !item.member ? (
					<p className="flex items-center gap-1.5 pt-1 text-12 text-n-11">
						<StatusDot status="warning" label={t.work.unknownMember} className="size-2" />
						{item.assignee}, {t.work.unknownMember}
					</p>
				) : null}
			</section>

			<section className="flex flex-col gap-1">
				<h3 className="text-12 font-medium text-n-11">{d.agent}</h3>
				<div className="flex items-center gap-2">
					<Button
						disabled={markReason !== null || marked}
						onClick={() => void run(() => act.mark(item.key))}
					>
						<CpuChipIcon size={14} />
						{d.mark}
					</Button>
					{eligible ? (
						<span role="status" className="flex items-center gap-1.5 text-12">
							<StatusDot status="success" label={d.eligible} className="size-2" />
							{d.eligible}
						</span>
					) : null}
				</div>
				{markReason ? <p className="text-12 text-n-11">{markReason}</p> : null}
			</section>

			<section className="flex flex-col gap-1">
				<h3 className="text-12 font-medium text-n-11">{d.linked}</h3>
				{item.linked ? (
					<div className="flex items-center gap-1">
						<Linked id={item.linked} />
						<IconButton
							label={t.sync.backlog.unlink}
							onClick={() => void run(() => unlink(item.linked ?? ""))}
						>
							<XMarkIcon size={14} />
						</IconButton>
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
						<Button type="submit" disabled={local.trim() === ""}>
							{t.sync.backlog.confirm}
						</Button>
					</form>
				) : (
					<div>
						<Button onClick={() => setLinking(true)}>
							<LinkIcon size={14} />
							{t.sync.backlog.link}
						</Button>
					</div>
				)}
			</section>

			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</div>
	);
}
