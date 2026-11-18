import type { ReactNode } from "react";

export type DoorProps = { className: string; children: ReactNode };
const TILE =
	"flex min-h-control w-full flex-col gap-3 rounded-xl bg-surface-2 p-4 text-left text-n-12 shadow-1 transition-shadow duration-(--duration-fast) hover:shadow-2";

/** A large tile that opens a group. It shows how many items wait inside. */
export function Door({
	label,
	icon,
	count,
	onClick,
	render,
	chips,
}: {
	label: string;
	icon: ReactNode;
	count?: number;
	onClick?: () => void;
	/** Draws a link in place of the button. */
	render?: (props: DoorProps) => ReactNode;
	/** The links inside the door. With chips, the door is a region and not one control. */
	chips?: ReactNode;
}) {
	const props: DoorProps = {
		className: TILE,
		children: (
			<>
				<span
					aria-hidden="true"
					className="flex size-12 items-center justify-center rounded-lg bg-accent-subtle text-accent-text"
				>
					{icon}
				</span>
				<span className="flex items-center justify-between gap-2 text-16 font-semibold">
					{label} {count ? <span className="text-14 font-normal text-n-11">{count}</span> : null}
				</span>
			</>
		),
	};
	if (chips !== undefined)
		return (
			<section aria-label={label} className={props.className}>
				{props.children}
				<div className="flex flex-wrap gap-2">{chips}</div>
			</section>
		);
	return render ? render(props) : <button type="button" onClick={onClick} {...props} />;
}
