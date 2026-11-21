import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactNode, RefObject } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "../atoms/button";

/** A modal with a title, a body and the actions at the bottom. Escape and the close button shut it. */
export function Dialog({
	open,
	onOpenChange,
	title,
	actions,
	wide,
	full,
	card,
	initialFocus,
	closeLabel,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	/** The primary action. The close button is always there. */
	actions?: ReactNode;
	wide?: boolean;
	/** Nearly the whole window. */
	full?: boolean;
	/** A card beside the rail menu, with no blur: the help cards of the account menu. */
	card?: boolean;
	/** The element that takes focus when the dialog opens. The default is the first tabbable one. */
	initialFocus?: RefObject<HTMLElement | null>;
	/** The text of the close button, when Close is not the right word. */
	closeLabel?: string;
	children: ReactNode;
}) {
	const { t } = useI18n();
	return (
		<BaseDialog.Root open={open} onOpenChange={onOpenChange}>
			<BaseDialog.Portal>
				<BaseDialog.Backdrop
					className={cn(
						"fixed inset-0 z-40 transition-opacity duration-(--duration-fast) data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
						!card && "bg-n-1/60 backdrop-blur-sm",
					)}
				/>
				<BaseDialog.Popup
					initialFocus={initialFocus}
					className={cn(
						"fixed top-20 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border-2 border-n-6 bg-surface-3 shadow-3 transition-[opacity,scale] duration-(--duration-base) ease-spring data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
						full ? "top-4 bottom-4 w-[calc(100vw-2rem)]" : wide ? "w-[48rem]" : "w-[32rem]",
						card &&
							"top-auto bottom-10 left-[clamp(1rem,40rem,calc(100vw-25rem))] w-[24rem] translate-x-0 border-0",
					)}
				>
					<div className={cn("flex flex-col gap-5 p-8", full && "h-full")}>
						<BaseDialog.Title
							className={cn("font-semibold text-n-12", card ? "text-20" : "text-30")}
						>
							{title}
						</BaseDialog.Title>
						{/* A full dialog gives the rest of the window to its content. */}
						{full ? <div className="min-h-0 flex-1">{children}</div> : children}
						<div className="flex flex-wrap justify-end gap-2.5">
							<BaseDialog.Close render={<Button variant="secondary" />}>
								{closeLabel ?? t.common.close}
							</BaseDialog.Close>
							{actions}
						</div>
					</div>
				</BaseDialog.Popup>
			</BaseDialog.Portal>
		</BaseDialog.Root>
	);
}
