import { screen, waitFor, within } from "@testing-library/react";
import { mountApp } from "@/test/mount";
import { withTracker } from "@/test/tracker";

// spec:app-redesign#REQ-017: the live work is rows, in place of the agents map with its links.
describe("Crew live work", () => {
	it("shows flat rows at the old address of the agents map, and draws no line between them", async () => {
		await withTracker();
		const router = mountApp("/factory/agents-map");
		const table = await screen.findByRole("table", { name: "Agents at work" });
		expect(router.state.location.pathname).toBe("/crew/crew");
		expect(within(table).getAllByRole("row").length).toBeGreaterThan(1);
		// A line between two boxes would be a shape of a drawing: the page has none, and no canvas.
		const main = screen.getByRole("main");
		expect(main.querySelectorAll("line, polyline, [marker-end], canvas")).toHaveLength(0);
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});
