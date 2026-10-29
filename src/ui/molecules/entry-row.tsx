import type { ReactNode } from "react";
import { Checkbox } from "../atoms/checkbox";
import { type Status, StatusDot } from "../atoms/status-dot";

/**
 * One list row: an optional checkbox, a status shape with its word, a name, badges and actions.
 * The name is a button when `onOpen` is set: it fills the inspector.
 */
export function EntryRow({
	name,
	status,
	statusLabel,
	check,
	onOpen,
	children,
}: {
	name: string;
	status: Status;
	statusLabel: string;
	check?: { label: string; checked: boolean; onChange: (checked: boolean) => void };
	onOpen?: () => void;
	/** The badges and the actions. */
	children?: ReactNode;
}) {
	return (
		<li className="flex min-h-row items-center gap-3 border-b px-3 py-1">
			{check ? (
				<Checkbox
					label={check.label}
					hideLabel
					checked={check.checked}
					onCheckedChange={check.onChange}
				/>
			) : null}
			<span className="flex items-center gap-1 text-12 text-n-11">
				<StatusDot status={status} label={statusLabel} />
				{statusLabel}
			</span>
			{onOpen ? (
				<button type="button" onClick={onOpen} className="flex-1 truncate text-left text-ui">
					{name}
				</button>
			) : (
				<span className="flex-1 truncate text-ui">{name}</span>
			)}
			{children}
		</li>
	);
}
