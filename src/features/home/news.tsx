import { Link } from "@tanstack/react-router";
import { AnimatePresence } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { format, type Messages, useI18n } from "@/lib/i18n";
import { commands, type EventSource, unwrap } from "@/lib/ipc";
import { logError } from "@/lib/log";
import { type Notice, useNotifications, useOpenNotice } from "@/lib/notifications";
import { dateLocale } from "@/lib/prefs";
import { Avatar } from "@/ui/atoms/avatar";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Leave } from "@/ui/atoms/leave";
import { LinkButton, linkClass } from "@/ui/atoms/link-button";
import { Switch } from "@/ui/atoms/switch";
import { ArrowPathIcon, XMarkIcon } from "@/ui/icons";
import { EmptyState } from "@/ui/molecules/empty-state";
import { PageHeader } from "@/ui/molecules/page-header";
import { Row } from "@/ui/molecules/row";

const SURFACE = "rounded-lg bg-surface-2 py-2 shadow-2";
const CARD_TITLE = "px-6 pt-3.5 pb-1.5 text-13 font-semibold text-n-11";

/** The earlier rows that show before "Older news". */
const EARLIER = 5;

/** The five switches of picture 062, each with the sources that it turns on or off. Setup / Me holds the switch of each source. */
const SWITCHES: { id: keyof Messages["home"]["tellOn"]; sources: EventSource[] }[] = [
	{ id: "needsMe", sources: ["question", "approval"] },
	{ id: "finishes", sources: ["run-ended"] },
	{ id: "review", sources: ["review-draft"] },
	{ id: "budget", sources: ["run"] },
	{ id: "sync", sources: ["sync-failure"] },
];

/** One news row (picture 062): who, the title, the feature and one action. Dismiss removes the row. */
function NewsRow({ row, time, unread }: { row: Notice; time: string; unread: boolean }) {
	const { t } = useI18n();
	const { remove } = useNotifications();
	const open = useOpenNotice();
	const [more, setMore] = useState(false);
	// The id starts with the kind of the news; the action follows it (Open when the kind has none of its own).
	const [head = "", next] = row.id.split(":");
	const kind = head === "demo" ? next : head;
	const label =
		kind === "review-draft" || kind === "review"
			? t.home.newsAct.review
			: kind === "budget"
				? t.home.newsAct.budget
				: kind === "sync"
					? t.home.newsAct.sync
					: t.rights.today.open;
	const main = row.action
		? { ...row.action, label: kind === "sync" ? label : row.action.label }
		: row.target
			? { label, run: () => open(row) }
			: null;
	return (
		<Row className="min-h-18 py-2">
			<article
				aria-label={row.body ? `${row.title}: ${row.body}` : row.title}
				className="flex min-w-0 flex-1 flex-wrap items-center gap-3"
			>
				{/* The row has its name: the avatar is a picture only. */}
				<span aria-hidden="true" className="flex">
					{kind === "sync" ? (
						<span className="flex size-9 items-center justify-center rounded-full bg-n-3 text-n-11">
							<ArrowPathIcon size={16} />
						</span>
					) : (
						<Avatar
							agent={row.kind !== "needs-you"}
							name={row.kind === "needs-you" ? row.title : (row.title.split(/\s+/)[0] ?? row.title)}
						/>
					)}
				</span>
				<span className="flex min-w-0 flex-[1_1_220px] flex-col">
					<span className={unread ? "font-semibold" : "font-medium"}>{row.title}</span>
					<span className="text-n-11">
						<span className="sr-only">{t.notifications.kind[row.kind]}. </span>
						{[row.body, time].filter(Boolean).join(" · ")}
					</span>
					{row.detail ? (
						<>
							<pre
								className={
									more
										? "max-h-40 overflow-y-auto font-mono text-13 whitespace-pre-wrap text-n-11"
										: "line-clamp-3 font-mono text-13 whitespace-pre-wrap text-n-11"
								}
							>
								{row.detail}
							</pre>
							<LinkButton
								aria-expanded={more}
								className="self-start"
								onClick={() => setMore(!more)}
							>
								{t.ui.item.details}
							</LinkButton>
						</>
					) : null}
				</span>
				{row.actions?.map((a) => (
					<Button key={a.label} className="min-h-control" onClick={a.run}>
						{a.label}
					</Button>
				))}
				{main ? (
					<Button className="min-h-control" onClick={main.run}>
						{main.label}
					</Button>
				) : null}
				<IconButton
					label={t.notifications.dismiss}
					className="size-(--control-h)"
					onClick={() => remove(row.id)}
				>
					<XMarkIcon size={14} />
				</IconButton>
			</article>
		</Row>
	);
}

/** The switches of the notifications (picture 062): off adds the source to `notifyOff`, as in Setup / Me. */
function TellMe() {
	const { t } = useI18n();
	const [off, setOff] = useState<EventSource[]>([]);
	useEffect(() => {
		unwrap(commands.prefsGet())
			.then((p) => setOff(p.notifyOff))
			.catch(logError);
	}, []);
	// One write after the other: each reads the list that the write before it stored.
	const writes = useRef<Promise<unknown>>(Promise.resolve());
	const toggle = (sources: EventSource[], on: boolean) => {
		writes.current = writes.current
			.then(() => unwrap(commands.prefsGet()))
			.then((p) =>
				unwrap(
					commands.prefsSet({
						notifyOff: on
							? p.notifyOff.filter((x) => !sources.includes(x))
							: [...p.notifyOff.filter((x) => !sources.includes(x)), ...sources],
					}),
				),
			)
			.then((p) => setOff(p.notifyOff))
			.catch(logError);
	};
	const title = useId();
	return (
		<section aria-labelledby={title} className={SURFACE}>
			<h2 id={title} className={CARD_TITLE}>
				{t.home.tellMe}
			</h2>
			{SWITCHES.map(({ id, sources }) => (
				<Row key={id}>
					<span aria-hidden="true" className="mr-auto font-semibold">
						{t.home.tellOn[id]}
					</span>
					<Switch
						label={t.home.tellOn[id]}
						iconOnly
						checked={!sources.some((x) => off.includes(x))}
						onCheckedChange={(on) => toggle(sources, on)}
					/>
				</Row>
			))}
			<Row>
				<Link to="/setup/me" className={linkClass}>
					{t.home.moreInSetup}
				</Link>
			</Row>
		</section>
	);
}

/**
 * Today / News (picture 062): the one list of notifications, as the bell held it
 * (spec:app-redesign#REQ-008), and the switches of what to tell. Opening the view marks each entry
 * as read, as opening the bell did. An entry that arrives while the view is open stays unread
 * until "Mark all as read". Clear is behind More.
 */
export function News() {
	const { t, lang } = useI18n();
	const n = t.notifications;
	const { items, unread, markRead, clear } = useNotifications();
	const [older, setOlder] = useState(false);
	// The entries that were unread on arrival keep their mark for this visit.
	const [fresh, setFresh] = useState(() => new Set(items.filter((i) => !i.read).map((i) => i.id)));
	// biome-ignore lint/correctness/useExhaustiveDependencies: mark once, when the view opens
	useEffect(() => markRead(), []);
	const readAll = () => {
		markRead();
		setFresh(new Set());
	};
	const midnight = new Date().setHours(0, 0, 0, 0);
	const earlier = items.filter((i) => i.time < midnight);
	const groups: [string, Notice[], Intl.DateTimeFormat][] = [
		[
			t.home.newsToday,
			items.filter((i) => i.time >= midnight),
			new Intl.DateTimeFormat(dateLocale(lang), { timeStyle: "short" }),
		],
		[
			t.home.newsEarlier,
			older ? earlier : earlier.slice(0, EARLIER),
			new Intl.DateTimeFormat(dateLocale(lang), { dateStyle: "medium", timeStyle: "short" }),
		],
	];
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 pb-4 [&>[data-page-header]]:-mb-4">
			<PageHeader
				title={items.length ? format(t.home.newsTitle, { count: items.length }) : t.tabs.home.news}
				action={
					<Button
						className="min-h-control"
						disabled={unread === 0 && !items.some((i) => fresh.has(i.id))}
						onClick={readAll}
					>
						{t.home.markAllRead}
					</Button>
				}
				menu={[{ label: n.clear, onClick: clear, disabled: items.length === 0 }]}
			/>
			<div className="flex flex-wrap items-start gap-6 px-4">
				<div className="flex min-w-0 flex-[3_1_480px] flex-col gap-4">
					{groups.map(([name, rows, time]) =>
						rows.length ? (
							<section key={name} aria-label={name} className={SURFACE}>
								<h2 className={CARD_TITLE}>{name}</h2>
								<AnimatePresence initial={false}>
									{rows.map((row) => (
										<Leave key={row.id} className="border-t border-n-6 first-of-type:border-t-0">
											<NewsRow
												row={row}
												time={time.format(row.time)}
												unread={!row.read || fresh.has(row.id)}
											/>
										</Leave>
									))}
								</AnimatePresence>
								{name === t.home.newsEarlier && !older && earlier.length > EARLIER ? (
									<Row className="border-t border-n-6">
										<LinkButton onClick={() => setOlder(true)}>{t.home.olderNews}</LinkButton>
									</Row>
								) : null}
							</section>
						) : null,
					)}
					{items.length === 0 ? <EmptyState title={n.empty} /> : null}
				</div>
				<div className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
					<TellMe />
				</div>
			</div>
		</div>
	);
}
