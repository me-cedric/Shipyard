import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { mockState } from "@/lib/ipc/mock";
import { mountDesign } from "./harness";
import { Screens } from "./screens";

// Vitest turns a CSS import into an empty string, so the test serves the real file.
vi.mock("@/ui/tokens/tokens.css?raw", () => {
	const { readFileSync } = (
		globalThis as unknown as {
			process: {
				getBuiltinModule: (id: string) => { readFileSync: (p: string, e: "utf8") => string };
			};
		}
	).process.getBuiltinModule("node:fs");
	return { default: readFileSync("src/ui/tokens/tokens.css", "utf8") };
});

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
		await user.click(view.getByRole("button", { name: "Open in Figma" }));
		await waitFor(() =>
			expect(mockState().design.opened).toEqual(["https://www.figma.com/file/abc123/Home"]),
		);
	});

	it("shows an HTML mockup inline in a frame with no script and no request, and an image", async () => {
		const user = userEvent.setup();
		files()["docs/designs/login.html"] = {
			text: "<h1>Login</h1><script>parent.alert(1)</script>",
			stamp: "1",
		};
		files()["docs/designs/hero.png"] = { text: "PNG", stamp: "1" };
		files()["docs/designs/cart.svg"] = {
			text: '<svg xmlns="http://www.w3.org/2000/svg"/>',
			stamp: "1",
		};
		await mountDesign(<Screens />);
		await user.click(await row(/login/));
		const frame = await waitFor(() => {
			const f = document.querySelector<HTMLIFrameElement>('iframe[title="login"]');
			if (!f) throw new Error("no frame");
			return f;
		});
		expect(frame.getAttribute("sandbox")).toBe("");
		expect(frame.getAttribute("srcdoc")).toMatch(
			/^<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none';[^"]*">.*<h1>Login<\/h1>/,
		);
		await user.click(await row(/cart/));
		const view = await main();
		expect(await view.findByRole("img", { name: "cart" })).toHaveAttribute(
			"src",
			expect.stringMatching(/^data:image\/svg\+xml/),
		);
		await user.click(await row(/hero/));
		expect(await view.findByRole("img", { name: "hero" })).toHaveAttribute(
			"src",
			`data:image/png;base64,${btoa("PNG")}`,
		);
	});

	it("shows a link to a file that does not exist as broken, with no open action", async () => {
		const user = userEvent.setup();
		await mountDesign(<Screens />);
		await user.click(await row(/Checkout/));
		const view = await main();
		expect(await view.findByText("docs/designs/checkout.fig")).toBeInTheDocument();
		expect(view.getAllByText("Broken link").length).toBeGreaterThan(0);
		expect(view.queryByRole("button", { name: /Open outside|Open in Figma/ })).toBeNull();
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

	it("shows the tokens of the app beside the design doc, by family with a count", async () => {
		const user = userEvent.setup();
		await mountDesign(<Screens />);
		await user.click(await row(/Design doc/));
		const region = await screen.findByRole("region", { name: "Tokens" });
		// It scrolls, so the keyboard reaches it.
		expect(region).toHaveAttribute("tabindex", "0");
		const tokens = within(region);
		for (const heading of [
			"Neutral (12)",
			"Accent (5)",
			"Success (3)",
			"Warning (3)",
			"Danger (3)",
			"Info (3)",
		])
			expect(tokens.getByRole("heading", { name: heading })).toBeInTheDocument();
		const item = tokens.getByText("--accent").closest("li");
		expect(item).toHaveTextContent("oklch(0.757 0.147 238)");
		// The view reads: the design doc stays as it was.
		expect(await screen.findByRole("textbox", { name: "Design doc text" })).toHaveValue(
			files()[DOC]?.text,
		);
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
