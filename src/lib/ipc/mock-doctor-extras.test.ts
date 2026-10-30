import { beforeEach, describe, expect, it } from "vitest";
import { commands } from "./bindings";
import { resetMock } from "./mock";
import { unwrap } from "./result";

const answers = { name: "Demo", key: "DEMO", summary: "A demo.", stack: "rust", agent: "claude" };

describe("mock Doctor bootstrap", () => {
	beforeEach(() => resetMock());

	it("previews, needs a click, and never replaces a file", async () => {
		const plan = await unwrap(commands.doctorBootstrapPlan(answers));
		expect(plan.files.every((f) => f.state === "new")).toBe(true);
		expect(plan.tools.map((t) => t.id)).toEqual(expect.arrayContaining(["git", "rust", "claude"]));
		await expect(unwrap(commands.doctorBootstrapApply(answers, false))).rejects.toMatchObject({
			details: expect.stringContaining("click"),
		});
		const written = await unwrap(commands.doctorBootstrapApply(answers, true));
		expect(written).toContain("BOOTSTRAP_PROMPT.md");
		expect(await unwrap(commands.doctorBootstrapApply(answers, true))).toEqual([]);
		const after = await unwrap(commands.doctorBootstrapPlan(answers));
		expect(after.files.every((f) => f.state === "exists")).toBe(true);
	});

	it("refuses a bad answer", async () => {
		for (const bad of [
			{ ...answers, name: " " },
			{ ...answers, key: "x y" },
			{ ...answers, stack: "cobol" },
		])
			await expect(unwrap(commands.doctorBootstrapPlan(bad))).rejects.toBeTruthy();
	});
});

describe("mock feedback and debug console", () => {
	beforeEach(() => resetMock());

	it("builds a prefilled issue address after a click and refuses a secret", async () => {
		const url = await unwrap(commands.feedbackOpen("bug", "A & B", "it breaks", true));
		expect(url).toContain("/issues/new?labels=bug&title=A%20%26%20B");
		await expect(unwrap(commands.feedbackOpen("bug", "x", "", false))).rejects.toMatchObject({
			details: expect.stringContaining("click"),
		});
		await expect(unwrap(commands.feedbackOpen("bug", "a\nb", "", true))).rejects.toBeTruthy();
		await expect(
			unwrap(commands.feedbackOpen("idea", "x", "ghp_abcdefghijklmnopqrstuvwxyz0123456789", true)),
		).rejects.toMatchObject({ details: expect.stringContaining("secret") });
	});

	it("lists the log lines", async () => {
		const lines = await unwrap(commands.debugLog());
		expect(lines.map((l) => l.level)).toEqual(["info", "warn", "error"]);
	});
});

describe("mock composer attachments", () => {
	beforeEach(() => resetMock());

	it("keeps a text inline, an image by path, and refuses a secret or a big file", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const id = (await unwrap(commands.assistantCreate(null))).thread.id;
		const bytes = (t: string) => Array.from(new TextEncoder().encode(t));
		const text = await unwrap(commands.assistantAttach(id, "dir/notes.md", bytes("hello")));
		expect(text).toMatchObject({ kind: "text", quote: "hello", name: "notes.md" });
		const img = await unwrap(commands.assistantAttach(id, "shot.PNG", [1, 2, 3]));
		expect(img.quote).toContain("shot.PNG");
		for (const [name, data] of [
			["k.pem", bytes("x")],
			[".hidden", bytes("A=1")],
			["big.txt", new Array(200 * 1024 + 1).fill(97)],
		] as const)
			await expect(unwrap(commands.assistantAttach(id, name, [...data]))).rejects.toBeTruthy();
		await expect(unwrap(commands.assistantAttach("T9999", "a.txt", []))).rejects.toMatchObject({
			details: expect.stringContaining("no thread"),
		});
	});
});

describe("mock outside server groups", () => {
	beforeEach(() => resetMock());

	it("keeps the ticket, ADR and QA tools off until their group is on", async () => {
		const off = await unwrap(commands.mcpOutsideGet());
		expect(off.tools).toEqual(
			expect.arrayContaining(["ticket_comment", "adr_propose", "qa_run_check"]),
		);
		expect(off.active).toEqual([]);
		const on = await unwrap(commands.mcpOutsideSet({ ...off.gates, tickets: true, qa: true }));
		expect(on.active).toEqual([
			"ticket_list",
			"ticket_read",
			"ticket_comment",
			"qa_run_check",
			"qa_read_report",
		]);
	});
});
