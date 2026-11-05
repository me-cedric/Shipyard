import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER } from "@/lib/ipc/mock";
import { ShellProvider } from "@/lib/shell";
import { renderApp } from "@/ui/test-utils";
import { Workflows } from "./index";

const text = async (id: string) => (await unwrap(commands.workflowGet(id))).text;

/** Opens the workflow `id` in its form. The mock holds a proposal for `bug`, so pass `discard` to drop it first. */
async function open(id: string) {
	const user = userEvent.setup();
	await unwrap(commands.projectsOpen(DEMO_FOLDER, false));
	renderApp(
		<ShellProvider>
			<Workflows />
		</ShellProvider>,
	);
	await user.click(await screen.findByRole("button", { name: new RegExp(`^${id}`) }));
	return user;
}

const step = (id: string) => screen.findByRole("region", { name: `Step ${id}` });

describe("Workflows: the form", () => {
	beforeEach(() => {
		window.matchMedia = ((query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		})) as unknown as typeof window.matchMedia;
	});

	it("a change of effort shows in the text view", async () => {
		const user = await open("spike");
		const fields = within(await step("grill"));
		await user.click(fields.getByRole("combobox", { name: "Effort" }));
		await user.click(await screen.findByRole("option", { name: "max" }));
		await user.click(screen.getByRole("tab", { name: "Text" }));
		const editor = (await screen.findByRole("textbox", { name: "spike" })) as HTMLTextAreaElement;
		await waitFor(() => expect(editor.value).toContain("effort: max"));
		expect(editor.value.startsWith("# A spike")).toBe(true);
		await user.click(screen.getByRole("tab", { name: "Form" }));
		await step("grill");
	});

	it("adds a step, moves it up and saves it", async () => {
		const user = await open("spike");
		await user.click(await screen.findByRole("button", { name: "Add step" }));
		const added = within(await step("step-4"));
		await user.click(added.getByRole("button", { name: "Move up" }));
		const order = () =>
			screen
				.getAllByRole("region")
				.map((r) => r.getAttribute("aria-label"))
				.filter((l) => l?.startsWith("Step "));
		await waitFor(() =>
			expect(order()).toEqual(["Step grill", "Step investigate", "Step step-4", "Step report"]),
		);
		const save = screen.getByRole("button", { name: "Save" });
		await waitFor(() => expect(save).toBeEnabled());
		await user.click(save);
		await waitFor(async () => expect(await text("spike")).toContain("id: step-4"));
	});

	it("an unknown need blocks the save", async () => {
		const user = await open("spike");
		await user.click(screen.getByRole("tab", { name: "Text" }));
		const editor = (await screen.findByRole("textbox", { name: "spike" })) as HTMLTextAreaElement;
		fireEvent.change(editor, {
			target: { value: editor.value.replace("needs: [grill]", "needs: [gone]") },
		});
		expect(await screen.findByRole("alert")).toHaveTextContent("needs `gone`");
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		// The text with an issue cannot open in the form.
		await user.click(screen.getByRole("tab", { name: "Form" }));
		expect(screen.getByRole("textbox", { name: "spike" })).toBeInTheDocument();
	});

	it("the turn limit writes max_turns when on", async () => {
		const user = await open("spike");
		await user.click(await screen.findByRole("switch", { name: "Turn limit" }));
		await user.click(screen.getByRole("tab", { name: "Text" }));
		const editor = (await screen.findByRole("textbox", { name: "spike" })) as HTMLTextAreaElement;
		await waitFor(() => expect(editor.value).toContain("max_turns: 40"));
	});

	it("More opens the other fields", async () => {
		const user = await open("spike");
		const fields = within(await step("grill"));
		const more = fields.getByRole("button", { name: "More" });
		expect(more).toHaveAttribute("aria-expanded", "false");
		await user.click(more);
		expect(more).toHaveAttribute("aria-expanded", "true");
		expect(fields.getByRole("spinbutton", { name: "Retries" })).toBeInTheDocument();
	});

	it("delete asks first and refuses the default workflow", async () => {
		const user = await open("feature");
		await user.click(await screen.findByRole("button", { name: "Delete" }));
		expect(await unwrap(commands.workflowsList())).toHaveLength(6);
		await user.click(screen.getByRole("button", { name: "Delete feature" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("default workflow");
		expect(await unwrap(commands.workflowsList())).toHaveLength(6);
	});

	it("applies a proposal from its diff", async () => {
		const user = await open("bug");
		expect(await screen.findByRole("region", { name: "Proposed change" })).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Apply" }));
		await waitFor(async () => expect(await text("bug")).toContain("budget_usd: 2"));
		await waitFor(() => expect(screen.queryByRole("button", { name: "Apply" })).toBeNull());
	});
});
