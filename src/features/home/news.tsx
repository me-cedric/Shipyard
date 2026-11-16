import { Link } from "@tanstack/react-router";
import { AnimatePresence } from "motion/react";
import { useEffect, useRef } from "react";
import { format, useI18n } from "@/lib/i18n";
import { type Notice, useNotifications, useOpenNotice } from "@/lib/notifications";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { Leave } from "@/ui/atoms/leave";
import { BellIcon, XMarkIcon } from "@/ui/icons";
import { NotificationRow } from "@/ui/molecules/notification-row";
import { PageHeader } from "@/ui/molecules/page-header";
import { Panel } from "@/ui/molecules/panel";

/**
 * Today / News: the one list of notifications, as the bell held it (spec:app-redesign#REQ-008).
 * Opening the view marks each entry as read, as opening the bell did. An entry that arrives
 * while the view is open stays unread until "Mark all as read".
 */
export function News() {
	const { t, lang } = useI18n();
	const n = t.notifications;
	const { items, unread, markRead, clear, remove } = useNotifications();
	const open = useOpenNotice();
	// The entries that were unread on arrival keep their mark for this visit.
	const fresh = useRef(new Set(items.filter((i) => !i.read).map((i) => i.id)));
	// biome-ignore lint/correctness/useExhaustiveDependencies: mark once, when the view opens
	useEffect(() => markRead(), []);
	const midnight = new Date().setHours(0, 0, 0, 0);
	const groups: [string, Notice[], Intl.DateTimeFormat][] = [
		[
			t.home.newsToday,
			items.filter((i) => i.time >= midnight),
			new Intl.DateTimeFormat(lang, { timeStyle: "short" }),
		],
		[
			t.home.newsEarlier,
			items.filter((i) => i.time < midnight),
			new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short" }),
		],
	];
	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 pb-4">
			<PageHeader
				icon={<BellIcon size={16} />}
				title={items.length ? format(t.home.newsTitle, { count: items.length }) : t.tabs.home.news}
				action={
					<span className="flex items-center gap-2">
						<Button className="min-h-control" disabled={unread === 0} onClick={markRead}>
							{t.home.markAllRead}
						</Button>
						<Button className="min-h-control" disabled={items.length === 0} onClick={clear}>
							{n.clear}
						</Button>
					</span>
				}
			/>
			<div className="flex flex-col gap-4 px-4">
				{groups.map(([name, rows, time]) =>
					rows.length ? (
						<Panel key={name} title={name} count={rows.length} flush>
							<AnimatePresence initial={false}>
								{rows.map((row) => (
									<Leave key={row.id}>
										<NotificationRow
											kind={row.kind}
											kindLabel={n.kind[row.kind]}
											title={row.title}
											body={row.body}
											time={time.format(row.time)}
											unread={!row.read || fresh.current.has(row.id)}
											wrap
											detail={row.detail}
											detailLabel={t.ui.item.details}
											notice={row.action}
											actions={row.actions}
											action={
												<IconButton
													label={n.dismiss}
													className="size-(--control-h)"
													onClick={() => remove(row.id)}
												>
													<XMarkIcon size={14} />
												</IconButton>
											}
											onOpen={row.target ? () => open(row) : undefined}
										/>
									</Leave>
								))}
							</AnimatePresence>
						</Panel>
					) : null,
				)}
				{items.length === 0 ? <p className="text-n-10">{n.empty}</p> : null}
				<Link
					to="/setup/me"
					className="flex min-h-control items-center self-start text-ui font-medium text-accent-text hover:underline"
				>
					{t.home.moreInSetup}
				</Link>
			</div>
		</div>
	);
}
