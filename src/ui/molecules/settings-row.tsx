import { type ReactNode, useId } from "react";

export function SettingsRow({
	id: anchor,
	icon,
	label,
	children,
}: {
	/** The anchor of the row: an error or a link can open it (`#id`). */
	id?: string;
	icon?: ReactNode;
	label: string;
	/** The control. It needs its own accessible name. */
	children: ReactNode;
}) {
	const id = useId();
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
		<div
			id={anchor}
			role="group"
			aria-labelledby={id}
			className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-3 py-1.5 transition-colors duration-(--duration-fast) last:border-b-0 hover:bg-n-2"
		>
			{icon ? (
				<span
					aria-hidden="true"
					className="flex size-6 shrink-0 items-center justify-center rounded-md bg-n-3 text-n-11"
				>
					{icon}
				</span>
			) : null}
			{/* The label keeps its words whole; the controls take two thirds and wrap below it when the row is narrow. */}
			<span id={id} className="min-w-32 flex-[1_1_10rem] text-ui text-n-12">
				{label}
			</span>
			<div className="flex min-w-0 flex-[2_1_16rem] flex-wrap items-center justify-end gap-2">
				{children}
			</div>
		</div>
	);
}
