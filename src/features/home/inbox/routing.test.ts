import type { useInbox } from "@/lib/home";
import { routeInbox } from "./routing";

const inbox = {
	loading: false,
	timesheet: false,
	messages: [],
	approvals: [{ id: 1, right: "runs.approve" }],
	plans: [{ id: "r1" }],
	questions: [
		{ key: "A-1", question: { spec: null } },
		{ key: "A-2", question: { spec: "spec:x#REQ-1" } },
	],
	reviews: [{ number: 1 }],
} as unknown as ReturnType<typeof useInbox>;
const who = (role: string | null, rights: string[], over = {}) => ({
	everyone: false,
	can: (r: string) => rights.includes(r),
	role,
	assignee: () => null,
	me: "ana",
	...over,
});

describe("routeInbox", () => {
	it("hides an approval and a plan from a person without runs.approve", () => {
		const r = routeInbox(inbox, who("pm", ["work.edit"]) as never);
		expect([r.approvals.length, r.plans.length, r.reviews.length]).toEqual([0, 0, 0]);
	});

	it("sends a question to its assignee and to the owner roles of its topic", () => {
		const keys = (role: string, over = {}) =>
			routeInbox(inbox, who(role, [], over) as never).questions.map((q) => q.key);
		expect(keys("qa")).toEqual([]);
		expect(keys("qa", { assignee: (k: string) => (k === "A-1" ? "ana" : null) })).toEqual(["A-1"]);
		expect(keys("ba")).toEqual(["A-2"]);
	});

	it("shows each item with Everyone and to a solo person", () => {
		expect(routeInbox(inbox, who("pm", [], { everyone: true }) as never)).toBe(inbox);
		expect(routeInbox(inbox, who(null, []) as never)).toBe(inbox);
	});
});
