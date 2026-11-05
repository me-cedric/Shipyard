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
	moreLabel,
	moreDisabled,
	items,
	className,
}: {
	label: string;
	icon?: ReactNode;
	onClick: () => void;
	disabled?: boolean;
	/** The accessible name of the arrow part. */
	moreLabel: string;
	moreDisabled?: boolean;
	items: MenuButtonItem[];
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex h-7 shrink-0 items-stretch overflow-hidden rounded-md border border-n-7",
				className,
			)}
		>
			<button type="button" className={PART} onClick={onClick} disabled={disabled}>
				{icon}
				{label}
			</button>
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
		</span>
	);
}
