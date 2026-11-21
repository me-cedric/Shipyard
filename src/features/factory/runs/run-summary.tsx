import { type RefObject, useEffect } from "react";
import { endOf } from "@/lib/home";
import type { RunState, RunView } from "@/lib/ipc";
import { nameOf } from "./run-live";

/** The one action that the summary puts first for a state (factory REQ-030). */
export type Primary = "answer" | "approvePlan" | "unblock" | "resume" | "openPr" | "again";

const PRIMARY: Partial<Record<RunState, Primary>> = {
	WaitingForAnswer: "answer",
	PlanReview: "approvePlan",
	Blocked: "unblock",
	Paused: "resume",
	PROpen: "openPr",
	ChangesRequested: "openPr",
	Failed: "again",
	Cancelled: "again",
};

/** The primary action of a state. A run that ended well offers its pull request when it has one. */
export function primaryOf(state: RunState, hasPr: boolean): Primary | null {
	if (state === "Done" || state === "Merged") return hasPr ? "openPr" : null;
	return PRIMARY[state] ?? null;
}

/** The step as n of m, and the name of the step that works, waits or failed. */
export function stepperOf(run: Pick<RunView, "steps">) {
	const done = run.steps.filter((s) => s.state === "done").length;
	const now =
		run.steps.find((s) => s.state === "running") ??
		run.steps.find((s) => s.state === "gate") ??
		run.steps.find((s) => s.state === "failed");
	return {
		n: Math.min(run.steps.length, done + (now ? 1 : 0)),
		total: run.steps.length,
		name: now ? nameOf(now.id) : undefined,
	};
}

/** The name of the agent of a run: the step that works, waits or failed, else the recipe. */
export const agentOf = (run: Pick<RunView, "steps" | "workflow">) =>
	stepperOf(run).name ?? nameOf(run.workflow);

/** Milliseconds as days and hours above 48 hours, as hours and minutes, or as minutes and seconds under one hour. The day and hour units follow `lang`. */
export function duration(ms: number, lang = "en"): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const two = (n: number) => String(n).padStart(2, "0");
	if (h >= 48) {
		const unit = (value: number, u: "day" | "hour") =>
			new Intl.NumberFormat(lang, { style: "unit", unit: u, unitDisplay: "narrow" }).format(value);
		return `${unit(Math.floor(h / 24), "day")} ${unit(h % 24, "hour")}`;
	}
	return h > 0 ? `${h}h ${two(m)}m` : `${m}m ${two(s % 60)}s`;
}

export { endOf };

/** The address of a ticket, only when it is a web address: any other scheme gives undefined. */
export function webUrl(raw: string): string | undefined {
	try {
		const u = new URL(raw);
		return u.protocol === "http:" || u.protocol === "https:" ? u.href : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Keep the sticky header clear of a focused element: set `scroll-padding-top` of the scroll
 * container above it to the height of the header.
 */
export function useScrollClear(head: RefObject<HTMLElement | null>) {
	useEffect(() => {
		const el = head.current;
		let box = el?.parentElement ?? null;
		while (box && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
		if (!(el && box)) return;
		const scroller = box;
		const set = () => {
			scroller.style.scrollPaddingTop = `${el.offsetHeight}px`;
		};
		set();
		const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(set);
		watch?.observe(el);
		return () => {
			watch?.disconnect();
			scroller.style.scrollPaddingTop = "";
		};
	}, [head]);
}

/**
 * The title of the open run takes the focus: an action removed its own control. The refresh after
 * the action can mount the page again: while the focus is on the body, focus the new title (up to 1 s).
 */
export function focusRunTitle(tries = 10) {
	document.querySelector<HTMLElement>("[data-run-title]")?.focus();
	if (tries > 0)
		setTimeout(() => {
			if (document.activeElement === document.body) focusRunTitle(tries - 1);
		}, 100);
}

/**
 * After a card action opens the run page: focus the first match of `selector` once the page has
 * it (up to 2 s), else the title. The card button is gone by then, so the focus would fall to the body.
 */
export function focusOnRunPage(selector: string, tries = 20) {
	const el = document.querySelector<HTMLElement>(selector);
	if (el) el.focus();
	else if (tries > 0) setTimeout(() => focusOnRunPage(selector, tries - 1), 100);
	else focusRunTitle();
}
