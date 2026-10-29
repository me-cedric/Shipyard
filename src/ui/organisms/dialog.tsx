import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
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
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	/** The primary action. The close button is always there. */
	actions?: ReactNode;
	wide?: boolean;
	children: ReactNode;
}) {
	const { t } = useI18n();
	return (
		<BaseDialog.Root open={open} onOpenChange={onOpenChange}>
			<BaseDialog.Portal>
				<BaseDialog.Backdrop className="fixed inset-0 z-40 bg-n-1/60 backdrop-blur-sm transition-opacity duration-(--duration-fast) data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
				<BaseDialog.Popup
					className={cn(
						"fixed top-20 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-n-6 bg-surface-3 shadow-3 transition-[opacity,scale] duration-(--duration-base) ease-spring data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
						wide ? "w-[48rem]" : "w-[32rem]",
					)}
				>
					<div className="flex flex-col gap-2 p-3">
						<BaseDialog.Title className="text-14 font-medium">{title}</BaseDialog.Title>
						{children}
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
