import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mockState } from "@/lib/ipc/mock";
import { mountDesign } from "./harness";
import { Screens } from "./screens";

const files = () => mockState().design.files;
const DOC = "docs/designs/design.md";
const row = async (name: string | RegExp) =>
	within(await screen.findByRole("list", { name: "Screens" })).findByRole("button", { name });
const main = async () => within(await screen.findByRole("main"));

describe("Design / Screens", () => {
	it("lists the screens, with the design doc above them", async () => {
		await mountDesign(<Screens />);
		const list = await screen.findByRole("list", { name: "Screens" });
		expect(within(list).getAllByRole("listitem")).toHaveLength(3);
		expect(within(list).getByRole("button", { name: /Design doc/ })).toBeInTheDocument();
		expect(within(list).getByRole("button", { name: /Checkout/ })).toHaveTextContent("Broken link");
	});

	it("shows the artifacts of a screen and opens its design link outside the app", async () => {
		const user = userEvent.setup();
		await mountDesign(<Screens />);
		await user.click(await row(/Home/));
		const view = await main();
		expect(await view.findByRole("button", { name: /^diagram:context/ })).toBeInTheDocument();
		await user.click(view.getByRole("button", { name: "Open outside" }));
		await waitFor(() =>
			expect(mockState().design.opened).toEqual(["https://www.figma.com/file/abc123/Home"]),
		);
	});

	it("shows a link to a file that does not exist as broken, with no open action", async () => {
		const user = userEvent.setup();
		await mountDesign(<Screens />);
		await user.click(await row(/Checkout/));
		const view = await main();
		expect(await view.findByText("docs/designs/checkout.fig")).toBeInTheDocument();
		expect(view.getAllByText("Broken link").length).toBeGreaterThan(0);
		expect(view.queryByRole("button", { name: "Open outside" })).toBeNull();
		expect(view.getByRole("button", { name: /^api:orders/ })).toBeInTheDocument();
	});

	it("edits the design doc and writes it", async () => {
		const user = userEvent.setup();
		await mountDesign(<Screens />);
		await user.click(await row(/Design doc/));
		const text = await screen.findByRole("textbox", { name: "Design doc text" });
		expect(text).toHaveValue(files()[DOC]?.text);
		await user.type(text, "{Control>}{End}{/Control}\nNew line");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(files()[DOC]?.text).toMatch(/New line$/));
	});

	it("starts a missing design doc from the skeleton and creates the file on save", async () => {
		const user = userEvent.setup();
		delete files()[DOC];
		await mountDesign(<Screens />);
		await user.click(await row(/Design doc/));
		const text = await screen.findByRole("textbox", { name: "Design doc text" });
		expect((text as HTMLTextAreaElement).value).toContain("## Context and scope");
		await user.type(text, "x");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(files()[DOC]?.text).toContain("## Context and scope"));
	});

	it("adds a screen to the screens file", async () => {
		const user = userEvent.setup();
		await mountDesign(<Screens />);
		await user.click(await screen.findByRole("button", { name: "Screen" }));
		const dialog = within(await screen.findByRole("dialog"));
		await user.type(dialog.getByRole("textbox", { name: "Name" }), "Profile");
		await user.click(dialog.getByRole("button", { name: "Create" }));
		await waitFor(() =>
			expect(JSON.parse(files()["docs/designs/screens.json"]?.text ?? "{}").screens).toHaveLength(
				3,
			),
		);
		expect(await row(/Profile/)).toBeInTheDocument();
	});

	it("shows ghost rows under the design doc when there is no screen", async () => {
		delete files()["docs/designs/screens.json"];
		await mountDesign(<Screens />);
		await screen.findByRole("list", { name: "Screens" });
		expect(await screen.findAllByRole("button", { name: "Screen" })).toHaveLength(1);
	});

	it("shows the error of a screens file that does not parse", async () => {
		files()["docs/designs/screens.json"] = { text: "{", stamp: "1" };
		await mountDesign(<Screens />);
		expect(await screen.findByRole("alert")).toBeInTheDocument();
	});
});
