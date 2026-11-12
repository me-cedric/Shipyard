import { Menu } from "@base-ui/react/menu";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "../icons";
import { type MenuButtonItem, MenuList } from "./menu-button";

const PART =
	"inline-flex h-full items-center gap-1.5 px-2 text-ui text-n-11 transition-colors duration-(--duration-fast) hover:bg-n-3 hover:text-n-12 focus-visible:outline-offset-[-2px] disabled:pointer-events-none disabled:opacity-50";

/**
 * One joined control: the main part runs the main action, the arrow part opens a list of other
 * actions. Both parts have an accessible name. The arrow keys, Enter and Escape work in the list.
 */
export function SplitButton({
	label,
	icon,
	onClick,
	disabled,
	reason,
	pressed,
	shortcut,
	after,
	moreLabel,
	moreDisabled,
	hideMore,
	items,
	className,
}: {
	label: string;
	icon?: ReactNode;
	onClick: () => void;
	disabled?: boolean;
	/** Why the main part is off: its description for assistive technology, and the tooltip of the whole control (an off button gets no pointer events). */
	reason?: string;
	/** The main part is a toggle: it tells its state. */
	pressed?: boolean;
	/** The shortcut of the main part: it shows in the tooltip. */
	shortcut?: string;
	/** Text after the label, such as a count. It is part of the name of the main part. */
	after?: ReactNode;
	/** The accessible name of the arrow part. */
	moreLabel: string;
	moreDisabled?: boolean;
	/** Draws no arrow part: there is no other action to offer. */
	hideMore?: boolean;
	items: MenuButtonItem[];
	className?: string;
}) {
	return (
		<span
			title={disabled ? reason : undefined}
			className={cn(
				"inline-flex h-7 shrink-0 items-stretch overflow-hidden rounded-md border border-n-7",
				className,
			)}
		>
			<button
				type="button"
				className={cn(PART, pressed && "bg-n-4 text-n-12")}
				onClick={onClick}
				disabled={disabled}
				aria-pressed={pressed}
				aria-description={disabled ? reason : undefined}
				title={(disabled && reason) || (shortcut ? `${label} (${shortcut})` : undefined)}
			>
				{icon}
				{label}
				{after ? " " : null}
				{after}
			</button>
			{hideMore ? null : (
				<Menu.Root>
					<Menu.Trigger
						aria-label={moreLabel}
						title={moreLabel}
						disabled={moreDisabled}
						className={cn(PART, "border-l border-n-7")}
					>
						<ChevronDownIcon size={12} />
					</Menu.Trigger>
					<MenuList items={items} />
				</Menu.Root>
			)}
		</span>
	);
}
