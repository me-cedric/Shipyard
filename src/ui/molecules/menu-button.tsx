import { Menu } from "@base-ui/react/menu";
import type { ReactNode } from "react";
import { Button } from "../atoms/button";

export type MenuButtonItem = {
	id: string;
	label: string;
	icon?: ReactNode;
	disabled?: boolean;
	onSelect: () => void;
};

/**
 * A button that opens a list of actions. Arrow keys move in the list, Enter runs an action and
 * Escape closes the list. With `iconOnly`, the label is the accessible name and the tooltip.
 */
export function MenuButton({
	label,
	icon,
	items,
	iconOnly,
	disabled,
}: {
	label: string;
	icon?: ReactNode;
	items: MenuButtonItem[];
	iconOnly?: boolean;
	disabled?: boolean;
}) {
	return (
		<Menu.Root>
			<Menu.Trigger
				render={
					<Button
						disabled={disabled}
						aria-label={iconOnly ? label : undefined}
						title={iconOnly ? label : undefined}
					/>
				}
			>
				{icon}
				{iconOnly ? null : label}
			</Menu.Trigger>
			<Menu.Portal>
				<Menu.Positioner align="end" sideOffset={4} className="z-50">
					<Menu.Popup className="min-w-40 origin-(--transform-origin) rounded-lg border border-n-6 bg-surface-3 p-1 text-ui shadow-3 transition-[opacity,scale] duration-(--duration-base) ease-spring data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none">
						{items.map((x) => (
							<Menu.Item
								key={x.id}
								disabled={x.disabled}
								onClick={x.onSelect}
								className="flex h-row cursor-default items-center gap-2 rounded-sm px-2 text-n-12 data-[disabled]:opacity-50 data-[highlighted]:bg-n-5"
							>
								{x.icon ? (
									<span aria-hidden="true" className="text-n-10">
										{x.icon}
									</span>
								) : null}
								{x.label}
							</Menu.Item>
						))}
					</Menu.Popup>
				</Menu.Positioner>
			</Menu.Portal>
		</Menu.Root>
	);
}
