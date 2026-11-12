import { Menu } from "@base-ui/react/menu";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "../atoms/button";
import { Kbd } from "../atoms/kbd";

export type MenuButtonItem = {
	id: string;
	label: string;
	icon?: ReactNode;
	disabled?: boolean;
	/** A toggle: the item is a checkbox item and the list tells its state. */
	checked?: boolean;
	/** One choice of the list: the list tells the chosen value, and the item with it carries a mark. */
	value?: string;
	/** An action that stops work or loses data: the danger colour. */
	danger?: boolean;
	/** The shortcut that the item shows at its end. */
	shortcut?: string;
	onSelect: () => void;
};

export const MENU_ITEM =
	"flex h-row cursor-pointer items-center gap-2 rounded-sm px-2 text-n-12 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-n-5";

export const MENU_POPUP =
	"min-w-40 origin-(--transform-origin) rounded-lg border border-n-6 bg-surface-3 p-1 text-ui shadow-3 transition-[opacity,scale] duration-(--duration-base) ease-spring data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none";

/** The popup of a menu: the items of the list. Put it inside a `Menu.Root` with a trigger. */
export function MenuList({ items, value }: { items: MenuButtonItem[]; value?: string }) {
	return (
		<Menu.Portal>
			<Menu.Positioner align="end" sideOffset={4} className="z-50">
				<Menu.Popup className={MENU_POPUP}>
					<Menu.RadioGroup value={value}>
						{items.map((x) => {
							const body = (
								<>
									{x.icon ? (
										<span aria-hidden="true" className="text-n-10">
											{x.icon}
										</span>
									) : null}
									{x.label}
									{x.shortcut ? (
										<Kbd aria-hidden="true" className="ml-auto">
											{x.shortcut}
										</Kbd>
									) : null}
								</>
							);
							if (x.value !== undefined)
								return (
									<Menu.RadioItem
										key={x.id}
										value={x.value}
										disabled={x.disabled}
										onClick={x.onSelect}
										className={MENU_ITEM}
									>
										{body}
										<Menu.RadioItemIndicator
											aria-hidden="true"
											className="ml-auto text-accent-text"
										>
											✓
										</Menu.RadioItemIndicator>
									</Menu.RadioItem>
								);
							return x.checked === undefined ? (
								<Menu.Item
									key={x.id}
									disabled={x.disabled}
									onClick={x.onSelect}
									className={cn(MENU_ITEM, x.danger && "text-danger-text")}
								>
									{body}
								</Menu.Item>
							) : (
								<Menu.CheckboxItem
									key={x.id}
									checked={x.checked}
									disabled={x.disabled}
									onCheckedChange={x.onSelect}
									className={MENU_ITEM}
								>
									{body}
								</Menu.CheckboxItem>
							);
						})}
					</Menu.RadioGroup>
				</Menu.Popup>
			</Menu.Positioner>
		</Menu.Portal>
	);
}

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
			<MenuList items={items} />
		</Menu.Root>
	);
}
