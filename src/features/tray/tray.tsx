import { useQueryClient } from "@tanstack/react-query";
import { emit, listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { AgentsToggle } from "@/features/factory/agents-toggle";
import { useCounts } from "@/features/shell/counts";
import { OPEN_REF_EVENT, PROJECT_SWITCHED_EVENT } from "@/features/shell/events";
import { useGuard } from "@/features/work/guard";
import { useRunActions, useRuns, useUsage } from "@/lib/factory";
import { useInbox } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import { commands, isTauri, unwrap } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { useActiveProject, useProjects } from "@/lib/projects";
import { clock, TICK_EVENT, useSyncState, useSyncTick } from "@/lib/sync";
import { Button } from "@/ui/atoms/button";
import { LiveDot } from "@/ui/atoms/live-dot";
import { Progress } from "@/ui/atoms/progress";
import { Select } from "@/ui/atoms/select";

/** The menu bar icon shows a dot while something needs the person. The main window sends the count. */
export function useTrayBadge() {
	const { needsYou } = useCounts();
	useEffect(() => {
		void commands.trayBadge(needsYou);
	}, [needsYou]);
}

const FIRST = 3;
/** The panel is 360 wide and 280 to 520 high: the window fits the content. */
const WIDTH = 360;
const MIN_H = 280;
const MAX_H = 520;
/** The height of the tallest bar, in px: the box of the bars is 40 px. */
const BAR_H = 40;

/** The menu bar panel: the same hooks and writes as the main window, in a small layout. */
export function TrayView() {
	const { t, lang } = useI18n();
	const u = t.ui.tray;
	const { tray } = usePrefs();
	const qc = useQueryClient();
	const { needsYou } = useCounts();
	const inbox = useInbox();
	const runs = (useRuns().data ?? []).filter((r) => r.lane === "working" || r.lane === "needs_you");
	const { cancel } = useRunActions();
	const { error, run } = useGuard();
	const days = useUsage().data?.days ?? [];
	const projects = useProjects().data ?? [];
	const active = useActiveProject().data;
	const sync = useSyncState().data ?? [];
	useSyncTick();
	const panel = useRef<HTMLElement>(null);
	// Escape closes the panel. The first control gets focus when the panel opens (the window gets focus).
	// A panel that opens, or a sync tick, reads everything again: the figures are never old.
	useEffect(() => {
		const close = (e: KeyboardEvent) => e.key === "Escape" && void commands.trayClose();
		const refetch = () => void qc.invalidateQueries();
		const focus = () => {
			panel.current?.querySelector<HTMLElement>("button, [role=switch]")?.focus();
			refetch();
		};
		const visible = () => document.visibilityState === "visible" && refetch();
		window.addEventListener("keydown", close);
		window.addEventListener("focus", focus);
		document.addEventListener("visibilitychange", visible);
		const off = isTauri() ? listen(TICK_EVENT, refetch) : null;
		// The window is clear: the blur of the system shows through the panel.
		const clear = [document.documentElement, document.body];
		for (const e of clear) e.style.background = "transparent";
		return () => {
			window.removeEventListener("keydown", close);
			window.removeEventListener("focus", focus);
			document.removeEventListener("visibilitychange", visible);
			void off?.then((f) => f());
			for (const e of clear) e.style.background = "";
		};
	}, [qc]);
	// The window fits the content, between a floor and the full height of the panel.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the panel exists once `tray` is true
	useEffect(() => {
		const el = panel.current;
		if (!(el && isTauri() && typeof ResizeObserver !== "undefined")) return;
		const resize = () => {
			const h = Math.min(MAX_H, Math.max(MIN_H, Math.ceil(el.scrollHeight)));
			void import("@tauri-apps/api/window")
				.then((m) => m.getCurrentWindow().setSize(new m.LogicalSize(WIDTH, h)))
				.catch(() => {});
		};
		const watch = new ResizeObserver(resize);
		watch.observe(el);
		resize();
		return () => watch.disconnect();
	}, [tray]);
	if (!tray) return null;

	const money = new Intl.NumberFormat(lang, { style: "currency", currency: "USD" });
	// Newest day first, keyed by the UTC day.
	const today = new Date().toISOString().slice(0, 10);
	const day = days.find((d) => d.key === today);
	const month = days
		.filter((d) => d.key.startsWith(today.slice(0, 7)))
		.reduce((sum, d) => sum + (d.usd ?? 0), 0);
	// The last 7 days, oldest first: a bar each, and a day with no row is a short one.
	const week = Array.from({ length: 7 }, (_, i) => {
		const d = new Date(`${today}T00:00:00Z`);
		d.setUTCDate(d.getUTCDate() - (6 - i));
		const key = d.toISOString().slice(0, 10);
		return { day: key, usd: days.find((x) => x.key === key)?.usd ?? 0 };
	});
	const top = Math.max(...week.map((w) => w.usd), 0.01);
	const items = [
		...inbox.questions.map((q) => ({
			id: `q${q.question.id}`,
			text: `${q.key} ${q.question.question}`,
			ref: `run:${q.run}`,
		})),
		...inbox.approvals.map((a) => ({ id: `a${a.id}`, text: a.summary, ref: `run:${a.run}` })),
		...inbox.plans.map((r) => ({
			id: `p${r.id}`,
			text: `${r.key} ${r.title}`,
			ref: `run:${r.id}`,
		})),
		...inbox.messages.map((m) => ({
			id: `m${m.run}:${m.n}`,
			text: `${m.key} ${m.text}`,
			ref: `run:${m.run}`,
		})),
		...inbox.reviews.map((r) => ({ id: `r${r.number}`, text: r.title, ref: r.reference })),
		...(inbox.timesheet ? [{ id: "timesheet", text: t.home.timesheetDay, ref: "" }] : []),
	].slice(0, FIRST);
	const last = Math.max(0, ...sync.map((c) => c.lastOk ?? 0));
	const failed = sync.some((c) => c.status === "failed");
	// Open the window on the item: it shows the ref in its inspector.
	const openItem = async (ref: string) => {
		await commands.trayOpen();
		if (ref && isTauri()) await emit(OPEN_REF_EVENT, ref);
	};
	const switchTo = async (id: string) => {
		await unwrap(commands.projectsSwitch(id));
		// The main window runs its own switch flow, so its page and data follow the project.
		if (isTauri()) await emit(PROJECT_SWITCHED_EVENT, id);
		await qc.invalidateQueries();
	};

	return (
		<main
			ref={panel}
			className="flex max-h-screen flex-col gap-3 overflow-auto rounded-xl border border-n-6 bg-surface-1/80 p-3 text-ui text-n-12"
		>
			<Select
				label={t.projects.switcher}
				placeholder={t.projects.switcher}
				className="w-full min-w-0 max-w-full shrink"
				value={active?.id ?? ""}
				onValueChange={(id) => void run(() => switchTo(id))}
				items={projects.map((p) => ({ value: p.id, label: p.name }))}
			/>
			<section
				aria-label={t.ui.spendToday}
				className="flex flex-col gap-2 rounded-lg bg-n-2/60 p-3"
			>
				<div className="flex items-end justify-between gap-3">
					<div className="flex flex-col">
						<span className="text-12 text-n-11">{t.ui.spendToday}</span>
						<span className="text-20 font-semibold tabular-nums">
							{money.format(day?.usd ?? 0)}
						</span>
					</div>
					<div className="flex items-baseline gap-1.5">
						<span className="text-12 text-n-11">{u.month}</span>
						<span className="text-ui tabular-nums">{money.format(month)}</span>
					</div>
				</div>
				<div aria-hidden="true" className="flex h-10 items-end gap-1">
					{week.map((v, i) => (
						<span
							key={v.day}
							title={`${v.day}: ${money.format(v.usd)}`}
							style={{ height: `${Math.max(2, (v.usd / top) * BAR_H)}px` }}
							className={i === 6 ? "flex-1 rounded-sm bg-accent" : "flex-1 rounded-sm bg-n-6"}
						/>
					))}
				</div>
				{day?.budget == null ? null : (
					<Progress value={day.usd ?? 0} max={day.budget} label={t.ui.spendToday} />
				)}
			</section>
			{runs.length ? (
				<section aria-label={t.shell.runs} className="flex flex-col">
					<h2 className="flex items-center gap-2 font-medium">
						<LiveDot />
						{format(u.running, { count: runs.length })}
					</h2>
					{runs.map((r) => (
						<div key={r.id} className="flex h-row items-center justify-between gap-2">
							<span className="truncate">
								{r.key} {t.factory.lane[r.lane]}
							</span>
							<Button variant="ghost" onClick={() => void run(() => cancel(r.id))}>
								{format(t.factory.machine.stop, { name: r.key })}
							</Button>
						</div>
					))}
				</section>
			) : null}
			{needsYou > 0 || items.length ? (
				<section aria-label={t.home.needsYou}>
					<h2 className="font-medium">
						{t.home.needsYou} ({needsYou})
					</h2>
					<ul>
						{items.map((i) => (
							<li key={i.id}>
								<button
									type="button"
									onClick={() => void run(() => openItem(i.ref))}
									className="block w-full truncate rounded-md px-2 py-1 text-left hover:bg-n-3"
								>
									{i.text}
								</button>
							</li>
						))}
					</ul>
				</section>
			) : null}
			<AgentsToggle />
			{error ? (
				<span role="alert" className="text-danger-text">
					{error}
				</span>
			) : null}
			{sync.length && (failed || last > 0) ? (
				<span role="status" className={failed ? "text-danger-text" : "text-n-11"}>
					{failed ? u.syncFailed : format(u.synced, { time: clock(last, lang) })}
				</span>
			) : null}
			<Button variant="primary" onClick={() => void commands.trayOpen()}>
				{u.open}
			</Button>
		</main>
	);
}
