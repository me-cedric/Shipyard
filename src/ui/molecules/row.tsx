import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type RowProps = { className: string; children: ReactNode };

/**
 * The look of a row: 60 px or more, and a line between two rows. The row sits 8 px inside its card
 * with round corners, so a hover fill never covers the round corner of the card; the text keeps
 * its 24 px from the card edge. The width is the card width minus the two insets, for a `div`, a
 * button and a link alike. It comes last in the class list, so a caller class (`w-full`) cannot widen it.
 */
const ROW =
	"mx-2 flex min-h-15 flex-wrap items-center gap-3 rounded-md px-4 text-n-12 [&+&]:border-t [&+&]:border-n-6";

// `max-w` holds also when a caller adds `w-full` to the class of its own element.
const WIDTH = "w-[calc(100%-1rem)] max-w-[calc(100%-1rem)]";

/** One row of a card. A `div` by default; `render` draws a link or a button. */
export function Row({
	render,
	className,
	children,
}: {
	render?: (props: RowProps) => ReactNode;
	className?: string;
	children: ReactNode;
}) {
	const props: RowProps = { className: cn(ROW, className, WIDTH), children };
	return render ? render(props) : <div {...props} />;
}
