import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { SetupCard } from "@/features/onboarding/checklist";
import { type NeedsYouItem, useNeedsYou } from "@/lib/home";
import { format, type Messages, useI18n } from "@/lib/i18n";
import { useRights } from "@/lib/rights";
import { useShell } from "@/lib/shell";
import { Avatar } from "@/ui/atoms/avatar";
import { Button } from "@/ui/atoms/button";
import { linkClass } from "@/ui/atoms/link-button";
import { ArrowPathIcon, ChevronRightIcon, ClockIcon } from "@/ui/icons";
import { approvalSentence } from "@/ui/molecules/approval-bar";
import { EmptyState } from "@/ui/molecules/empty-state";
import { MenuButton } from "@/ui/molecules/menu-button";
import { PageHeader } from "@/ui/molecules/page-header";
import { NeedsRow, OpenQuestion } from "./inbox/inbox";
import { useMyItems } from "./stats";
import { TimeReminder } from "./time-reminder";
import { WorkingNow } from "./working-now";

/** The agent or the person who asks, as the card and the queue name it. */
function useWho() {
	const { t } = useI18n();
	return (x: NeedsYouItem) => x.by || (x.who === "agent" ? t.home.agent : t.rights.today.you);
}

/** What the person does for a thing, in plain words: the heading of the card and the bold text of a queue row. */
function actionOf(t: Messages, x: NeedsYouItem) {
	const h = t.home;
	switch (x.kind) {
		case "approval":
			return x.items.length === 1
				? approvalSentence(h.approval, x.item)
				: format(h.effectsWait, { count: x.items.length });
		case "plan":
			return h.act.plan;
		case "review":
			return h.act.review;
		default:
			return x.text;
	}
}

/**
 * Today / Needs you: what to do now, one thing at a time (spec:app-redesign#REQ-007, REQ-009; adr:0023,
 * picture 001). The title gives the count; the card holds the answer controls of the first thing; a
 * short queue lists the next ones. The right column shows who works now, the next setup step, the
 * time reminder and the way to the panels of the role.
 */
export function Today() {
	const { t } = useI18n();
	const qc = useQueryClient();
	const navigate = useNavigate();
	const { openRef } = useShell();
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
	const toEnd = ordered.length > 1 && first ? () => toLater(first.id) : undefined;
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
						: t.ui.place.today
				}
			/>
			<div className="flex flex-wrap items-start gap-7 px-4">
				<div className="flex min-w-0 flex-[3_1_480px] flex-col gap-4">
					{first ? (
						<article className="flex min-w-0 flex-col gap-6 rounded-lg bg-surface-2 p-8 shadow-2">
							<div className="flex flex-wrap items-center gap-3">
								<Avatar agent={first.who === "agent"} name={who(first)} />
								<span className="font-semibold text-n-12">{who(first)}</span>
								{first.ref ? (
									<button
										type="button"
										className="min-h-control min-w-0 cursor-pointer truncate text-n-11 hover:text-n-12"
										onClick={() => openRef(first.ref)}
									>
										{first.title}
									</button>
								) : (
									<span className="min-w-0 truncate text-n-11">{first.title}</span>
								)}
								<span className="ml-auto text-n-11">
									{format(t.home.position, {
										n: ordered.indexOf(first) + 1,
										total: ordered.length,
									})}
								</span>
							</div>
							{/* tabIndex -1: the focus lands here when the card changes. */}
							<h3
								tabIndex={-1}
								className="text-30 leading-tight font-semibold text-n-12 outline-none"
							>
								{actionOf(t, first)}
							</h3>
							{first.kind === "question" && first.item.question.state === "open" ? (
								<OpenQuestion key={first.id} item={first.item} onLater={toEnd} />
							) : (
								<>
									{/* The rows are cards on the feature page: here the card of Today is the one surface. */}
									<div className="[&>div]:bg-transparent [&>div]:shadow-1">
										<NeedsRow key={first.id} item={first} onLater={() => toLater(first.id)} />
									</div>
									{/* An approval question has its own Not yet. */}
									{toEnd && first.kind !== "approval" ? (
										<Button className="min-h-control self-start" onClick={toEnd}>
											{t.home.later}
										</Button>
									) : null}
								</>
							)}
						</article>
					) : null}
					{queue.length ? (
						<ul aria-label={t.home.needsYou} className="rounded-lg bg-surface-2 shadow-2">
							{queue.map((x) => (
								<li key={x.id} className="border-t border-n-6 first:border-t-0">
									<button
										type="button"
										onClick={() => {
											moved.current = true;
											setPicked(x.id);
										}}
										className="flex min-h-16 w-full cursor-pointer items-center gap-3.5 px-5 py-2 text-left text-n-12"
									>
										<Avatar agent={x.who === "agent"} name={who(x)} />
										<span className="min-w-0 truncate font-semibold">{actionOf(t, x)}</span>{" "}
										<span className="min-w-0 truncate text-n-11">{x.title}</span>
										<span className="ml-auto flex shrink-0">
											<ChevronRightIcon size={20} />
										</span>
									</button>
								</li>
							))}
						</ul>
					) : null}
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
				<div className="flex min-w-0 flex-[2_1_340px] flex-col gap-4">
					<WorkingNow />
					<SetupCard />
					<TimeReminder />
					<div className="flex flex-wrap items-center gap-4">
						<Link to="/today/panels" className={linkClass}>
							{t.home.myPanels}
						</Link>
						<span className="ml-auto">
							<MenuButton
								label={t.ui.more}
								items={[
									{
										id: "refresh",
										label: t.home.refresh,
										icon: <ArrowPathIcon size={12} />,
										onSelect: () => void qc.invalidateQueries(),
									},
									// The routing by role is on only for a person with a role.
									...(role === null
										? []
										: [
												{
													id: "everyone",
													label: t.rights.everyone,
													checked: everyone,
													onSelect: () => setEveryone(!everyone),
												},
											]),
								]}
							/>
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
