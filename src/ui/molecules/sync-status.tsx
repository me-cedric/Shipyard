import { type Status, StatusDot } from "../atoms/status-dot";

/** The sync state of one connection: a shape and a colour, the state name and the last good time. */
export function SyncStatus({
	status,
	label,
	time,
	dateTime,
	detail,
}: {
	status: Status;
	/** The name of the state. */
	label: string;
	/** The last good sync, formatted for the person. */
	time?: string;
	/** The same moment, machine readable. */
	dateTime?: string;
	/** Why the last sync failed. */
	detail?: string;
}) {
	return (
		<p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-2 text-ui">
			<span aria-hidden="true">
				<StatusDot status={status} />
			</span>
			<span>{label}</span>
			{time ? <time dateTime={dateTime}>{time}</time> : null}
			{detail ? <span className="text-danger-text">{detail}</span> : null}
		</p>
	);
}
