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
	initialFocus,
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
	/** The element that takes focus when the dialog opens. The default is the first tabbable one. */
	initialFocus?: RefObject<HTMLElement | null>;
	children: ReactNode;
}) {
	const { t } = useI18n();
	return (
		<BaseDialog.Root open={open} onOpenChange={onOpenChange}>
			<BaseDialog.Portal>
				<BaseDialog.Backdrop className="fixed inset-0 z-40 bg-n-1/60 backdrop-blur-sm transition-opacity duration-(--duration-fast) data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
				<BaseDialog.Popup
					initialFocus={initialFocus}
					className={cn(
						"fixed top-20 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-n-6 bg-surface-3 shadow-3 transition-[opacity,scale] duration-(--duration-base) ease-spring data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
						full ? "top-4 bottom-4 w-[calc(100vw-2rem)]" : wide ? "w-[48rem]" : "w-[32rem]",
					)}
				>
					<div className={cn("flex flex-col gap-2 p-3", full && "h-full")}>
						<BaseDialog.Title className="text-14 font-medium">{title}</BaseDialog.Title>
						{/* A full dialog gives the rest of the window to its content. */}
						{full ? <div className="min-h-0 flex-1">{children}</div> : children}
						<div className="flex justify-end gap-2">
							<BaseDialog.Close render={<Button variant="ghost" />}>
								{t.common.close}
							</BaseDialog.Close>
							{actions}
						</div>
					</div>
				</BaseDialog.Popup>
			</BaseDialog.Portal>
		</BaseDialog.Root>
	);
}
