import { Popover } from "@base-ui/react/popover";
import { format, useI18n } from "@/lib/i18n";
import type { Notice } from "@/lib/notifications";
import { Button } from "../atoms/button";
import { BellIcon } from "../icons";
import { NotificationRow } from "../molecules/notification-row";

/**
 * The bell of the status bar and the list of events behind it. Opening the list marks each event
 * as read. The count is a number, never a colour alone.
 */
export function NotificationCentre({
	items,
	unread,
	onOpen,
	onClear,
}: {
	items: Notice[];
	unread: number;
	onOpen: () => void;
	onClear: () => void;
}) {
	const { t, lang } = useI18n();
	const time = new Intl.DateTimeFormat(lang, { timeStyle: "short" });
	return (
		<Popover.Root onOpenChange={(open) => open && onOpen()}>
			<Popover.Trigger
				aria-label={t.notifications.title}
				className="inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-11 text-n-11 hover:bg-n-3 hover:text-n-12"
			>
				<BellIcon size={12} />
				{unread > 0 ? (
					<>
						<span aria-hidden="true">{unread}</span>
						<span className="sr-only">{format(t.notifications.unread, { count: unread })}</span>
					</>
				) : null}
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Positioner side="top" align="end" sideOffset={6} className="z-50">
					<Popover.Popup className="w-96 max-w-[calc(100vw-2rem)] rounded-md border border-n-7 bg-n-2 text-ui transition-opacity duration-(--duration-fast) data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
						<div className="flex min-h-row items-center gap-2 border-b px-3">
							<Popover.Title className="flex-1 text-12 font-medium text-n-11">
								{t.notifications.title}
							</Popover.Title>
							<Button variant="ghost" disabled={items.length === 0} onClick={onClear}>
								{t.notifications.clear}
							</Button>
						</div>
						<div className="max-h-80 overflow-y-auto">
							{items.length === 0 ? (
								<p className="px-3 py-3 text-n-10">{t.notifications.empty}</p>
							) : (
								items.map((n) => (
									<NotificationRow
										key={n.id}
										kind={n.kind}
										kindLabel={t.notifications.kind[n.kind]}
										title={n.title}
										body={n.body}
										time={time.format(n.time)}
										unread={!n.read}
									/>
								))
							)}
						</div>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}
