import { type ReactNode, useId } from "react";

export function SettingsRow({
	icon,
	label,
	children,
}: {
	icon?: ReactNode;
	label: string;
	/** The control. It needs its own accessible name. */
	children: ReactNode;
}) {
	const id = useId();
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset adds a legend box
		<div
			role="group"
			aria-labelledby={id}
			className="flex min-h-row items-center gap-3 border-b px-3 py-1"
		>
			<span aria-hidden="true" className="text-n-10">
				{icon}
			</span>
			<span id={id} className="flex-1 text-ui">
				{label}
			</span>
			{children}
		</div>
	);
}
