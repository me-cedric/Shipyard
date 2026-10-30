import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useFormIntent } from "@/lib/shell";
import { Input } from "@/ui/atoms/input";
import { Select } from "@/ui/atoms/select";

const NONE = "none";

/**
 * The scope of the tracker: a pick from the projects or repositories that the tracker lists. Free
 * text stays when the tracker lists none, or when the list cannot be read.
 */
export function ScopePicker({
	tracker,
	value,
	onChange,
}: {
	/** The id of the tracker connection of the project. */
	tracker: string;
	value: string;
	onChange: (scope: string) => void;
}) {
	const { t } = useI18n();
	const label = t.projects.trackerScope;
	const box = useRef<HTMLSpanElement>(null);
	useFormIntent("trackerScope", () =>
		box.current?.querySelector<HTMLElement>("input, button")?.focus(),
	);
	const scopes = useQuery({
		queryKey: ["connections", "scopes", tracker],
		queryFn: () => unwrap(commands.connectionsScopes(tracker)),
		enabled: tracker !== "",
		retry: false,
	}).data;
	const items = scopes?.length
		? [
				{ value: NONE, label: t.projects.noConnection },
				...(value && !scopes.some((s) => s.id === value) ? [{ value, label: value }] : []),
				...scopes.map((s) => ({ value: s.id, label: s.name })),
			]
		: null;
	return (
		<span ref={box}>
			{items ? (
				<Select
					label={label}
					value={value || NONE}
					onValueChange={(v) => onChange(v === NONE ? "" : v)}
					items={items}
					className="w-64"
				/>
			) : (
				<Input
					label={label}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="w-64"
				/>
			)}
		</span>
	);
}
