import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Providers } from "@/app/providers";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { mountAssistant } from "./harness";
import { SelectionActions } from "./selection-actions";

const REF = "spec:auth#REQ-001";
const input = () => screen.getByRole("textbox", { name: "Message" });

describe("assistant composer: slash commands", () => {
	it("opens on / with the commands of the view and puts the prompt in the draft", async () => {
		const user = userEvent.setup();
		await mountAssistant({ view: "/code/changes" });
		await user.type(input(), "/");
		const list = await screen.findByRole("listbox", { name: "Commands" });
		const names = within(list)
			.getAllByRole("option")
			.map((o) => o.textContent);
		expect(names.slice(0, 3)).toEqual(["/tests", "/commit", "/explain"]);
		await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
		expect(input()).toHaveValue("Explain this view and what it shows.");
		expect(screen.queryByRole("listbox")).toBeNull();
	});

	it("filters by what is typed, closes on Escape and sends nothing", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await user.type(input(), "/pl");
		expect(within(await screen.findByRole("listbox")).getAllByRole("option")).toHaveLength(1);
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("listbox")).toBeNull();
		expect(input()).toHaveValue("/pl");
		expect(screen.queryByText("Here is the answer.")).toBeNull();
	});

	it("keeps the plain Enter send when no menu is open", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		await user.type(input(), "/nothing here{Enter}");
		expect(await screen.findByText("Here is the answer.")).toBeInTheDocument();
	});
});

describe("assistant composer: @ with search", () => {
	it("lists the matching refs and adds the one that the person picks", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		await mountAssistant();
		await user.type(input(), "see @REQ-001");
		const list = await screen.findByRole("listbox", { name: "References" });
		const option = await within(list).findByRole("option", { name: new RegExp(REF) });
		fireEvent.mouseDown(option);
		const context = within(screen.getByRole("list", { name: "Context" }));
		expect(await context.findByText(REF)).toBeInTheDocument();
		expect(input()).toHaveValue("see ");
	});
});

describe("assistant composer: permission levels", () => {
	it("locks a read only project to the read only level", async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		const p = (await unwrap(commands.projectsActive()))?.id ?? "";
		const entry = mockState().projects.find((x) => x.id === p);
		if (entry) entry.overrides.readOnly = true;
		await mountAssistant({}, false);
		await waitFor(() =>
			expect(screen.getByRole("combobox", { name: "Permission" })).toHaveTextContent("Read only"),
		);
	});
});

describe("assistant panel: no agent CLI", () => {
	it("offers to install each CLI and detects again after an install", async () => {
		const user = userEvent.setup();
		await unwrap(commands.projectsOpen("/mock/alpha", false));
		for (const r of mockState().agents.runners)
			Object.assign(r, { state: "missing", path: null, version: null });
		const { again } = await mountAssistant({ open: false }, false);
		again({ open: true });
		expect(await screen.findByRole("heading", { name: "No agent CLI found" })).toBeVisible();
		expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
		expect(screen.getByText("npm install -g claude")).toBeVisible();
		await user.click(screen.getByRole("button", { name: "Install Claude Code" }));
		await waitFor(() =>
			expect(screen.queryByRole("heading", { name: "No agent CLI found" })).toBeNull(),
		);
		expect(await screen.findByRole("textbox", { name: "Message" })).toBeVisible();
	});
});

describe("selection actions", () => {
	// jsdom has no layout: a range has no box.
	beforeAll(() => {
		Range.prototype.getBoundingClientRect = () => ({ left: 10, bottom: 20 }) as DOMRect;
	});

	async function page(onAsk: (t: string) => void) {
		render(
			<Providers>
				<p>Some selectable sentence in the page.</p>
				<SelectionActions onAsk={onAsk} />
			</Providers>,
		);
		const p = await screen.findByText(/selectable sentence/);
		const range = document.createRange();
		range.selectNodeContents(p);
		document.getSelection()?.removeAllRanges();
		document.getSelection()?.addRange(range);
		fireEvent.mouseUp(p);
	}

	it("asks to explain, fix or send the selected text, quoted", async () => {
		const user = userEvent.setup();
		const onAsk = vi.fn();
		await page(onAsk);
		const bar = await screen.findByRole("toolbar", { name: "Selection" });
		await user.click(within(bar).getByRole("button", { name: "Fix" }));
		expect(onAsk).toHaveBeenCalledWith("Fix this:\n> Some selectable sentence in the page.\n");
		expect(screen.queryByRole("toolbar")).toBeNull();
	});

	it("has the three actions, and hides on a click elsewhere", async () => {
		const onAsk = vi.fn();
		await page(onAsk);
		const bar = await screen.findByRole("toolbar", { name: "Selection" });
		expect(
			within(bar)
				.getAllByRole("button")
				.map((b) => b.textContent),
		).toEqual(["Explain", "Fix", "Send to factory"]);
		fireEvent.mouseDown(document.body);
		expect(screen.queryByRole("toolbar")).toBeNull();
	});
});

describe("assistant composer: attachments", () => {
	it("attaches a text file, sends it as a quote and shows a refusal for a secret file", async () => {
		const user = userEvent.setup();
		await mountAssistant();
		const pick = screen.getByTestId("attach-input");
		await user.upload(pick, new File(["hello"], "notes.md", { type: "text/markdown" }));
		expect(await screen.findByText("notes.md")).toBeInTheDocument();
		await user.upload(pick, new File(["x"], "key.pem"));
		expect(await screen.findByText("a secret file is never attached")).toBeInTheDocument();
		await user.type(input(), "Read it{Enter}");
		await waitFor(() => expect(screen.queryByText("notes.md")).toBeNull());
		await user.click(screen.getByRole("button", { name: "Attach file" }));
	});
});
