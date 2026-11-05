import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountApp } from "@/test/mount";

const open = async () => {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	await unwrap(commands.filesCreateFile("docs/openspec/x/spec.md", true));
};

describe("Docs chain acknowledgement", () => {
	it("keeps a stale link as it is with a reason, and takes the reason back", async () => {
		const user = userEvent.setup();
		await open();
		mountApp("/code/impacts");
		expect(await screen.findByRole("heading", { name: "Docs chain (1)" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Acknowledge Test plans" }));
		const dialog = within(await screen.findByRole("dialog"));
		expect(dialog.getByRole("button", { name: "Acknowledge" })).toBeDisabled();
		await user.type(dialog.getByRole("textbox", { name: "Reason" }), "No test impact");
		await user.click(dialog.getByRole("button", { name: "Acknowledge" }));
		expect(await screen.findByText("Reason: No test impact")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Docs chain (0)" })).toBeInTheDocument();
		expect(mockState().review?.acks).toHaveLength(1);
		await user.click(screen.getByRole("button", { name: "Withdraw Test plans" }));
		expect(await screen.findByRole("heading", { name: "Docs chain (1)" })).toBeInTheDocument();
		expect(mockState().review?.acks).toHaveLength(0);
	});

	it("shows a red badge on the page whose artifacts are stale, and none after an acknowledgement", async () => {
		await open();
		mountApp("/specs/changes");
		const link = await screen.findByRole("link", { name: /Test plans/ });
		await waitFor(() => expect(link).toHaveTextContent("Out of date"));
		expect(screen.getByRole("link", { name: /Capabilities/ })).not.toHaveTextContent("Out of date");
	});

	it("shows no badge when the link was acknowledged", async () => {
		await open();
		await unwrap(commands.codeChainAck("main", "specs", "test-plans", "Not needed", true));
		mountApp("/specs/changes");
		const link = await screen.findByRole("link", { name: /Test plans/ });
		await waitFor(() => expect(mockState().review?.acks).toHaveLength(1));
		expect(link).not.toHaveTextContent("Out of date");
	});

	it("refuses an empty reason and a call with no click", async () => {
		await open();
		await expect(
			unwrap(commands.codeChainAck("main", "specs", "test-plans", " ", true)),
		).rejects.toBeDefined();
		await expect(
			unwrap(commands.codeChainAck("main", "specs", "test-plans", "x", false)),
		).rejects.toBeDefined();
		expect(mockState().review?.acks ?? []).toHaveLength(0);
	});

	it("starts an agent run only after a click and then links to the run", async () => {
		const user = userEvent.setup();
		await open();
		const start = vi.spyOn(commands, "codeDocsUpdateStart");
		mountApp("/code/impacts");
		const update = await screen.findByRole("button", { name: "Update with an agent: Test plans" });
		expect(start).not.toHaveBeenCalled();
		await user.click(update);
		expect(start).toHaveBeenCalledWith("test-plans", "branch", true);
		expect(await screen.findByRole("link", { name: "Run of Test plans" })).toHaveAttribute(
			"href",
			"/factory/runs",
		);
		// The acknowledge action stays.
		expect(screen.getByRole("button", { name: "Acknowledge Test plans" })).toBeInTheDocument();
		start.mockRestore();
	});

	it("names each doc that the agent left unreadable when the run ends", async () => {
		const user = userEvent.setup();
		await open();
		const runs = await unwrap(commands.runsList());
		const ended = {
			...(runs[0] as (typeof runs)[number]),
			id: "run-docs-1",
			state: "Done" as const,
		};
		vi.spyOn(commands, "runsList").mockResolvedValue({ status: "ok", data: [ended] });
		vi.spyOn(commands, "codeDocsUpdateCheck").mockResolvedValue({
			status: "ok",
			data: [{ path: "docs/models/a.c4", error: "line 3: unexpected token" }],
		});
		mountApp("/code/impacts");
		await user.click(
			await screen.findByRole("button", { name: "Update with an agent: Test plans" }),
		);
		expect(await screen.findByRole("alert")).toHaveTextContent(
			"docs/models/a.c4 cannot be read: line 3: unexpected token. It is left out of the pull request.",
		);
	});
});
