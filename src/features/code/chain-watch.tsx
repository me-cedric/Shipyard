import { useQuery } from "@tanstack/react-query";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { useShell } from "@/lib/shell";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { ChatBubbleIcon, LinkIcon } from "@/ui/icons";
import { Panel } from "@/ui/molecules/panel";

/**
 * The docs chain over the whole branch: each artifact folder that is stale against its source, since
 * `base`. Each row asks the assistant to bring the folder up to date: a click, never a write. A clean
 * chain says so. The list stays in view and counts the whole branch.
 */
export function ChainWatch({ base }: { base: string }) {
	const { t } = useI18n();
	const { ask } = useShell();
	const w = t.personal.chain;
	const watch = useQuery({
		queryKey: ["code", "chain-watch", base],
		queryFn: () => unwrap(commands.codeChainWatch(base)),
		retry: false,
	});
	const name = (k: string) => t.projects.path[k as "specs"] ?? k;
	const rows = watch.data?.warnings ?? [];
	return (
		<Panel
			title={w.title}
			count={rows.length}
			icon={<LinkIcon size={14} />}
			tone={rows.length ? "warning" : undefined}
			className="shrink-0"
			bodyClassName="py-1"
		>
			{watch.error ? (
				<p role="alert" className="px-3 py-2 text-ui text-danger-text">
					{String(watch.error)}
				</p>
			) : rows.length === 0 && watch.data ? (
				<p className="px-3 py-2 text-ui text-n-11">{format(w.clean, { base: watch.data.base })}</p>
			) : null}
			{rows.map((r) => (
				<div key={`${r.from}:${r.to}`} className="flex flex-col gap-1 px-3 py-2">
					<div className="flex items-center gap-2 text-ui">
						<Badge variant="warning">{name(r.to)}</Badge>
						<span className="min-w-0 flex-1 truncate text-n-11">
							{format(w.stale, { from: name(r.from), count: r.changed.length })}
						</span>
						<Button
							variant="ghost"
							onClick={() =>
								ask(
									format(w.prompt, {
										to: name(r.to),
										from: name(r.from),
										base: watch.data?.base ?? base,
										paths: r.changed.join(", "),
									}),
								)
							}
						>
							<ChatBubbleIcon size={14} />
							{w.update}
						</Button>
					</div>
					<p className="truncate font-mono text-12 text-n-10" title={r.changed.join(", ")}>
						{r.changed.slice(0, 3).join(", ")}
					</p>
				</div>
			))}
		</Panel>
	);
}
