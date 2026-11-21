import { type ReactNode, useId } from "react";

/** A row of the tour: the label at the left, the state and its buttons at the right, on one line. */
export function TourRow({
	icon,
	label,
	children,
}: {
	icon?: ReactNode;
	label: ReactNode;
	children: ReactNode;
}) {
	const id = useId();
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
		<div role="group" aria-labelledby={id} className="flex min-h-15 items-center gap-3 px-4 py-2">
			{icon ? (
				<span aria-hidden="true" className="flex shrink-0 text-n-11">
					{icon}
				</span>
			) : null}
			<span id={id} className="shrink-0 font-semibold text-n-12">
				{label}
			</span>
			<div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">{children}</div>
		</div>
	);
}
