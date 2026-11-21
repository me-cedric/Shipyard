import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountKnowledge } from "./harness";

const HOME = "src/features/home/home.tsx";
const day = (iso: string) => Date.parse(iso) / 1000;

// spec:library-functions#REQ-012
describe("Stale chip on the map of the code", () => {
	it("shows the chip Stale on a part whose spec changed after the code", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const changed = mockState().knowledge.changed;
		changed["spec:home"] = day("2026-11-18");
		changed[HOME] = day("2026-11-10");
		const router = await mountKnowledge("graph", "/library/graph?source=code");
		await user.click(await screen.findByRole("button", { name: /^src\/features\/home/ }));
		// The first file of the folder is open: its card shows the chip.
		const open = within(await screen.findByRole("region", { name: "src/features/home" }));
		expect(await open.findByText("Stale")).toBeVisible();
		await user.click(
			await screen.findByRole("button", { name: "File src/features/home/today.tsx" }),
		);
		// The file is a chip now, and a part with a fresh spec shows no chip.
		const stale = await screen.findByRole("button", { name: `File ${HOME}, Stale` });
		expect(within(stale).getByText("Stale")).toBeVisible();
		expect(screen.getAllByText("Stale")).toHaveLength(1);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("shows no chip when the code changed after its spec", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const changed = mockState().knowledge.changed;
		changed["spec:home"] = day("2026-11-10");
		changed[HOME] = day("2026-11-18");
		const router = await mountKnowledge("graph", "/library/graph?source=code");
		await screen.findByRole("button", { name: /^src\/features\/home/ });
		expect(screen.queryByText("Stale")).toBeNull();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});
