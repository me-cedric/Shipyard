import type { ReactNode } from "react";
import { ChevronLeftIcon } from "../icons";

export type BackLinkProps = { className: string; children: ReactNode };

/** The way back from a sub-page: a chevron and the name of the parent. `render` draws a router link. */
export function BackLink({
	label,
	render,
}: {
	label: string;
	render?: (props: BackLinkProps) => ReactNode;
}) {
	const props: BackLinkProps = {
		className:
			"inline-flex min-h-control cursor-pointer items-center gap-1.5 self-start font-semibold text-accent hover:text-accent-hover",
		children: (
			<>
				<ChevronLeftIcon size={20} />
				{label}
			</>
		),
	};
	return render ? render(props) : <button type="button" {...props} />;
}
