import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The grid of a group of tiles: it fills the width with columns of 180 px or more. */
export const TILE_GRID = "grid grid-cols-[repeat(auto-fill,minmax(min(180px,100%),1fr))] gap-3.5";

/** The look of a tile: a white card that a person can click. Lists of cards use it too. */
export const TILE =
	"flex min-h-control cursor-pointer flex-col gap-3 rounded-lg bg-surface-2 p-4.5 text-left text-n-12 shadow-2 transition-colors duration-(--duration-fast) hover:bg-n-3 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

/** The selected tile: the accent outline and tint. */
export const TILE_ON = "bg-accent-tint hover:bg-accent-tint outline-2 outline-accent";

/** A large choice with an icon. `selected` shows as an accent outline and as the pressed state. */
export function Tile({
	icon,
	label,
	selected,
	className,
	...props
}: { icon?: ReactNode; label: string; selected?: boolean } & ComponentProps<"button">) {
	return (
		<button
			type="button"
			aria-pressed={selected}
			className={cn(TILE, "text-17 font-semibold", selected && TILE_ON, className)}
			{...props}
		>
			{icon ? (
				<span
					aria-hidden="true"
					className="flex size-12 items-center justify-center rounded-field bg-accent-subtle text-accent-text"
				>
					{icon}
				</span>
			) : null}
			{label}
		</button>
	);
}
