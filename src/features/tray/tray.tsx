import { useQueryClient } from "@tanstack/react-query";
import { emit, listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { useCounts } from "@/features/shell/counts";
import { OPEN_PATH_EVENT, OPEN_REF_EVENT, PROJECT_SWITCHED_EVENT } from "@/features/shell/events";
import { useGuard } from "@/features/work/guard";
import { useCodeActions } from "@/lib/code";
import {
	useDailySpend,
	useFactoryWrites,
	useKillSwitch,
	useRunActions,
	useRuns,
} from "@/lib/factory";
import { latestPerTicket, useNeedsYou } from "@/lib/home";
import { format, useI18n } from "@/lib/i18n";
import { commands, isTauri, unwrap } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { useActiveProject, useProjects } from "@/lib/projects";
import { clock, TICK_EVENT, useSyncNow, useSyncState, useSyncTick } from "@/lib/sync";
import { Avatar } from "@/ui/atoms/avatar";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Progress } from "@/ui/atoms/progress";
import { Select } from "@/ui/atoms/select";
import { Skeleton } from "@/ui/atoms/skeleton";
import { Switch } from "@/ui/atoms/switch";
import { ChevronRightIcon } from "@/ui/icons";
import { Card } from "@/ui/molecules/card";
import { ConfirmButton } from "@/ui/molecules/confirm-button";

/** The panel is 360 wide and at least 280 high: the window fits the content. */
const WIDTH = 360;
const MIN_H = 280;
/** The panel grows with its content up to this share of the screen, then it scrolls. */
const MAX_SHARE = 0.8;
/** The panel lists this many things that need the person; a row opens the rest in Today. */
const SHOWN = 3;
/** The height of the tallest bar, in px: the box of the bars is 40 px. */
const BAR_H = 40;

/** The menu bar panel: the same hooks and writes as the main window, in a small layout. */
export function TrayView() {
	const { t, lang } = useI18n();
	const u = t.ui.tray;
	const { tray } = usePrefs();
	const qc = useQueryClient();
	// The same list as Today (spec:app-redesign#REQ-008): all of it, the panel scrolls.
	const { items, timesheet } = useNeedsYou();
	// The count has the project check, as the menu has.
	const { needsYou } = useCounts();
	const runs = latestPerTicket(useRuns().data ?? []).filter(
		(r) => r.lane === "working" || r.lane === "needs_you",
	);
	const { cancel } = useRunActions();
	const { error, busy, run } = useGuard();
	const kill = useKillSwitch().data;
	const writes = useFactoryWrites();
	const syncNow = useSyncNow();
	const { pull } = useCodeActions();
	// The chart of 7 days and the month are behind the spend figure.
	const [chart, setChart] = useState(false);
	// The spend of every AI tool on this computer, as Factory / Usage shows it: Shipyard runs are in it too.
	const spend = useDailySpend(7);
	const { monthBudget } = spend;
	const projects = useProjects().data ?? [];
	const active = useActiveProject().data;
	const sync = useSyncState().data ?? [];
	useSyncTick();
	const panel = useRef<HTMLElement>(null);
	const content = useRef<HTMLDivElement>(null);
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
	// The window fits the content, between a floor and a share of the screen. The observer watches
	// the content, not the scrolling frame: a capped frame stops changing size when the content grows.
	// biome-ignore lint/correctness/useExhaustiveDependencies: the panel exists once `tray` is true
	useEffect(() => {
		const el = panel.current;
		const inner = content.current;
		if (!(el && inner && isTauri() && typeof ResizeObserver !== "undefined")) return;
		const resize = () => {
			// The frame adds its border to the height of the content.
			const frame = el.offsetHeight - el.clientHeight;
			const max = Math.max(MIN_H, Math.round(window.screen.availHeight * MAX_SHARE));
			const h = Math.min(max, Math.max(MIN_H, Math.ceil(inner.scrollHeight + frame)));
			void import("@tauri-apps/api/window")
				.then((m) => m.getCurrentWindow().setSize(new m.LogicalSize(WIDTH, h)))
				.catch(() => {});
		};
		const watch = new ResizeObserver(resize);
		watch.observe(inner);
		resize();
		return () => watch.disconnect();
	}, [tray]);
	if (!tray) return null;

	const money = new Intl.NumberFormat(lang, { style: "currency", currency: "USD" });
	const todayUsd = spend.today;
	const { month } = spend;
	// The last 7 days, oldest first: a bar each, and a day with no row is a short one.
	const week = spend.series;
	const top = Math.max(...week.map((w) => w.usd), 0.01);
	const last = Math.max(0, ...sync.map((c) => c.lastOk ?? 0));
	const failed = sync.some((c) => c.status === "failed");
	// Open the window on the item: it shows the ref in its inspector.
	const openItem = async (ref: string) => {
		await commands.trayOpen();
		if (ref && isTauri()) await emit(OPEN_REF_EVENT, ref);
	};
	// The sync action of the main window: commit when auto-commit is on, one tick, then pull.
	const syncAll = async () => {
		await unwrap(commands.autoCommitRun());
		const tick = await syncNow().then(
			() => null,
			(e: unknown) => e,
		);
		await pull();
		if (tick) throw tick;
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
			className="max-h-screen overflow-auto rounded-xl border border-n-6 bg-surface-0/90 text-ui text-n-12"
		>
			<div ref={content} className="flex flex-col gap-3 p-4">
				<div className="flex min-h-control items-center gap-2.5">
					<span aria-hidden="true" className="size-7 shrink-0 rounded-sm bg-accent" />
					{/* The name is the project switch. */}
					<Select
						label={t.projects.switcher}
						placeholder={t.projects.switcher}
						className="min-w-0 max-w-full shrink border-transparent bg-transparent px-1 font-semibold text-17"
						value={active?.id ?? ""}
						onValueChange={(id) => void run(() => switchTo(id))}
						items={projects.map((p) => ({ value: p.id, label: p.name }))}
					/>
					{sync.length && (failed || last > 0) ? (
						<Badge
							role="status"
							dot
							variant={failed ? "danger" : "success"}
							className="ml-auto shrink-0"
						>
							{failed ? u.syncFailed : format(u.synced, { time: clock(last, lang) })}
						</Badge>
					) : null}
				</div>
				{needsYou ? (
					<Card aria-label={t.home.needsYou} role="region" className="py-1">
						<h2 className="px-4 pt-3 pb-0.5 font-semibold text-13 text-n-11">
							{format(needsYou === 1 ? t.home.needsOne : t.home.needsMany, {
								count: needsYou,
							})}
						</h2>
						<ul>
							{items.slice(0, SHOWN).map((i) => (
								<li key={i.id} className="[&+&]:border-t [&+&]:border-n-6">
									<button
										type="button"
										onClick={() => void run(() => openItem(i.ref))}
										className="flex min-h-13 w-full items-center gap-3 px-4 text-left hover:bg-n-2"
									>
										<Avatar name={i.by || "Shipyard"} size="s" agent={i.who === "agent"} />
										<span className="min-w-0 flex-1 truncate font-semibold">{i.text}</span>
										<ChevronRightIcon size={16} />
									</button>
								</li>
							))}
							{items.length > SHOWN ? (
								<li className="border-t border-n-6">
									<button
										type="button"
										onClick={() =>
											void run(async () => {
												await commands.trayOpen();
												if (isTauri()) await emit(OPEN_PATH_EVENT, "/");
											})
										}
										className="flex min-h-13 w-full items-center gap-3 px-4 text-left font-semibold text-accent hover:bg-n-2"
									>
										<span className="min-w-0 flex-1">{format(u.all, { count: items.length })}</span>
										<ChevronRightIcon size={16} />
									</button>
								</li>
							) : null}
						</ul>
					</Card>
				) : null}
				{runs.length ? (
					<Card aria-label={t.shell.runs} role="region" className="py-1">
						<h2 className="px-4 pt-3 pb-0.5 font-semibold text-13 text-n-11">{u.running}</h2>
						{runs.map((r) => (
							<div
								key={r.id}
								className="flex min-h-13 items-center gap-3 pr-2 pl-4 [&+&]:border-t [&+&]:border-n-6"
							>
								<Avatar name={r.workflow || "Shipyard"} size="s" agent />
								<span className="min-w-0 flex-1 truncate font-semibold">{r.title || r.key}</span>
								<ConfirmButton
									className="px-3"
									confirm={format(t.factory.machine.confirmStop, { name: r.title || r.key })}
									onConfirm={() => void run(() => cancel(r.id))}
									aria-label={format(t.factory.machine.stop, { name: r.title || r.key })}
								>
									{t.assistant.stop}
								</ConfirmButton>
							</div>
						))}
					</Card>
				) : null}
				<Card className="flex min-h-14 flex-wrap items-center gap-x-3 px-4">
					<span className="font-semibold">{u.agents}</span>
					<button
						type="button"
						aria-expanded={chart}
						aria-label={`${t.ui.spendToday} ${spend.ready ? money.format(todayUsd) : ""}`}
						onClick={() => setChart((v) => !v)}
						className="inline-flex min-h-control items-center text-n-11 tabular-nums hover:text-n-12"
					>
						{spend.ready ? money.format(todayUsd) : <Skeleton className="h-5 w-12" />}
					</button>
					{kill === undefined ? null : (
						<span className="ml-auto">
							<Switch
								iconOnly
								label={kill ? t.factory.agentsStopped : t.factory.agentsOn}
								checked={!kill}
								onCheckedChange={(on) => void run(() => writes.killSwitch(!on))}
								className={kill ? "border-danger bg-danger-soft" : "data-[checked]:bg-success"}
							/>
						</span>
					)}
					{chart ? (
						<section aria-label={t.ui.spendToday} className="flex w-full flex-col gap-2 pb-4">
							<div className="flex items-end justify-between gap-3">
								<div className="flex flex-col">
									<span className="text-13 text-n-11">{t.ui.spendToday}</span>
									{spend.ready ? (
										<span className="font-semibold text-20 tabular-nums">
											{money.format(todayUsd)}
										</span>
									) : (
										<Skeleton className="h-7 w-20" />
									)}
								</div>
								<div className="flex items-baseline gap-1.5">
									<span className="text-13 text-n-11">{u.month}</span>
									{spend.ready ? (
										<span className="tabular-nums">{money.format(month)}</span>
									) : (
										<Skeleton className="h-5 w-12" />
									)}
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
							{monthBudget == null ? null : (
								<Progress value={month} max={monthBudget} label={u.month} />
							)}
						</section>
					) : null}
				</Card>
				{timesheet ? (
					<Card
						role="region"
						aria-label={t.home.logToday}
						className="flex min-h-14 items-center gap-3 pr-2 pl-4"
					>
						<span className="mr-auto text-n-11">{t.home.logToday}</span>
						<Button
							className="px-3"
							onClick={() =>
								void run(async () => {
									await commands.trayOpen();
									if (isTauri()) await emit(OPEN_PATH_EVENT, "/plan/time");
								})
							}
						>
							{t.home.log}
						</Button>
					</Card>
				) : null}
				{error ? (
					<span role="alert" className="text-danger-text">
						{error}
					</span>
				) : null}
				<div className="flex gap-2.5">
					<Button className="flex-1" busy={busy} onClick={() => void run(syncAll)}>
						{t.shell.sync}
					</Button>
					<Button variant="primary" className="flex-[2]" onClick={() => void commands.trayOpen()}>
						{u.open}
					</Button>
				</div>
			</div>
		</main>
	);
}
