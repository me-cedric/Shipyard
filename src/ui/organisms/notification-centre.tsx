import { Popover } from "@base-ui/react/popover";
import { format, useI18n } from "@/lib/i18n";
import type { Notice } from "@/lib/notifications";
import { AnimatedIcon } from "../atoms/animated-icon";
import { Button } from "../atoms/button";
import { BellIcon } from "../icons";
import { NotificationRow } from "../molecules/notification-row";

/**
 * The bell of the context bar and the list of events behind it. Opening the list marks each event
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
				className="relative inline-flex size-(--row-h) shrink-0 items-center justify-center rounded-md text-n-11 transition-colors duration-(--duration-fast) hover:bg-n-3 hover:text-n-12"
			>
				<AnimatedIcon icon={BellIcon} ring={unread} />
				{unread > 0 ? (
					<>
						<span
							aria-hidden="true"
							className="absolute -top-0.5 -right-0.5 h-3.5 min-w-3.5 rounded-full bg-accent px-1 text-center font-mono text-11 leading-3.5 text-accent-fg"
						>
							{unread}
						</span>
						<span className="sr-only">{format(t.notifications.unread, { count: unread })}</span>
					</>
				) : null}
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
					<Popover.Popup className="w-96 max-w-[calc(100vw-2rem)] rounded-lg text-ui border border-n-6 bg-surface-3 shadow-3 transition-[opacity,scale] duration-(--duration-base) ease-spring origin-(--transform-origin) data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
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
