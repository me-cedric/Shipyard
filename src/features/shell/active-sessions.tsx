import { Popover } from "@base-ui/react/popover";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMachineSessions, useMachineWrites } from "@/lib/factory";
import { format, useI18n } from "@/lib/i18n";
import { Avatar } from "@/ui/atoms/avatar";
import { IconButton } from "@/ui/atoms/icon-button";
import { LiveDot } from "@/ui/atoms/live-dot";
import { ComputerDesktopIcon, StopIcon } from "@/ui/icons";

/**
 * The AI sessions that run on this computer, from the context bar: the count, then a popover with
 * each session and its stop. Legacy source: `src/components/ai-sessions.tsx` (`AiSessionsMenu`).
 * Shipyard reads the same sessions as Factory / Sessions, so both show the same rows.
 */
export function ActiveSessions({ className }: { className: string }) {
	const { t, lang } = useI18n();
	const p = t.panels.sessions;
	const m = t.factory.machine;
	const live = (useMachineSessions().data ?? []).filter((s) => s.state !== "done");
	const writes = useMachineWrites();
	const [error, setError] = useState<string | null>(null);
	const compact = new Intl.NumberFormat(lang, { notation: "compact" });
	const stop = (pid: number) => {
		setError(null);
		writes.stop(pid).catch((e: unknown) => setError(String(e)));
	};
	return (
		<Popover.Root>
			<Popover.Trigger className={className}>
				<span className="sr-only">{format(t.count, { name: p.title, count: live.length })}</span>
				{/* The screen marks a session of this computer; the dot breathes while one works. */}
				<span className="relative flex">
					<ComputerDesktopIcon size={14} />
					{live.some((s) => s.state === "working") ? (
						<LiveDot className="absolute -top-0.5 -right-0.5 size-1.5" />
					) : null}
				</span>
				<span aria-hidden="true" className="font-mono">
					{live.length}
				</span>
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
					<Popover.Popup className="w-[26rem] max-w-[calc(100vw-2rem)] rounded-lg border border-n-6 bg-surface-3 text-ui shadow-3 transition-[opacity,scale] duration-(--duration-base) ease-spring origin-(--transform-origin) data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
						<div className="flex min-h-row items-center gap-2 border-b px-3">
							<Popover.Title className="flex-1 text-12 font-medium text-n-11">
								{format(t.count, { name: p.title, count: live.length })}
							</Popover.Title>
							<Link
								to="/factory/sessions"
								className="rounded-sm px-1 text-12 text-accent-text hover:underline"
							>
								{p.all}
							</Link>
						</div>
						{error ? (
							<p role="alert" className="px-3 py-2 text-danger-text">
								{error}
							</p>
						) : null}
						{live.length === 0 ? (
							<p className="px-3 py-3 text-n-10">{p.none}</p>
						) : (
							<ul aria-label={p.title} className="max-h-80 overflow-y-auto py-1">
								{live.map((s) => {
									const name = `${s.runner} ${s.project}`;
									const pid = s.pid;
									return (
										<li key={s.key} className="flex items-center gap-2.5 px-3 py-1.5">
											<span className="relative flex shrink-0">
												<Avatar name={s.runner} className="size-6 text-11" />
												{s.state === "working" ? (
													<LiveDot className="absolute -right-0.5 -bottom-0.5 size-2 ring-2 ring-surface-3" />
												) : null}
											</span>
											<span className="flex min-w-0 flex-1 flex-col">
												<span className="flex items-center gap-1.5">
													<span className="truncate text-n-12">{s.project}</span>
													<span className="text-12 text-n-10">
														{m.state[s.state as "idle"] ?? s.state}
													</span>
												</span>
												<span className="truncate font-mono text-11 text-n-11">
													{s.runner} · {s.model}
												</span>
											</span>
											<span className="flex shrink-0 flex-col items-end font-mono text-11 text-n-11">
												<span>{format(p.tokens, { count: compact.format(s.tokens ?? 0) })}</span>
												<span className="text-n-12">${(s.costUsd ?? 0).toFixed(2)}</span>
											</span>
											{pid == null ? null : (
												<IconButton label={format(m.stop, { name })} onClick={() => stop(pid)}>
													<StopIcon size={14} />
												</IconButton>
											)}
										</li>
									);
								})}
							</ul>
						)}
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}
