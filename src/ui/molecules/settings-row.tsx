import { type ReactNode, useId } from "react";

/** One control column for every row: a fixed width, the control on the right edge. A field or a select fills it; a narrow row wraps it under the label. */
const SETTINGS_CONTROL =
	"flex min-w-0 max-w-full flex-[0_0_20rem] flex-wrap items-center justify-end gap-2 [&>button[aria-haspopup=listbox]]:w-full [&>input]:w-full";

export function SettingsRow({
	id: anchor,
	icon,
	label,
	current,
	children,
}: {
	/** The anchor of the row: an error or a link can open it (`#id`). */
	id?: string;
	icon?: ReactNode;
	label: ReactNode;
	/** The next step of a list of steps. */
	current?: boolean;
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
			aria-current={current ? "step" : undefined}
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
			<div className={SETTINGS_CONTROL}>{children}</div>
		</div>
	);
}
