import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type RowProps = { className: string; children: ReactNode };

/** The look of a row: 60 px or more, and a line between two rows. */
const ROW =
	"flex min-h-15 flex-wrap items-center gap-3 px-6 text-n-12 [&+&]:border-t [&+&]:border-n-6";

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
	const props: RowProps = { className: cn(ROW, className), children };
	return render ? render(props) : <div {...props} />;
}
