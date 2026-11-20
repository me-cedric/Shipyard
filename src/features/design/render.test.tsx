import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ComponentProps, useEffect, useState } from "react";
import { vi } from "vitest";
import { commands } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { DRAWIO_EMBED, DRAWIO_ORIGIN } from "@/ui/organisms/drawio-editor";
import type { EditorError } from "@/ui/organisms/error-line";
import orders from "@/ui/organisms/fixtures/orders.drawio?raw";
import { Architecture } from "./architecture";
import { Data } from "./data";
import { Diagrams } from "./diagrams";
import { mountDesign, showText } from "./harness";

// The engines of Mermaid, LikeC4, Excalidraw and BPMN need a browser. The stubs keep the wiring:
// the text in, the error out, and the last good render kept.
function Stub({
	source,
	label,
	onError,
}: {
	source: string;
	label: string;
	onError?: (e: EditorError | null) => void;
}) {
	const [good, setGood] = useState("");
	useEffect(() => {
		const bad = source.split("\n").findIndex((l) => l.includes("BAD"));
		if (bad < 0) {
			setGood(source);
			onError?.(null);
		} else onError?.({ message: "Unexpected token", line: bad + 1 });
	}, [source, onError]);
	return (
		<div role="img" aria-label={label}>
			{good}
		</div>
	);
}
vi.mock("@/ui/organisms/mermaid-view", () => ({ MermaidView: Stub }));
vi.mock("@/ui/organisms/likec4-view", () => ({ LikeC4View: Stub }));
vi.mock("@/ui/organisms/bpmn-viewer", () => ({
	BpmnViewer: ({ label, onChange }: { label: string; onChange?: (xml: string) => void }) => (
		<div role="img" aria-label={label}>
			<button type="button" onClick={() => onChange?.("<definitions/>")}>
				Move a task
			</button>
		</div>
	),
}));
vi.mock("@/ui/organisms/excalidraw-board", () => ({
	ExcalidrawBoard: ({ label }: { label: string }) => <div role="img" aria-label={label} />,
}));

// The embed is on in the app (`DRAWIO_EMBED`). A test turns it off through the prop.
const draw = vi.hoisted(() => ({ embed: undefined as boolean | undefined }));
vi.mock("@/ui/organisms/drawio-editor", async (orig) => {
	const m = await orig<typeof import("@/ui/organisms/drawio-editor")>();
	return {
		...m,
		DrawioEditor: (p: ComponentProps<typeof m.DrawioEditor>) => (
			<m.DrawioEditor {...p} embed={draw.embed} />
		),
	};
});
afterEach(() => {
	draw.embed = undefined;
});

const files = () => mockState().design.files;
// The list comes first: the open artifact can hold a button with the same name.
const row = async (name: string) =>
	// nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp -- test input is a fixed name
	(await screen.findAllByRole("button", { name: new RegExp(name) }))[0] as HTMLElement;

/** Picks a diagram card, then puts the diagram on the canvas with Open. */
const openIt = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
	await user.click(await row(name));
	// The inspector has its own Open: look in the page only.
	await user.click(
		await within(await screen.findByRole("main")).findByRole("button", { name: "Open" }),
	);
};

describe("Design / Diagrams", () => {
	it("lists the four formats, each with its title and format", async () => {
		await mountDesign(<Diagrams />);
		const list = await screen.findByRole("list", { name: "Diagrams" });
		const items = within(list).getAllByRole("listitem");
		expect(items).toHaveLength(4);
		expect(within(list).getByRole("button", { name: /context/ })).toHaveTextContent("Excalidraw");
		expect(within(list).getByRole("button", { name: /sync-flow/ })).toHaveTextContent("Mermaid");
		expect(within(list).getByRole("button", { name: /order-process/ })).toHaveTextContent("BPMN");
		expect(within(list).getByRole("button", { name: /network/ })).toHaveTextContent("draw.io");
	});

	it("shows ghost rows and the one new action when the project has no diagram", async () => {
		for (const p of Object.keys(files())) if (p.startsWith("docs/diagrams/")) delete files()[p];
		await mountDesign(<Diagrams />);
		expect(await screen.findAllByRole("button", { name: "New diagram" })).toHaveLength(1);
		expect(screen.queryByRole("list")).toBeNull();
	});

	it("opens a Mermaid diagram on its picture, and a switch shows the text (spec:app-redesign#REQ-021)", async () => {
		const user = userEvent.setup();
		await mountDesign(<Diagrams />);
		await openIt(user, "sync-flow");
		expect(await screen.findByRole("img", { name: "sync-flow" })).toBeInTheDocument();
		expect(screen.queryByRole("textbox", { name: "Diagram text" })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Text" }));
		expect(screen.getByRole("textbox", { name: "Diagram text" })).toBeInTheDocument();
		expect(screen.queryByRole("img", { name: "sync-flow" })).toBeNull();
	});

	it("opens a Mermaid file in the frame, saves an edit and keeps the ref", async () => {
		const user = userEvent.setup();
		await mountDesign(<Diagrams />);
		await openIt(user, "sync-flow");
		await showText(user);
		const text = await screen.findByRole("textbox", { name: "Diagram text" });
		expect(text).toHaveValue(files()["docs/diagrams/sync-flow.mmd"]?.text);
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		await user.type(text, "  Work --> Done");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(files()["docs/diagrams/sync-flow.mmd"]?.text).toContain("Work --> Done"),
		);
		await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDisabled());
	});

	it("warns when the file changed on disk, and keeps mine on request", async () => {
		const user = userEvent.setup();
		await mountDesign(<Diagrams />);
		await openIt(user, "sync-flow");
		await showText(user);
		const text = await screen.findByRole("textbox", { name: "Diagram text" });
		const other = { text: "flowchart LR\n  X --> Y\n", stamp: "9" };
		files()["docs/diagrams/sync-flow.mmd"] = other;
		await user.type(text, "Z");
		// The primary action waits for the choice.
		await user.click(screen.getByRole("button", { name: "Save" }));
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent("The file changed on disk");
		expect(files()["docs/diagrams/sync-flow.mmd"]).toEqual(other);
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		await user.click(within(alert).getByRole("button", { name: "Keep mine" }));
		await waitFor(() => expect(files()["docs/diagrams/sync-flow.mmd"]?.text).toMatch(/Z$/));
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("reloads the disk version on request", async () => {
		const user = userEvent.setup();
		await mountDesign(<Diagrams />);
		await openIt(user, "sync-flow");
		await showText(user);
		const text = await screen.findByRole("textbox", { name: "Diagram text" });
		files()["docs/diagrams/sync-flow.mmd"] = { text: "flowchart LR\n  X --> Y\n", stamp: "9" };
		await user.type(text, "Z");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await user.click(await screen.findByRole("button", { name: "Reload" }));
		await waitFor(() => expect(text).toHaveValue("flowchart LR\n  X --> Y\n"));
	});

	it("edits BPMN with the modeler and saves on the click, with an action to open the file outside", async () => {
		const user = userEvent.setup();
		const open = vi.spyOn(commands, "designOpen").mockResolvedValue({ status: "ok", data: null });
		await mountDesign(<Diagrams />);
		await openIt(user, "order-process");
		expect(await screen.findByRole("img", { name: "order-process" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		await user.click(screen.getByRole("button", { name: "Move a task" }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(files()["docs/diagrams/order-process.bpmn"]?.text).toBe("<definitions/>"),
		);
		await user.click(screen.getByRole("button", { name: "Open outside" }));
		expect(open).toHaveBeenCalledWith("docs/diagrams/order-process.bpmn");
	});

	it("shows draw.io read-only at once, with no frame, while the embed is off", async () => {
		expect(DRAWIO_EMBED).toBe(true);
		draw.embed = false;
		const user = userEvent.setup();
		await mountDesign(<Diagrams />);
		await openIt(user, "network");
		expect(await screen.findByRole("img", { name: "network" })).toBeInTheDocument();
		expect(document.querySelector("iframe")).toBeNull();
	});

	it("edits draw.io in the embed through its messages, and saves the SVG with its model", async () => {
		draw.embed = true;
		const user = userEvent.setup();
		await mountDesign(<Diagrams />);
		await openIt(user, "network");
		const frame = await waitFor(() => {
			const f = document.querySelector<HTMLIFrameElement>('iframe[title="network"]');
			if (!f) throw new Error("no frame");
			return f;
		});
		expect(frame.src).toMatch(/^https:\/\/embed\.diagrams\.net\/\?embed=1&proto=json/);
		const win = frame.contentWindow as Window;
		const post = vi.spyOn(win, "postMessage").mockImplementation(() => undefined);
		const say = (data: object, origin = DRAWIO_ORIGIN) =>
			act(() => {
				window.dispatchEvent(
					new MessageEvent("message", { data: JSON.stringify(data), origin, source: win }),
				);
			});
		say({ event: "init" });
		expect(JSON.parse(post.mock.calls[0]?.[0] as string)).toMatchObject({ action: "load" });
		say({ event: "autosave", xml: "<mxfile/>" });
		expect(JSON.parse(post.mock.calls[1]?.[0] as string)).toEqual({
			action: "export",
			format: "xmlsvg",
		});
		// A message from another origin changes nothing.
		say({ event: "export", data: "data:image/svg+xml;base64,PHN2Zy8+" }, "https://evil.example");
		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		say({ event: "export", data: "data:image/svg+xml;base64,PHN2Zy8+" });
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(files()["docs/diagrams/network.drawio.svg"]?.text).toBe("<svg/>"));
	});

	it("draws a plain .drawio file in the grid and in the view, from its model", async () => {
		draw.embed = false;
		files()["docs/diagrams/orders.drawio"] = { text: orders, stamp: "1" };
		const user = userEvent.setup();
		await mountDesign(<Diagrams />);
		await waitFor(() => {
			const faces = Array.from(document.querySelectorAll('img[alt=""]'));
			expect(
				faces.some((f) => decodeURIComponent(f.getAttribute("src") ?? "").includes("Order placed")),
			).toBe(true);
		});
		await openIt(user, "orders");
		const big = await screen.findByRole("img", { name: "orders" });
		expect(decodeURIComponent(big.getAttribute("src") ?? "")).toContain("In stock?");
		expect(screen.queryByRole("textbox")).toBeNull();
	});

	it("shows draw.io read-only when offline", async () => {
		draw.embed = true;
		const user = userEvent.setup();
		const offline = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		await mountDesign(<Diagrams />);
		await openIt(user, "network");
		expect(await screen.findByRole("img", { name: "network" })).toBeInTheDocument();
		expect(document.querySelector("iframe")).toBeNull();
		offline.mockRestore();
	});

	it("shows an error for a file that cannot be read, and never writes it", async () => {
		const user = userEvent.setup();
		const bad = '<svg xmlns="http://www.w3.org/2000/svg"/>';
		files()["docs/diagrams/broken.drawio.svg"] = { text: bad, stamp: "1" };
		await mountDesign(<Diagrams />);
		const item = await row("broken");
		expect(item).toHaveTextContent("Not readable");
		await user.click(item);
		await user.click(
			await within(await screen.findByRole("main")).findByRole("button", { name: "Open" }),
		);
		expect(await screen.findByRole("alert")).toHaveTextContent("not a draw.io board");
		expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
		expect(files()["docs/diagrams/broken.drawio.svg"]).toEqual({ text: bad, stamp: "1" });
	});

	it("creates a Mermaid diagram with one dialog", async () => {
		const user = userEvent.setup();
		await mountDesign(<Diagrams />);
		// One New button for each format: the dialog starts on that format.
		await user.click(await screen.findByRole("button", { name: "Mermaid" }));
		const dialog = within(await screen.findByRole("dialog"));
		await user.type(dialog.getByRole("textbox", { name: "Name" }), "Deploy flow");
		expect(dialog.getByRole("combobox", { name: "Format" })).toHaveTextContent("Mermaid");
		await user.click(dialog.getByRole("button", { name: "Create" }));
		await waitFor(() => expect(files()["docs/diagrams/deploy-flow.mmd"]).toBeDefined());
		expect(await screen.findByRole("textbox", { name: "Diagram text" })).toBeInTheDocument();
	});
});

describe("Design / Architecture", () => {
	it("opens a model on its picture, and a switch shows the text (spec:app-redesign#REQ-021)", async () => {
		const user = userEvent.setup();
		await mountDesign(<Architecture />);
		await user.click(await row("system"));
		const view = await screen.findByRole("img", { name: "Model" });
		await waitFor(() => expect(view).toHaveTextContent("shipyard = system"));
		// A model opens on the picture alone.
		expect(screen.queryByRole("textbox", { name: "Model text" })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Text" }));
		expect(screen.getByRole("textbox", { name: "Model text" })).toHaveValue(
			files()["docs/models/system.c4"]?.text,
		);
		expect(screen.queryByRole("img", { name: "Model" })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Both" }));
		expect(screen.getByRole("textbox", { name: "Model text" })).toBeInTheDocument();
		expect(screen.getByRole("img", { name: "Model" })).toBeInTheDocument();
	});

	it("shows the text of a model when its error names a line", async () => {
		const user = userEvent.setup();
		files()["docs/models/system.c4"] = { text: "model {\nBAD line\n}\n", stamp: "1" };
		await mountDesign(<Architecture />);
		await user.click(await row("system"));
		expect(await screen.findByRole("alert")).toHaveTextContent(/Line 2/);
		expect(screen.getByRole("textbox", { name: "Model text" })).toBeInTheDocument();
		expect(screen.getByTestId("error-line")).toBeInTheDocument();
	});

	it("lists the models, renders the open one and keeps the last good render on an error", async () => {
		const user = userEvent.setup();
		await mountDesign(<Architecture />);
		await user.click(await row("system"));
		await showText(user);
		const text = await screen.findByRole("textbox", { name: "Model text" });
		const view = await screen.findByRole("img", { name: "Model" });
		await waitFor(() => expect(view).toHaveTextContent("shipyard = system"));
		await user.type(text, "{Control>}{End}{/Control}\nBAD line");
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent(/Line 14/);
		expect(alert).toHaveTextContent("Unexpected token");
		expect(screen.getByTestId("error-line")).toBeInTheDocument();
		// The render still shows the last good text.
		expect(view).toHaveTextContent("shipyard = system");
		expect(view).not.toHaveTextContent("BAD");
	});
});

describe("Design / Data", () => {
	it("shows the tables and the relations of a model, and keeps them on an error", async () => {
		const user = userEvent.setup();
		await mountDesign(<Data />);
		await user.click(await row("shop"));
		for (const name of ["customers", "orders", "order_lines"])
			expect(await screen.findByRole("region", { name })).toBeInTheDocument();
		// A column that points to another table has the pill "Link", which names the target.
		expect(screen.getByTitle("orders.customer_id → customers.id")).toHaveTextContent("Link");
		expect(screen.getByTitle("order_lines.order_id → orders.id")).toBeInTheDocument();
		await showText(user);
		await user.type(await screen.findByRole("textbox", { name: "Model text" }), "Table broken {{");
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent(/Line \d+/);
		expect(screen.getByRole("region", { name: "customers" })).toBeInTheDocument();
	});
});

describe("Design / Architecture page", () => {
	it("shows the models as chips under the title, with New model", async () => {
		await mountDesign(<Architecture />);
		expect(await screen.findByRole("button", { name: "New model" })).toBeInTheDocument();
		const models = within(await screen.findByRole("group", { name: "Models" }));
		expect(models.getByRole("button", { name: "system" })).toHaveAttribute("aria-pressed", "true");
	});
});
