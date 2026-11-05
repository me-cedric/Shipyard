import { listen } from "@tauri-apps/api/event";
import { useEffect, useState, useSyncExternalStore } from "react";
import { format, useI18n } from "@/lib/i18n";
import { isTauri } from "@/lib/ipc";
import { IconButton } from "@/ui/atoms/icon-button";
import { DocumentTextIcon } from "@/ui/icons";
import { Dialog } from "@/ui/organisms/dialog";

/** The progress event of the backend: the last output lines of a running check or scanner. */
const PROGRESS_EVENT = "quality-progress";
const MAX_LINES = 200;

type Live = { startedAt: number; lines: string[] };

// The store lives outside the view: a run goes on when the person leaves the page.
let live: ReadonlyMap<string, Live> = new Map();
const subs = new Set<() => void>();
let listening = false;

const put = (next: Map<string, Live>) => {
	live = next;
	for (const f of subs) f();
};

/** The key of a card: its kind and its name. */
export const runKey = (kind: string, name: string) => `${kind}:${name}`;

export function beginRun(key: string) {
	put(new Map(live).set(key, { startedAt: Date.now(), lines: [] }));
	if (listening || !isTauri()) return;
	listening = true;
	void listen<{ name: string; kind: string; lines: string[] }>(PROGRESS_EVENT, ({ payload }) => {
		const key = runKey(payload.kind, payload.name);
		const run = live.get(key);
		if (run) put(new Map(live).set(key, { ...run, lines: payload.lines.slice(-MAX_LINES) }));
	});
}

export function endRun(key: string) {
	const next = new Map(live);
	next.delete(key);
	put(next);
}

/** The runs in progress, by card key. */
export function useLiveRuns() {
	return useSyncExternalStore(
		(f) => {
			subs.add(f);
			return () => void subs.delete(f);
		},
		() => live,
	);
}

const two = (n: number) => String(n).padStart(2, "0");

/** The time since the click, as mm:ss. It counts up each second. */
export function Elapsed({ since }: { since: number }) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(id);
	}, []);
	const s = Math.max(0, Math.floor((now - since) / 1000));
	return (
		<time className="font-mono text-12 text-n-11">
			{two(Math.floor(s / 60))}:{two(s % 60)}
		</time>
	);
}

/** One fixed row: "Running · mm:ss", the last output line, and a button for the full output. */
export function RunLive({ run, name }: { run: Live; name: string }) {
	const { t } = useI18n();
	const [open, setOpen] = useState(false);
	const label = format(t.forge.quality.outputOf, { name });
	return (
		<div className="flex h-row items-center gap-2">
			<span className="shrink-0 font-mono text-12 text-n-11">
				{t.forge.quality.running} · <Elapsed since={run.startedAt} />
			</span>
			<span className="min-w-0 flex-1 truncate font-mono text-12 text-n-11">
				{run.lines.at(-1) ?? ""}
			</span>
			<IconButton label={label} onClick={() => setOpen(true)}>
				<DocumentTextIcon size={16} />
			</IconButton>
			<Dialog open={open} onOpenChange={setOpen} title={label} wide>
				<pre className="max-h-96 overflow-auto rounded-md bg-n-3 px-2 py-1 font-mono text-12 text-n-12">
					{run.lines.join("\n")}
				</pre>
			</Dialog>
		</div>
	);
}
