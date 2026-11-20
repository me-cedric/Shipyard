import { Menu } from "@base-ui/react/menu";
import type { ReactNode } from "react";
import { Button } from "@/ui/atoms/button";
import { type MenuButtonItem, MenuList } from "@/ui/molecules/menu-button";

/** The three dots of a More menu. */
export const DOTS = (
	<svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="currentColor">
		<circle cx="3" cy="8" r="1.25" />
		<circle cx="8" cy="8" r="1.25" />
		<circle cx="13" cy="8" r="1.25" />
	</svg>
);

/**
 * A button that opens a menu and marks the chosen value: a filter pill, or the More menu of a page
 * with `icon`. `MenuButton` does not pass the chosen value to its list.
 */
export function MenuPill({
	label,
	icon,
	items,
	value,
}: {
	label: string;
	/** Shown in place of the label. The label stays the accessible name. */
	icon?: ReactNode;
	items: MenuButtonItem[];
	value?: string;
}) {
	return (
		<Menu.Root>
			<Menu.Trigger
				render={
					<Button
						variant={icon ? "ghost" : "secondary"}
						aria-label={icon ? label : undefined}
						title={icon ? label : undefined}
						className={icon ? "px-0 text-n-11" : undefined}
					/>
				}
			>
				{icon ?? label}
			</Menu.Trigger>
			<MenuList items={items} value={value} />
		</Menu.Root>
	);
}
