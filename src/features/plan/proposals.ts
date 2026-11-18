import { addDays, type Decisions } from "@/lib/work";

type Day = { day: string; used: number | null; capacity: number | null };
type MemberLoad = { handle: string; days: Day[] };
type PlanBar = { task: string; name: string; member?: string | null; start: string; end: string };

/** The days on which a person has more work than capacity. */
export const overDays = (days: Day[]) =>
	days.filter((d) => (d.used ?? 0) > (d.capacity ?? 0) + 1e-6);

/** The people with one day over or more. */
export const overloaded = (load: MemberLoad[]) => load.filter((m) => overDays(m.days).length > 0);

/** One change of the plan that takes work from a person who has too much: a new owner or a later start. */
export type Proposal = { task: string; name: string; from: string; to?: string; start?: string };

/**
 * One proposal for each person who is over, from the bars of one sheet (`spec:app-redesign#REQ-018`).
 * The task goes to the person of the same role with the least work on its days. With no such
 * person, the task starts after the last day over.
 */
// shortcut: one task for each person, no check that the load is right after it. The plan computes
// again after each apply and gives the next proposals. Upgrade when the scheduler can rebalance.
export function proposals(
	bars: PlanBar[],
	load: MemberLoad[],
	members: { handle: string; role: string }[],
	isOff: (day: string) => boolean = () => false,
): Proposal[] {
	const over = new Map(overloaded(load).map((m) => [m.handle, overDays(m.days).map((d) => d.day)]));
	return [...over].flatMap(([from, days]): Proposal[] => {
		// The last task on a day over: the tasks before it keep their dates.
		const bar = bars
			.filter((b) => b.member === from && days.some((d) => d >= b.start && d <= b.end))
			.sort((a, b) => b.start.localeCompare(a.start))[0];
		if (!bar) return [];
		const role = members.find((m) => m.handle === from)?.role;
		const busy = (handle: string) =>
			(load.find((m) => m.handle === handle)?.days ?? [])
				.filter((d) => d.day >= bar.start && d.day <= bar.end)
				.reduce((n, d) => n + (d.used ?? 0), 0);
		const to = members
			.filter((m) => m.handle !== from && m.role === role && !over.has(m.handle))
			.sort((a, b) => busy(a.handle) - busy(b.handle))[0];
		const head = { task: bar.task, name: bar.name, from };
		if (to) return [{ ...head, to: to.handle }];
		let start = addDays(days.at(-1) ?? bar.start, 1);
		// 14 days at most: a calendar with no working day must not loop.
		for (let i = 0; i < 14 && isOff(start); i++) start = addDays(start, 1);
		return start > bar.start ? [{ ...head, start }] : [];
	});
}

/** The decisions with the proposals in them. Each proposal changes the owner or the start of one task. */
export function withProposals(d: Decisions, list: Proposal[]): Decisions {
	const tasks = { ...d.tasks };
	for (const p of list)
		tasks[p.task] = { ...tasks[p.task], ...(p.to ? { member: p.to } : { start: p.start }) };
	return { ...d, tasks };
}
