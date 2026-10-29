import { StatusDot } from "../atoms/status-dot";

export type Flag = { id: string; label: string; on: boolean };

/** Capability flags: a green circle when on, a grey dash when off. Shape and colour carry the state. */
export function FlagList({
	label,
	flags,
	onLabel,
	offLabel,
}: {
	/** Accessible name of the list. */
	label: string;
	flags: Flag[];
	onLabel: string;
	offLabel: string;
}) {
	return (
		<ul
			aria-label={label}
			className="flex flex-wrap items-center gap-x-3 gap-y-1 text-12 text-n-11"
		>
			{flags.map((f) => (
				<li key={f.id} className="inline-flex items-center gap-1">
					<StatusDot status={f.on ? "success" : "idle"} label={f.on ? onLabel : offLabel} />
					{f.label}
				</li>
			))}
		</ul>
	);
}
