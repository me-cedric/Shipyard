import { describe, expect, it } from "vitest";
import { commands } from "./bindings";
import { mockState, resetMock } from "./mock";
import { unwrap } from "./result";

const ctx = { view: "/work", selected: null, refs: [] };
const REF = "spec:auth#REQ-001";

/** An open project and one thread. */
async function thread() {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	return (await unwrap(commands.assistantCreate(null))).thread.id;
}
const send = async (id: string, text: string) => unwrap(commands.assistantSend(id, text, [], ctx));

describe("mock assistant", () => {
	beforeEach(() => resetMock());

	it("fails without a project and keeps the threads of each project apart", async () => {
		await expect(unwrap(commands.assistantThreads())).rejects.toThrow("no active project");
		const id = await thread();
		expect(await unwrap(commands.assistantThreads())).toHaveLength(1);
		await unwrap(commands.projectsOpen("/mock/beta", false));
		expect(await unwrap(commands.assistantThreads())).toEqual([]);
		await expect(unwrap(commands.assistantGet(id))).rejects.toThrow("no thread");
	});

	it("titles a thread from its first line and answers with a trace", async () => {
		const id = await thread();
		const r = await send(id, "What is the plan?\nSecond line");
		expect(r.thread.thread.title).toBe("What is the plan?");
		expect(r.message.trace.length).toBeGreaterThanOrEqual(2);
		expect(r.message.state).toEqual({ state: "done" });
		expect(r.thread.thread.messages).toHaveLength(2);
		expect(await unwrap(commands.assistantRename(id, " Plan "))).toMatchObject({ title: "Plan" });
	});

	it("takes only a ref that resolves", async () => {
		const id = await thread();
		const c = await unwrap(commands.assistantRefAdd(id, `@${REF}`));
		expect(c.refs).toEqual([REF]);
		await expect(unwrap(commands.assistantRefAdd(id, "wi:NONE-1"))).rejects.toThrow("resolve");
		await expect(unwrap(commands.assistantRefAdd(id, "nope"))).rejects.toThrow("not a ref");
		expect((await unwrap(commands.assistantRefRemove(id, REF))).refs).toEqual([]);
	});

	it("drops the model and the effort when the runner changes", async () => {
		const id = await thread();
		const base = (await unwrap(commands.assistantGet(id))).thread.settings;
		const a = await unwrap(
			commands.assistantSettingsSet(id, { ...base, model: "opus", effort: "high" }),
		);
		expect(a.thread.settings).toMatchObject({ model: "opus", effort: "high" });
		const b = await unwrap(commands.assistantSettingsSet(id, { ...base, runner: "codex" }));
		expect(b.thread.settings).toMatchObject({ runner: "codex", model: null, effort: null });
		expect(b.gauge.quotas).toHaveLength(1);
	});

	it("fails a turn as a message, then retries it, and refuses a spent budget", async () => {
		const id = await thread();
		const failed = await send(id, "quota please");
		expect(failed.message.state).toMatchObject({ state: "failed", kind: "quota" });
		const ok = await unwrap(commands.assistantRetry(id));
		expect(ok.message.state.state).toBe("done");
		await expect(unwrap(commands.assistantRetry(id))).rejects.toThrow("did not fail");
		await expect(send(id, "spent")).rejects.toThrow("is spent");
		expect((await send(id, "alert")).alert).toBe("day 2026-10-29");
	});

	it("lists options, a code block and the context ring", async () => {
		const id = await thread();
		expect((await send(id, "options")).message.text).toMatch(/\?\n- .+\n- /);
		expect((await send(id, "code")).message.text).toContain("```ts src/hello.ts");
		const r = await send(id, "long");
		expect(r.thread.gauge.usedTokens / r.thread.gauge.windowTokens).toBeCloseTo(0.6);
	});

	it("waits for a permission in agent mode and grants it", async () => {
		const id = await thread();
		const base = (await unwrap(commands.assistantGet(id))).thread.settings;
		await unwrap(commands.assistantSettingsSet(id, { ...base, mode: "agent" }));
		const w = await send(id, "deny it");
		expect(w.message.state).toEqual({ state: "waiting", permission: "Bash(pnpm test)" });
		expect(w.changed.map((f) => f.path)).toEqual(["src/hello.ts"]);
		expect((await unwrap(commands.assistantGet(id))).thread.worktree?.branch).toBe(
			`assistant/${id}`,
		);
		const g = await unwrap(commands.assistantGrant(id));
		expect(g.thread.thread.granted).toEqual(["Bash(pnpm test)"]);
		await expect(unwrap(commands.assistantDelete(id))).rejects.toThrow("Discard");
		await unwrap(commands.assistantWorktreeDiscard(id, true));
		await unwrap(commands.assistantDelete(id));
		expect(await unwrap(commands.assistantThreads())).toEqual([]);
	});

	it("explains a ref that resolves and says so for one that does not", async () => {
		const id = await thread();
		const ok = await unwrap(commands.assistantExplain(id, REF));
		expect(ok.message.refs).toEqual([REF]);
		const none = await unwrap(commands.assistantExplain(id, "wi:NONE-1"));
		expect(none.message.text).toContain("No source");
		expect(none.message.refs).toEqual([]);
	});

	it("previews and sends to the factory once", async () => {
		const id = await thread();
		await expect(unwrap(commands.assistantToFactoryPreview(id))).rejects.toThrow("empty");
		await send(id, "Plan the export");
		const p = await unwrap(commands.assistantToFactoryPreview(id));
		expect(p).toMatchObject({ action: "create", row: { reference: `doc:assistant/${id}` } });
		await expect(unwrap(commands.assistantToFactory(id, null, false))).rejects.toThrow("Confirm");
		const a = await unwrap(commands.assistantToFactory(id, "feature", true));
		expect(a).toMatchObject({ label: "wf:feature", item: { action: "create" } });
		const b = await unwrap(commands.assistantToFactory(id, null, true));
		expect(b).toMatchObject({ label: null, item: { action: "unchanged", key: a.item.key } });
	});

	it("keeps the defaults and starts a new thread with them", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const d = {
			runner: "codex",
			model: "gpt-5",
			effort: null,
			mode: "plan",
			permission: null,
		} as const;
		await unwrap(commands.assistantDefaultsSet(d));
		expect(await unwrap(commands.assistantDefaultsGet())).toEqual(d);
		const t = await unwrap(commands.assistantCreate("x"));
		expect(t.thread.settings).toMatchObject({ runner: "codex", model: "gpt-5", mode: "plan" });
		expect((await unwrap(commands.assistantOptions())).map((o) => o.runner)).toEqual([
			"claude",
			"codex",
		]);
		await expect(unwrap(commands.assistantDefaultsSet({ ...d, runner: "nope" }))).rejects.toThrow(
			"unknown runner",
		);
	});

	it("keeps the width and the side in the preferences", async () => {
		expect(mockState().prefs).toMatchObject({ assistantWidth: 400, assistantSide: "right" });
		await unwrap(commands.prefsSet({ assistantWidth: 520, assistantSide: "left" }));
		expect(await unwrap(commands.prefsGet())).toMatchObject({
			assistantWidth: 520,
			assistantSide: "left",
		});
	});
});
