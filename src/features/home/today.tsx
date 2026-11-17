import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type NeedsYouItem, useNeedsYou } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import { useRights } from "@/lib/rights";
import { Button } from "@/ui/atoms/button";
import { ArrowPathIcon, ChevronRightIcon, ClockIcon } from "@/ui/icons";
import { AttentionCard } from "@/ui/molecules/attention-card";
import { EmptyState } from "@/ui/molecules/empty-state";
import { PageHeader } from "@/ui/molecules/page-header";
import { SinceAway } from "./away";
import { NeedsRow } from "./inbox/inbox";
import { MyWork } from "./my-work";
import { RolePanels } from "./role-panels";
import { useMyItems } from "./stats";
import { TimeReminder } from "./time-reminder";
import { WorkingNow } from "./working-now";

/** The agent or the person who asks, as the card and the queue name it. */
function useWho() {
	const { t } = useI18n();
	return (x: NeedsYouItem) => x.by || (x.who === "agent" ? t.home.agent : t.rights.today.you);
}

/**
 * Today / Needs you: what to do now, one thing at a time (spec:app-redesign#REQ-007, REQ-009; adr:0023).
 * The title gives the count; the card holds the answer controls of the first thing; a short queue
 * lists the next ones. `start` shows under the header: the Get started steps of a new project.
 */
export function Today({ start }: { start?: ReactNode }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const navigate = useNavigate();
	const role = useRights().role;
	const who = useWho();
	const [everyone, setEveryone] = useState(false);
	const { items, loading, timesheet } = useNeedsYou(everyone);
	const [later, setLater] = useState<string[]>([]);
	const [picked, setPicked] = useState<string | null>(null);
	const mine = useMyItems();
	// Later moves a thing to the end of the queue for this visit; a click on the queue picks one.
	const ordered = [
		...items.filter((i) => !later.includes(i.id)),
		...later.flatMap((id) => items.filter((i) => i.id === id)),
	];
	const first = ordered.find((i) => i.id === picked) ?? ordered[0];
	const queue = ordered.filter((i) => i !== first);
	// The focus moves only after the person answers the card, picks a queue item or presses Later:
	// to the heading of the new card, or to the page when none is left.
	const page = useRef<HTMLDivElement>(null);
	const seen = useRef(first?.id);
	const moved = useRef(false);
	const shown = useRef(ordered);
	shown.current = ordered;
	useEffect(() => {
		const before = seen.current;
		seen.current = first?.id;
		if (before === undefined || before === first?.id) return;
		if (!moved.current && shown.current.some((i) => i.id === before)) return;
		// A thing that another person answered leaves the focus where the person works.
		const at = document.activeElement;
		const card = page.current?.querySelector("article");
		if (!moved.current && at && at !== document.body && !card?.contains(at)) return;
		moved.current = false;
		(page.current?.querySelector<HTMLElement>("article h3") ?? page.current)?.focus();
	}, [first?.id]);
	const toLater = (id: string) => {
		moved.current = true;
		setLater([...later.filter((x) => x !== id), id]);
		setPicked(null);
	};
	const nothing = items.length === 0 && mine.length === 0 && !timesheet;
	return (
		// tabIndex -1: where the focus lands when the last thing leaves (`Leave`).
		<div ref={page} tabIndex={-1} className="flex min-h-0 flex-1 flex-col gap-4 pb-4 outline-none">
			<PageHeader
				icon={<ClockIcon size={16} />}
				title={
					ordered.length
						? format(ordered.length === 1 ? t.home.needsOne : t.home.needsMany, {
								count: ordered.length,
							})
						: t.tabs.home.today
				}
				menu={[
					{
						label: t.home.refresh,
						icon: <ArrowPathIcon size={12} />,
						onClick: () => void qc.invalidateQueries(),
					},
				]}
			/>
			{start}
			{role === null ? null : (
				<Button
					aria-pressed={everyone}
					className="mx-4 min-h-control self-end"
					onClick={() => setEveryone(!everyone)}
				>
					{t.rights.everyone}
				</Button>
			)}
			<div className="grid gap-4 px-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
				<div className="flex min-w-0 flex-col gap-4">
					{first ? (
						<AttentionCard who={who(first)} title={`${first.key} ${first.title}`}>
							<p className="text-ui text-n-11">
								{format(t.home.position, { n: ordered.indexOf(first) + 1, total: ordered.length })}
							</p>
							<NeedsRow key={first.id} item={first} onLater={() => toLater(first.id)} />
							{/* An approval question has its own Not yet. */}
							{ordered.length > 1 && first.kind !== "approval" ? (
								<Button className="min-h-control self-start" onClick={() => toLater(first.id)}>
									{t.home.later}
								</Button>
							) : null}
						</AttentionCard>
					) : null}
					{queue.length ? (
						<ul aria-label={t.home.needsYou} className="rounded-xl border bg-surface-2 shadow-1">
							{queue.map((x) => (
								<li key={x.id} className="border-b last:border-b-0">
									<button
										type="button"
										onClick={() => {
											moved.current = true;
											setPicked(x.id);
										}}
										className="flex min-h-control w-full items-center gap-3 px-4 text-left text-ui hover:bg-n-3"
									>
										<span className="font-medium">{who(x)}</span>{" "}
										<span className="min-w-0 flex-1 truncate">{x.text}</span>{" "}
										<span className="truncate text-n-11">
											{x.key} {x.title}
										</span>{" "}
										<ChevronRightIcon size={14} />
									</button>
								</li>
							))}
						</ul>
					) : null}
				</div>
				<div className="flex min-w-0 flex-col gap-4">
					<WorkingNow />
				</div>
			</div>
			<TimeReminder />
			<RolePanels />
			<MyWork />
			<SinceAway />
			{nothing && !loading ? (
				<EmptyState
					title={t.empty.needsYou}
					action={{
						label: t.home.today.backlog,
						onClick: () => void navigate({ to: "/flow/list" }),
					}}
				/>
			) : null}
		</div>
	);
}
