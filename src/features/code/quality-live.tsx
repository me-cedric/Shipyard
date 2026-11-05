import { listen } from "@tauri-apps/api/event";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isTauri } from "@/lib/ipc";

/** The progress event of the backend: the last output lines of a running check or scanner. */
const PROGRESS_EVENT = "quality-progress";
const MAX_LINES = 6;

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

/** The timer and the last output lines of a running card. */
export function RunLive({ run }: { run: Live }) {
	return (
		<>
			<Elapsed since={run.startedAt} />
			{run.lines.length > 0 ? (
				<pre className="max-h-24 overflow-auto rounded-md bg-n-3 px-2 py-1 font-mono text-12 text-n-11">
					{run.lines.join("\n")}
				</pre>
			) : null}
		</>
	);
}
