import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, type McpServer, type ToolFilter, unwrap } from "@/lib/ipc";
import { Checkbox } from "@/ui/atoms/checkbox";
import { Select } from "@/ui/atoms/select";
import { ErrorNotice } from "@/ui/molecules/error-notice";
import { SettingsRow } from "@/ui/molecules/settings-row";
import { mcpKeys } from "./keys";

/**
 * The allow list of one server: all tools, the tools that the server marks read only, or a pick.
 * `list` gives the tool names of the server (a test); the pick starts with all of them on. In
 * Custom mode the list loads when the row shows, so a tool that is off stays on screen.
 */
export function McpAllow({
	server: s,
	list,
}: {
	server: McpServer;
	list: () => Promise<string[]>;
}) {
	const { t } = useI18n();
	const o = t.settings.outside;
	const qc = useQueryClient();
	const [error, setError] = useState<unknown>(null);
	const [names, setNames] = useState<string[]>([]);
	const f = s.tools;
	const listRef = useRef(list);
	listRef.current = list;
	const custom = f.kind === "only";
	useEffect(() => {
		if (!custom) return;
		let live = true;
		listRef
			.current()
			.then((listed) => live && setNames(listed))
			.catch((e) => live && setError(e));
		return () => {
			live = false;
		};
	}, [custom]);
	const save = async (next: ToolFilter) => {
		setError(null);
		try {
			await unwrap(commands.mcpSetTools(s.id, next));
			await qc.invalidateQueries({ queryKey: mcpKeys.list });
		} catch (e) {
			setError(e);
		}
	};
	const pick = async (v: string) => {
		if (v === "all") return save({ kind: "all" });
		if (v === "read") return save({ kind: "readOnly" });
		setError(null);
		try {
			const listed = await list();
			setNames(listed);
			if (listed.length > 0) await save({ kind: "only", tools: listed });
		} catch (e) {
			setError(e);
		}
	};
	const chosen = f.kind === "only" ? f.tools : [];
	const shown = [...new Set([...names, ...chosen])];
	return (
		<>
			<SettingsRow label={o.allowList}>
				<Select
					label={`${o.allowList}: ${s.label}`}
					value={f.kind === "all" ? "all" : f.kind === "readOnly" ? "read" : "custom"}
					onValueChange={(v) => void pick(v)}
					items={[
						{ value: "all", label: o.allowAll },
						{ value: "read", label: o.allowRead },
						{ value: "custom", label: o.allowCustom },
					]}
				/>
			</SettingsRow>
			{f.kind === "only" ? (
				<SettingsRow label={o.tools}>
					<span className="flex max-w-lg flex-wrap gap-x-3">
						{shown.map((tool) => (
							<Checkbox
								key={tool}
								label={tool}
								checked={chosen.includes(tool)}
								onCheckedChange={(on) =>
									void save({
										kind: "only",
										tools: on ? [...chosen, tool] : chosen.filter((x) => x !== tool),
									})
								}
							/>
						))}
					</span>
				</SettingsRow>
			) : null}
			<ErrorNotice error={error} className="px-3 pb-2" />
		</>
	);
}
