import { AnimatePresence, motion, useIsPresent } from "motion/react";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import type { Notice } from "@/lib/notifications";
import { IconButton } from "../atoms/icon-button";
import { XMarkIcon } from "../icons";
import { NotificationRow } from "../molecules/notification-row";
import { SPRING, useReducedMotionPref } from "../motion";

/** One toast. While it slides out it is inert: its dismiss button takes no focus and no click. */
function Slide({
	slide,
	still,
	children,
}: {
	slide?: { opacity: number; x: number };
	still: boolean;
	children: ReactNode;
}) {
	const present = useIsPresent();
	return (
		<motion.div
			inert={!present}
			initial={slide}
			animate={{ opacity: 1, x: 0 }}
			exit={slide}
			transition={still ? { duration: 0 } : SPRING.smooth}
			className="pointer-events-auto rounded-md border border-n-7 bg-n-2"
		>
			{children}
		</motion.div>
	);
}

/** The toasts: the newest events for a few seconds. The region is announced politely. */
export function Toaster({
	toasts,
	onDismiss,
}: {
	toasts: Notice[];
	onDismiss: (id: string) => void;
}) {
	const { t, lang } = useI18n();
	const still = useReducedMotionPref();
	const slide = still ? undefined : { opacity: 0, x: 24 };
	const time = new Intl.DateTimeFormat(lang, { timeStyle: "short" });
	return (
		<div
			role="status"
			aria-live="polite"
			aria-label={t.notifications.title}
			className="pointer-events-none fixed right-4 bottom-10 z-50 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2"
		>
			<AnimatePresence initial={false}>
				{toasts.map((n) => (
					<Slide key={n.id} slide={slide} still={still}>
						<NotificationRow
							kind={n.kind}
							kindLabel={t.notifications.kind[n.kind]}
							title={n.title}
							body={n.body}
							time={time.format(n.time)}
							action={
								<IconButton label={t.notifications.dismiss} onClick={() => onDismiss(n.id)}>
									<XMarkIcon size={14} />
								</IconButton>
							}
						/>
					</Slide>
				))}
			</AnimatePresence>
		</div>
	);
}
