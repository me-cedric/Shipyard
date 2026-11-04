import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { seedCode } from "@/lib/ipc/mock-code";
import { mountApp } from "@/test/mount";

const selector = () => screen.findByRole("combobox", { name: "Working branch" });

async function start() {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	const code = seedCode();
	code.remoteBranches.push("origin/dev");
	mockState().code = code;
	mountApp("/code/branches");
	return userEvent.setup();
}

describe("Branch selector", () => {
	it("filters the local and remote branches and switches with the arrow keys and Enter", async () => {
		const user = await start();
		await user.click(await selector());
		const list = await screen.findByRole("listbox", { name: "Working branch" });
		// A remote branch with a local twin (origin/main) is not listed twice.
		expect(list).toHaveTextContent("main");
		expect(list).toHaveTextContent("feat/auth/login");
		expect(list).toHaveTextContent("origin/dev");
		expect(list).not.toHaveTextContent("origin/main");
		await user.type(screen.getByRole("searchbox", { name: "Filter branches" }), "dev");
		// The remote row is the first row of the filter and Enter checks it out as a new local branch.
		await user.keyboard("{Enter}");
		expect(await screen.findByRole("combobox", { name: "Working branch" })).toHaveTextContent(
			"dev",
		);
		expect(mockState().code?.branch).toBe("dev");
	});

	it("moves with ArrowDown and makes a new branch from the working branch", async () => {
		const user = await start();
		await user.click(await selector());
		await user.type(screen.getByRole("searchbox", { name: "Filter branches" }), "fix/auth/retry");
		expect(screen.getByRole("option", { name: "New branch fix/auth/retry" })).toBeInTheDocument();
		await user.keyboard("{Enter}");
		await screen.findByText("fix/auth/retry", { selector: "button" });
		expect(mockState().code?.branch).toBe("fix/auth/retry");
		await user.click(await selector());
		await user.keyboard("{ArrowDown}");
		const [selected] = screen.getAllByRole("option", { selected: true });
		expect(screen.getAllByRole("option", { selected: true })).toHaveLength(1);
		// The filter box names the selected row for a screen reader.
		expect(screen.getByRole("searchbox", { name: "Filter branches" })).toHaveAttribute(
			"aria-activedescendant",
			selected?.id,
		);
	});
});
