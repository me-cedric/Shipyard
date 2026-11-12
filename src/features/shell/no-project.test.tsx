import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

describe("No-project page (REQ-006)", () => {
	it.each([
		["/work/backlog", "Backlog"],
		["/specs/capabilities", "Capabilities"],
		["/code/changes", "Code"],
		["/design/architecture", "Architecture"],
		["/factory/runs", "Runs"],
		["/knowledge/graph", "Graph"],
	])("%s offers the three ways to open a project under one h1", async (path, title) => {
		const user = userEvent.setup();
		const router = mountApp(path);
		expect(await screen.findByRole("button", { name: "Open a local folder" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Clone a repository" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { level: 1, name: title })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "New project" }));
		expect(await screen.findByRole("dialog")).toBeInTheDocument();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("shows the error when the folder is not a repository", async () => {
		const user = userEvent.setup();
		const router = mountApp("/work/backlog");
		mockState().nextFolder = "/mock/plain";
		await user.click(await screen.findByRole("button", { name: "Open a local folder" }));
		expect(await screen.findByText("No Git repository in /mock/plain")).toBeInTheDocument();
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});
});
