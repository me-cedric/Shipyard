import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { PLUGIN_PATH } from "@/lib/ipc/mock-extensions";
import { mountTab } from "./harness";

async function applyPlugin(user: ReturnType<typeof userEvent.setup>) {
	await mountTab("extensions");
	await user.type(await screen.findByRole("textbox", { name: "Plugin archive path" }), PLUGIN_PATH);
	await user.click(screen.getByRole("button", { name: "Review" }));
	await user.click(await screen.findByRole("button", { name: "Apply plugin (4)" }));
}

describe("Settings / Extensions: plugin settings and deploy", () => {
	it("fills a typed setting in a form and saves it", async () => {
		const user = userEvent.setup();
		await applyPlugin(user);
		await user.click(await screen.findByRole("button", { name: "Settings of team-kit" }));
		const form = await screen.findByRole("form", { name: "Settings of team-kit" });
		const team = within(form).getByRole("combobox", { name: "team" });
		expect(team).toHaveTextContent("core");
		await user.click(team);
		await user.click(await screen.findByRole("option", { name: "web" }));
		await user.click(within(form).getByRole("button", { name: "Save settings" }));
		expect(await within(form).findByRole("status")).toHaveTextContent("Settings saved");
		expect(mockState().extensions.pluginSettings["team-kit"]?.[0]?.value).toBe("web");
	});

	it("deploys an applied plugin to the cloned child projects", async () => {
		const user = userEvent.setup();
		await applyPlugin(user);
		const deploy = await screen.findByRole("button", {
			name: "Deploy team-kit to the child projects",
		});
		await waitFor(() => expect(deploy).toBeEnabled());
		await user.click(deploy);
		expect(
			await screen.findByText(/api-gateway Branch shipyard\/extensions-1/),
		).toBeInTheDocument();
		expect(mockState().extensions.children[0]?.has).toContain("plugin:team-kit");
		await waitFor(() => expect(deploy).toBeDisabled());
	});
});
