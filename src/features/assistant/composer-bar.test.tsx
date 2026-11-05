import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountAssistant } from "./harness";

const permission = () => screen.getByRole("combobox", { name: "Permission", hidden: true });
const agent = (user: ReturnType<typeof userEvent.setup>) =>
	user.click(
		within(screen.getByRole("group", { name: "Mode" })).getByRole("button", { name: "Agent" }),
	);
const chooseBypass = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(permission());
	await user.click(await screen.findByRole("option", { name: "Bypass permissions" }));
};

beforeEach(() => localStorage.clear());

describe("assistant composer: the bar under the message", () => {
	it("has one picker, no select for runner, model or effort, and Send on the right", async () => {
		await mountAssistant();
		for (const name of ["AI tool", "Model", "Effort"])
			expect(screen.queryByRole("combobox", { name })).toBeNull();
		const bar = screen.getByRole("button", { name: "Send" }).closest("div") as HTMLElement;
		const order = Array.from(bar.querySelectorAll("button, [role=combobox]")).map(
			(e) => e.getAttribute("aria-label") ?? e.textContent,
		);
		expect(order[0]).toBe("Attach file");
		expect(order[1]).toBe("claude");
		expect(order[2]).toBe("Permission");
		expect(order.at(-1)).toBe("Send");
		expect(screen.getByRole("meter", { name: "Context" })).toBeInTheDocument();
	});

	it("lists the models with a check, an Effort submenu and the other runners", async () => {
		// The menu sets pointer-events none on the rest of the page while a submenu opens.
		const user = userEvent.setup({ pointerEventsCheck: 0 });
		await mountAssistant();
		await user.click(screen.getByRole("button", { name: "claude" }));
		const radios = await screen.findAllByRole("menuitemradio");
		expect(radios.map((r) => r.textContent)).toEqual(["Default", "opus", "sonnet", "haiku"]);
		expect(radios[0]).toBeChecked();
		// A click on a menu item does not reach it in jsdom: the keyboard does.
		(radios[1] as HTMLElement).focus();
		await user.keyboard("{Enter}");
		await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
		await user.click(await screen.findByRole("button", { name: "opus" }));
		await user.click(await screen.findByRole("menuitem", { name: "Effort" }));
		for (const level of ["low", "medium", "high", "xhigh", "max"])
			expect(await screen.findByRole("menuitemradio", { name: level })).toBeInTheDocument();
		screen.getByRole("menuitemradio", { name: "high" }).focus();
		await user.keyboard("{Enter}");
		expect(await screen.findByRole("button", { name: "opus · high" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "opus · high" }));
		await user.click(await screen.findByRole("menuitem", { name: "More models" }));
		expect(await screen.findByText("codex")).toBeInTheDocument();
		expect(screen.getByRole("menuitem", { name: "gpt-5-codex" })).toBeInTheDocument();
	});
});

describe("assistant composer: permission choices", () => {
	it("asks once for each project before Bypass and shows it in the danger colour", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await agent(user);
		await chooseBypass(user);
		const dialog = await screen.findByRole("dialog", { name: "Bypass permissions" });
		expect(dialog).toHaveTextContent("skips every approval");
		expect(permission()).toHaveTextContent("Edit with approval");
		await user.click(within(dialog).getByRole("button", { name: "Bypass permissions" }));
		await waitFor(() => expect(permission()).toHaveTextContent("Bypass permissions"));
		expect(permission().className).toContain("text-danger-text");
		// The second time in the same project: no dialog.
		await user.click(permission());
		await user.click(await screen.findByRole("option", { name: "Edit with approval" }));
		await waitFor(() => expect(permission()).toHaveTextContent("Edit with approval"));
		await chooseBypass(user);
		await waitFor(() => expect(permission()).toHaveTextContent("Bypass permissions"));
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("refuses Bypass while the agents switch is off and keeps the level", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await unwrap(commands.killSwitchSet(true));
		await agent(user);
		await chooseBypass(user);
		await user.click(
			within(await screen.findByRole("dialog")).getByRole("button", { name: "Bypass permissions" }),
		);
		expect(await screen.findByRole("alert")).toHaveTextContent("agents switch is off");
		expect(permission()).toHaveTextContent("Edit with approval");
		expect(localStorage.length).toBe(0);
		await unwrap(commands.killSwitchSet(false));
	});

	it("offers no Bypass in a read only project", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const p = (await unwrap(commands.projectsActive()))?.id ?? "";
		const entry = mockState().projects.find((x) => x.id === p);
		if (entry) entry.overrides.readOnly = true;
		await mountAssistant({}, false);
		await agent(user);
		await user.click(permission());
		const levels = (await screen.findAllByRole("option")).map((o) => o.textContent);
		expect(levels).toEqual(["Read only"]);
	});
});
