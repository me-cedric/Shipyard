import { type ReactNode, useId } from "react";
import { Row } from "./row";

/** The value or the control, on the right edge. A field or a select fills it; a narrow row wraps it under the label. */
const SETTINGS_CONTROL =
	"flex min-w-0 max-w-full flex-[0_0_20rem] flex-wrap items-center justify-end gap-2 [&>button[aria-haspopup=listbox]]:w-full [&>input]:w-full";

/** The value row: the label on the left, the value or the control on the right. */
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
		<Row
			className="gap-y-1.5 py-2"
			render={(props) => (
				// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
				<div
					id={anchor}
					role="group"
					aria-labelledby={id}
					aria-current={current ? "step" : undefined}
					{...props}
				/>
			)}
		>
			{icon ? (
				<span aria-hidden="true" className="flex shrink-0 text-n-11">
					{icon}
				</span>
			) : null}
			{/* The label keeps its words whole; the control wraps below it when the row is narrow. */}
			<span id={id} className="min-w-32 flex-[1_1_10rem] font-semibold text-n-12">
				{label}
			</span>
			<div className={SETTINGS_CONTROL}>{children}</div>
		</Row>
	);
}
