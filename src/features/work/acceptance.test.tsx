import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { Providers } from "@/app/providers";
import { commands, type Finding_Serialize, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { routers } from "@/test/routers";
import { importAll, withTracker } from "@/test/tracker";
import { HealthActions } from "../projects/doctor-compliance";

const finding = (id: string): Finding_Serialize => ({
	id,
	group: "refs",
	severity: "warning",
	code: "ref-broken",
	detail: `adr:000${id}`,
	source: null,
	fix: { kind: "recheck" },
});

/** The mock mirror cannot adopt a ticket that the issue tracker just made: the test puts it there. */
function adoptWritten() {
	vi.spyOn(commands, "syncAdopt").mockImplementation(async (key) => {
		const state = mockState();
		const made = Object.values(state.work.written).find((w) => w.key === key);
		const like = state.sync.mirror[0];
		if (!(made && like)) throw new Error(`no ticket ${key}`);
		const item = {
			...like,
			key,
			title: made.row.title,
			description: made.row.description,
			labels: [],
			linked: made.row.reference,
			assignee: null,
		};
		state.sync.mirror.push(item);
		return { status: "ok", data: item as never };
	});
}

describe("Fix all with an agent changes nothing before the person accepts (spec:app-redesign#REQ-031)", () => {
	afterEach(() => vi.restoreAllMocks());

	it("makes no ticket, no change and no run on the first press, and one feature on the confirmation", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		adoptWritten();
		const recipe = await unwrap(commands.workflowGet("feature"));
		await unwrap(
			commands.workflowWrite(
				"feature",
				recipe.text.includes("budget_usd")
					? recipe.text
					: recipe.text.replace("limits:\n", "limits:\n  budget_usd: 3\n"),
			),
		);
		vi.spyOn(commands, "healthRun").mockResolvedValue({
			status: "ok",
			data: ["1", "2"].map(finding),
		});
		const create = vi.spyOn(commands, "workItemCreate");
		const start = vi.spyOn(commands, "runStart");
		const fixes = async () =>
			(await unwrap(commands.featuresList())).filter((f) => f.title.startsWith("Fix the findings"));
		const changes = async () => (await unwrap(commands.specsChanges())).length;
		const runs = mockState().factory.runs.length;
		const changesBefore = await changes();
		const router = createRouter({
			routeTree: createRootRoute({ component: HealthActions }),
			history: createMemoryHistory({ initialEntries: ["/"] }),
		});
		routers().push(router as never);
		render(
			<Providers>
				<RouterProvider router={router as never} />
			</Providers>,
		);
		const fix = await screen.findByRole("button", { name: "Fix all with an agent" });
		await waitFor(() => expect(fix).toBeEnabled());

		await user.click(fix);
		const confirm = await screen.findByRole("button", {
			name: "Start one agent to fix 2 findings? Budget of the run: $3",
		});
		expect(create).not.toHaveBeenCalled();
		expect(start).not.toHaveBeenCalled();
		expect(await fixes()).toEqual([]);
		expect(await changes()).toBe(changesBefore);
		expect(mockState().factory.runs).toHaveLength(runs);

		await user.click(confirm);
		await waitFor(async () => expect(await fixes()).toHaveLength(1));
		expect(start).toHaveBeenCalledTimes(1);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});
