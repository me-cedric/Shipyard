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
			className="flex min-h-11 items-center gap-3 border-b px-3 py-1.5 transition-colors duration-(--duration-fast) last:border-b-0 hover:bg-n-2"
		>
			{icon ? (
				<span
					aria-hidden="true"
					className="flex size-6 shrink-0 items-center justify-center rounded-md bg-n-3 text-n-11"
				>
					{icon}
				</span>
			) : null}
			<span id={id} className="min-w-0 flex-1 text-ui text-n-12">
				{label}
			</span>
			{children}
		</div>
	);
}
