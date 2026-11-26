import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement } from "react";
import { Kbd } from "./kbd";

/** Name and optional shortcut only. */
export function Tooltip({
	label,
	shortcut,
	children,
}: {
	label: string;
	shortcut?: string;
	children: ReactElement<Record<string, unknown>>;
}) {
	return (
		<BaseTooltip.Root>
			<BaseTooltip.Trigger render={children} />
			<BaseTooltip.Portal>
				<BaseTooltip.Positioner sideOffset={6} className="z-(--z-popup)">
					<BaseTooltip.Popup className="flex items-center gap-2 rounded-sm border border-n-6 bg-surface-3 px-2.5 py-1.5 text-12 font-medium text-n-12 shadow-3 transition-opacity duration-(--duration-fast) data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[instant]:transition-none">
						{label}
						{shortcut ? <Kbd className="h-5 min-w-5 px-1 text-11">{shortcut}</Kbd> : null}
					</BaseTooltip.Popup>
				</BaseTooltip.Positioner>
			</BaseTooltip.Portal>
		</BaseTooltip.Root>
	);
}

export const TooltipProvider = BaseTooltip.Provider;
