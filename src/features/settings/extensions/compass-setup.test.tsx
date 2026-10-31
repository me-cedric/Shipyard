import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { mountTab } from "./harness";

const row = async (name: string) => (await screen.findByRole("group", { name })) as HTMLElement;

describe("Settings / Agents and rules: compass setup", () => {
	it("applies an objective and names the assets that do not fit", async () => {
		const user = userEvent.setup();
		await mountTab("agents-rules");
		const quality = await row("Code quality");
		expect(within(quality).getByText("3 of 5")).toBeInTheDocument();
		await user.click(within(quality).getByRole("button", { name: "Apply Code quality" }));
		await waitFor(() => expect(within(quality).getByText("Applied")).toBeInTheDocument());
		expect(
			screen.getAllByRole("status").some((s) => s.textContent?.includes(".agents/skill/debug")),
		).toBe(true);
		const mobile = await row("Mobile apps");
		expect(within(mobile).getByRole("button", { name: "Apply Mobile apps" })).toBeDisabled();
		const devops = await row("DevOps and cloud");
		await user.click(within(devops).getByRole("button", { name: "Apply DevOps and cloud" }));
		expect(await screen.findByText("Not for this project: pack:env")).toBeInTheDocument();
	});

	it("refreshes the external skills, and a reinstall over edited files asks first", async () => {
		const user = userEvent.setup();
		await mountTab("agents-rules");
		const list = (await screen.findByRole("heading", { name: /^External skills/ })).closest(
			"section",
		) as HTMLElement;
		const taste = await within(list).findByText("taste");
		expect(taste.closest("li")).toHaveTextContent("Update ready");
		await user.click(within(list).getByRole("button", { name: "Refresh external skills" }));
		await waitFor(() =>
			expect(within(list).getByText("taste").closest("li")).toHaveTextContent("Current"),
		);

		await user.click(within(list).getByRole("button", { name: "Reinstall mattpocock" }));
		await user.click(
			within(list).getByRole("button", { name: "Replace the edited files of mattpocock" }),
		);
		await waitFor(() =>
			expect(mockState().extensions.setup.sources.find((s) => s.id === "mattpocock")?.state).toBe(
				"current",
			),
		);
		expect(within(list).getByRole("button", { name: "Install expo" })).toBeDisabled();
		await user.click(within(list).getByRole("button", { name: "Install devops-security" }));
		await waitFor(() =>
			expect(within(list).getByText("devops-security").closest("li")).toHaveTextContent("Current"),
		);
	});

	it("installs the contract with one click", async () => {
		const user = userEvent.setup();
		await mountTab("agents-rules");
		await user.click(await screen.findByRole("button", { name: "Install the contract" }));
		expect(await screen.findByText("AGENTS.md")).toBeInTheDocument();
	});
});
