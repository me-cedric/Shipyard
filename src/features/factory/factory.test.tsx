import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER } from "@/lib/ipc/mock";
import { ShellProvider, useShell } from "@/lib/shell";
import { spendStatus } from "@/ui/molecules/spend-meter";
import { renderApp } from "@/ui/test-utils";
import { AgentsMap, Sessions, Usage, Workflows } from "./index";

/** Stands in for the inspector of the shell. */
function Panel() {
	const { selectedRef } = useShell();
	return <aside aria-label="panel">{selectedRef}</aside>;
}

async function renderTab(tab: React.ReactNode) {
	await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
	return renderApp(
		<ShellProvider>
			{tab}
			<Panel />
		</ShellProvider>,
	);
}

describe("Factory tabs", () => {
	// jsdom has no matchMedia: the graph reads the colour scheme and the motion preference.
	beforeEach(() => {
		window.matchMedia = ((query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		})) as unknown as typeof window.matchMedia;
	});

	it("Workflows: two groups with counts, from the mock", async () => {
		await renderTab(<Workflows />);
		const wf = await unwrap(commands.workflowsList());
		const roles = await unwrap(commands.rolesList());
		expect(
			await screen.findByRole("heading", { name: `Workflows (${wf.length})` }),
		).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: `Roles (${roles.length})` })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /^bug/ })).toHaveTextContent("fix");
	});

	it("Workflows: a validation error shows with its line, and blocks the save", async () => {
		const user = userEvent.setup();
		await renderTab(<Workflows />);
		await user.click(await screen.findByRole("button", { name: /^bug/ }));
		const editor = await screen.findByRole("textbox", { name: "bug" });
		fireEvent.change(editor, {
			target: { value: (editor as HTMLTextAreaElement).value.replace("id: bug", "id: other") },
		});
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("Line 2");
		expect(alert).toHaveTextContent("differs from the file name");
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
	});

	it("Workflows: save calls workflowWrite", async () => {
		const user = userEvent.setup();
		await renderTab(<Workflows />);
		await user.click(await screen.findByRole("button", { name: /^bug/ }));
		const editor = (await screen.findByRole("textbox", { name: "bug" })) as HTMLTextAreaElement;
		const next = `${editor.value}\n# note\n`;
		fireEvent.change(editor, { target: { value: next } });
		const save = screen.getByRole("button", { name: "Save" });
		await waitFor(() => expect(save).toBeEnabled());
		await user.click(save);
		await waitFor(async () => expect((await unwrap(commands.workflowGet("bug"))).text).toBe(next));
	});

	it("Workflows: a role saves with roleWrite", async () => {
		const user = userEvent.setup();
		await renderTab(<Workflows />);
		await user.click(await screen.findByRole("button", { name: /^scout/ }));
		const editor = (await screen.findByRole("textbox", { name: "scout" })) as HTMLTextAreaElement;
		const next = `${editor.value}\nBe brief.\n`;
		fireEvent.change(editor, { target: { value: next } });
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(async () => expect((await unwrap(commands.roleGet("scout"))).text).toBe(next));
	});

	it("Sessions: lists the sessions, and the kill switch toggles", async () => {
		const user = userEvent.setup();
		await renderTab(<Sessions />);
		const rows = await unwrap(commands.sessionsList());
		expect(rows.length).toBeGreaterThan(0);
		expect(await screen.findByRole("table", { name: "Sessions" })).toBeInTheDocument();
		expect(await screen.findAllByText(rows[0]?.key ?? "")).not.toHaveLength(0);
		const on = await screen.findByRole("switch", { name: "Agents on" });
		expect(on).toBeChecked();
		await user.click(on);
		await waitFor(async () => expect(await unwrap(commands.killSwitchGet())).toBe(true));
		const stopped = await screen.findByRole("switch", { name: "Agents stopped" });
		expect(stopped).not.toBeChecked();
		await user.click(stopped);
		await waitFor(async () => expect(await unwrap(commands.killSwitchGet())).toBe(false));
	});

	it("Usage: three groups with counts, and budgetSet", async () => {
		const user = userEvent.setup();
		await renderTab(<Usage />);
		const u = await unwrap(commands.usageGet());
		for (const [name, n] of [
			["Per run", u.runs.length],
			["Per day", u.days.length],
			["Per member", u.members.length],
		] as const)
			expect(await screen.findByRole("heading", { name: `${name} (${n})` })).toBeInTheDocument();
		const day = u.days[0]?.key ?? "";
		await user.type(screen.getByRole("textbox", { name: "Day or member" }), day);
		await user.type(screen.getByRole("spinbutton", { name: "Budget (USD)" }), "3");
		await user.click(screen.getByRole("button", { name: "Set budget" }));
		await waitFor(async () =>
			expect((await unwrap(commands.usageGet())).days.find((d) => d.key === day)?.budget).toBe(3),
		);
		expect((await screen.findAllByRole("meter")).length).toBeGreaterThan(0);
		// An empty amount clears the budget.
		await user.type(screen.getByRole("textbox", { name: "Day or member" }), day);
		await user.click(screen.getByRole("button", { name: "Set budget" }));
		await waitFor(async () =>
			expect(
				(await unwrap(commands.usageGet())).days.find((d) => d.key === day)?.budget,
			).toBeNull(),
		);
	});

	it("Usage: the request tree nests the requests of a run under its steps", async () => {
		await renderTab(<Usage />);
		const u = await unwrap(commands.usageGet());
		const trees = await Promise.all(u.runs.map((r) => unwrap(commands.usageTreeGet(r.run))));
		// The totals of a tree are the ones of its run when a step has started.
		const tree = trees.find((x) => x.steps.length > 0);
		if (!tree) throw new Error("the demo has a started run");
		const run = u.runs.find((r) => r.run === tree.run);
		expect(tree.tokens).toBe(run?.tokens);
		expect(tree.usd).toBeCloseTo(run?.usd ?? 0, 1);
		await screen.findByText("Request tree");
		// The view shows the first run.
		const shown = trees[0]?.steps.reduce((n, s) => n + s.requests.length, 0) ?? 0;
		await waitFor(() => expect(document.querySelectorAll("details li")).toHaveLength(shown));
		await expect(unwrap(commands.usageTreeGet("nope"))).rejects.toThrow("no run");
	});

	it("Usage: the spend flame graph has one keyboard reachable bar for each step", async () => {
		const user = userEvent.setup();
		await renderTab(<Usage />);
		const u = await unwrap(commands.usageGet());
		const trees = await Promise.all(u.runs.map((r) => unwrap(commands.usageTreeGet(r.run))));
		const at = trees.findIndex((x) => x.steps.some((s) => s.tokens > 0));
		const run = u.runs[at];
		const step = trees[at]?.steps.find((s) => s.tokens > 0);
		if (!run || !step) throw new Error("the demo has a started run");
		await screen.findByText("Request tree");
		if (at > 0) {
			await user.click(screen.getByRole("combobox", { name: "Run" }));
			await user.click(await screen.findByRole("option", { name: run.key }));
		}
		const graph = await screen.findByRole("region", { name: "Spend flame graph" });
		const bar = await within(graph).findByRole("button", {
			name: `${step.step}: ${step.tokens} tokens`,
		});
		bar.focus();
		expect(bar).toHaveFocus();
	});

	it("Usage: a member scope sets the default member budget", async () => {
		const user = userEvent.setup();
		await renderTab(<Usage />);
		await user.click(await screen.findByRole("combobox", { name: "Budget for" }));
		await user.click(await screen.findByRole("option", { name: "Per member" }));
		await user.type(screen.getByRole("textbox", { name: "Day or member" }), "*");
		await user.type(screen.getByRole("spinbutton", { name: "Budget (USD)" }), "4");
		await user.click(screen.getByRole("button", { name: "Set budget" }));
		await waitFor(async () => {
			const { members } = await unwrap(commands.usageGet());
			expect(members.some((m) => m.budget === 4)).toBe(true);
		});
	});

	it("Usage: status colour at 80 % and 100 %", () => {
		expect(spendStatus(1, null)).toBeNull();
		expect(spendStatus(7.9, 10)).toBe("success");
		expect(spendStatus(8, 10)).toBe("warning");
		expect(spendStatus(10, 10)).toBe("danger");
	});

	it("Agents map: a click and Enter open the entity in the inspector", async () => {
		const user = userEvent.setup();
		await renderTab(<AgentsMap />);
		const runs = await unwrap(commands.runsList());
		const run = runs.find((r) => r.key === "ACME-2");
		if (!run) throw new Error("ACME-2");
		const node = async (ref: string) =>
			within(await screen.findByTestId(`rf__node-${ref}`)).getByRole("button", { hidden: true });
		// jsdom measures no node, so xyflow keeps each one hidden.
		await user.click(await node(run.reference));
		const panel = screen.getByRole("complementary", { name: "panel" });
		expect(panel).toHaveTextContent(run.reference);
		const ticket = await node("wi:ACME-3");
		ticket.focus();
		await user.keyboard("{Enter}");
		expect(panel).toHaveTextContent("wi:ACME-3");
	});
});
