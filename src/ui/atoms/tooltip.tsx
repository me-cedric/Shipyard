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
				<BaseTooltip.Positioner sideOffset={6} className="z-50">
					<BaseTooltip.Popup className="flex items-center gap-2 rounded-md border border-n-6 bg-surface-3 px-2 shadow-2 py-1 text-11 text-n-12 transition-opacity duration-(--duration-fast) data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
						{label}
						{shortcut ? <Kbd>{shortcut}</Kbd> : null}
					</BaseTooltip.Popup>
				</BaseTooltip.Positioner>
			</BaseTooltip.Portal>
		</BaseTooltip.Root>
	);
}

export const TooltipProvider = BaseTooltip.Provider;
