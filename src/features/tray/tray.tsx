import { useQueryClient } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import { AgentsToggle } from "@/features/factory/agents-toggle";
import { useCounts } from "@/features/shell/counts";
import { PROJECT_SWITCHED_EVENT } from "@/features/shell/events";
import { useGuard } from "@/features/work/guard";
import { useRunActions, useRuns, useUsage } from "@/lib/factory";
import { useInbox } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import { commands, isTauri, unwrap } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { useActiveProject, useProjects } from "@/lib/projects";
import { clock, useSyncState, useSyncTick } from "@/lib/sync";
import { Button } from "@/ui/atoms/button";
import { Select } from "@/ui/atoms/select";

/** The menu bar icon shows a dot while something needs the person. The main window sends the count. */
export function useTrayBadge() {
	const { needsYou } = useCounts();
	useEffect(() => {
		void commands.trayBadge(needsYou);
	}, [needsYou]);
}

const FIRST = 3;

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
	useEffect(() => {
		const close = (e: KeyboardEvent) => e.key === "Escape" && void commands.trayClose();
		const focus = () => panel.current?.querySelector<HTMLElement>("button, [role=switch]")?.focus();
		window.addEventListener("keydown", close);
		window.addEventListener("focus", focus);
		return () => {
			window.removeEventListener("keydown", close);
			window.removeEventListener("focus", focus);
		};
	}, []);
	if (!tray) return null;

	const money = new Intl.NumberFormat(lang, { style: "currency", currency: "USD" });
	// Newest day first, keyed by the UTC day.
	const today = new Date().toISOString().slice(0, 10);
	const day = days.find((d) => d.key === today);
	const month = days
		.filter((d) => d.key.startsWith(today.slice(0, 7)))
		.reduce((sum, d) => sum + (d.usd ?? 0), 0);
	const items = [
		...inbox.questions.map((q) => ({
			id: `q${q.question.id}`,
			text: `${q.key} ${q.question.question}`,
		})),
		...inbox.approvals.map((a) => ({ id: `a${a.id}`, text: a.summary })),
		...inbox.plans.map((r) => ({ id: `p${r.id}`, text: `${r.key} ${r.title}` })),
		...inbox.messages.map((m) => ({ id: `m${m.run}:${m.n}`, text: `${m.key} ${m.text}` })),
		...inbox.reviews.map((r) => ({ id: `r${r.number}`, text: r.title })),
		...(inbox.timesheet ? [{ id: "timesheet", text: t.home.timesheetDay }] : []),
	].slice(0, FIRST);
	const last = Math.max(0, ...sync.map((c) => c.lastOk ?? 0));
	const failed = sync.some((c) => c.status === "failed");
	const switchTo = async (id: string) => {
		await unwrap(commands.projectsSwitch(id));
		// The main window runs its own switch flow, so its page and data follow the project.
		if (isTauri()) await emit(PROJECT_SWITCHED_EVENT, id);
		await qc.invalidateQueries();
	};

	return (
		<main
			ref={panel}
			className="flex h-screen flex-col gap-3 overflow-auto bg-surface-1 p-3 text-ui text-n-12"
		>
			<section aria-label={t.ui.spendToday} className="flex justify-between">
				<span>
					{t.ui.spendToday} {money.format(day?.usd ?? 0)}
					{day?.budget == null ? "" : ` / ${money.format(day.budget)}`}
				</span>
				<span>
					{u.month} {money.format(month)}
				</span>
			</section>
			<section aria-label={t.shell.runs}>
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
			<section aria-label={t.home.needsYou}>
				<h2 className="font-medium">
					{t.home.needsYou} ({needsYou})
				</h2>
				<ul>
					{items.map((i) => (
						<li key={i.id} className="truncate">
							{i.text}
						</li>
					))}
				</ul>
			</section>
			<AgentsToggle />
			{error ? (
				<span role="alert" className="text-danger-text">
					{error}
				</span>
			) : null}
			{sync.length ? (
				<span role="status" className={failed ? "text-danger-text" : undefined}>
					{failed ? u.syncFailed : format(u.synced, { time: clock(last, lang) })}
				</span>
			) : null}
			<Select
				label={t.projects.switcher}
				value={active?.id ?? ""}
				onValueChange={(id) => void run(() => switchTo(id))}
				items={projects.map((p) => ({ value: p.id, label: p.name }))}
			/>
			<Button variant="primary" onClick={() => void commands.trayOpen()}>
				{u.open}
			</Button>
		</main>
	);
}
