import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { parseFlows } from "@/lib/design";
import { mockState } from "@/lib/ipc/mock";
import { Api } from "./api";
import { Decisions } from "./decisions";
import { FlowMatrixPage, Flows } from "./flows";
import { mountDesign } from "./harness";

// Typing is slow on a busy machine.
vi.setConfig({ testTimeout: 15_000 });

const files = () => mockState().design.files;
// The frame and the inspector hold chips with the same names: look in the list only.
const row = async (name: string | RegExp) =>
	within(
		await screen.findByRole("list", { name: /^(Decisions|Décisions|API|Network flows)$/ }),
	).findByRole("button", { name });
const ADR3 = "docs/decisions/0003-ship-a-browser-mock.md";
const FLOWS = "docs/flows/network.yaml";

describe("Design / Decisions", () => {
	it("lists the decisions with title and status, the proposed one first", async () => {
		await mountDesign(<Decisions />);
		const list = await screen.findByRole("list", { name: "Decisions" });
		const cards = within(list).getAllByRole("listitem");
		expect(cards).toHaveLength(4);
		expect(cards[0]).toHaveTextContent("Ship a browser mock");
		expect(cards[0]).toHaveTextContent("Waits for you");
		expect(within(list).getByRole("button", { name: /Use Tauri/ })).toHaveTextContent("Accepted");
	});

	it("creates a decision with the next number and the status proposed", async () => {
		const user = userEvent.setup();
		await mountDesign(<Decisions />);
		await user.click(await screen.findByRole("button", { name: "New decision" }));
		const dialog = within(await screen.findByRole("dialog"));
		await user.type(dialog.getByRole("textbox", { name: "Name" }), "Use queues");
		await user.click(dialog.getByRole("button", { name: "Create" }));
		await waitFor(() => expect(files()["docs/decisions/0005-use-queues.md"]).toBeDefined());
		expect(files()["docs/decisions/0005-use-queues.md"]?.text).toContain("status: proposed");
		expect(await row(/Use queues/)).toHaveTextContent("Waits for you");
	});

	it("accepts a proposed decision with a reason, and writes status, date and comment", async () => {
		const user = userEvent.setup();
		await mountDesign(<Decisions />);
		await user.type(await screen.findByRole("textbox", { name: "Reason" }), "Fits the plan");
		await user.click(screen.getByRole("button", { name: "Accept" }));
		await waitFor(() => expect(files()[ADR3]?.text).toContain("status: accepted"));
		expect(files()[ADR3]?.text).toContain('comment: "Fits the plan"');
		expect(files()[ADR3]?.text).toMatch(/date: \d{4}-\d{2}-\d{2}/);
		// The decision is done: the answer gives way.
		await waitFor(() => expect(screen.queryByRole("button", { name: "Accept" })).toBeNull());
		expect(await row(/Ship a browser mock/)).toHaveTextContent("Accepted");
	});

	it("marks the reason as required, refuses an empty one with an error line, then refuses", async () => {
		const user = userEvent.setup();
		await mountDesign(<Decisions />);
		const box = await screen.findByRole("textbox", { name: "Reason" });
		expect(box).toHaveAttribute("aria-required", "true");
		await user.click(screen.getByRole("button", { name: "Accept" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Write a reason first");
		expect(files()[ADR3]?.text).toContain("status: proposed");
		await user.type(box, "Too early");
		await user.click(screen.getByRole("button", { name: "Refuse" }));
		await waitFor(() => expect(files()[ADR3]?.text).toContain("status: rejected"));
	});

	it("marks a decision that no spec cites, and a menu action keeps only those", async () => {
		const user = userEvent.setup();
		// The demo decisions are all cited: this one is the only one that no spec uses.
		files()["docs/decisions/0005-use-queues.md"] = {
			text: "---\nstatus: accepted\ndate: 2026-10-30\ndecision-makers: [ada]\n---\n# Use queues\n## Context and problem statement\n\nWhy.\n",
			stamp: "1",
		};
		await mountDesign(<Decisions />);
		const list = await screen.findByRole("list", { name: "Decisions" });
		const all = within(list).getAllByRole("listitem").length;
		const marking = () =>
			within(list)
				.getAllByRole("listitem")
				.filter((li) => li.textContent?.includes("No spec uses it"));
		// The graph loads after the list.
		await waitFor(() => expect(marking().length).toBeGreaterThan(0));
		const marked = marking();
		expect(marked.length).toBeLessThan(all);
		await user.click(screen.getByRole("button", { name: "More" }));
		await user.click(
			await screen.findByRole("menuitem", { name: "Show only the decisions that no spec uses" }),
		);
		await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(marked.length));
	});

	it("reads a decision as blocks, Edit opens its form, and a switch shows the text (spec:app-redesign#REQ-021)", async () => {
		const user = userEvent.setup();
		await mountDesign(<Decisions />);
		expect(
			await screen.findByRole("region", { name: "Context and problem statement" }),
		).toBeVisible();
		expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Edit" }));
		expect(await screen.findByRole("textbox", { name: "Title" })).toBeInTheDocument();
		expect(screen.queryByRole("textbox", { name: "ADR text" })).toBeNull();
		await user.click(screen.getByRole("button", { name: "Text" }));
		expect(screen.getByRole("textbox", { name: "ADR text" })).toHaveValue(files()[ADR3]?.text);
		expect(screen.queryByRole("textbox", { name: "Title" })).toBeNull();
	});

	it("keeps the file when the title changes", async () => {
		const user = userEvent.setup();
		await mountDesign(<Decisions />);
		await user.click(await screen.findByRole("button", { name: "Edit" }));
		// The record opens in its form: the title is one field.
		const title = await screen.findByRole("textbox", { name: "Title" });
		await user.clear(title);
		await user.type(title, "Mock in the browser");
		await user.click(screen.getByRole("button", { name: "Save" }));
		const item = await row(/Mock in the browser/);
		await waitFor(() => expect(item).toHaveAttribute("aria-pressed", "true"));
		expect(files()[ADR3]?.text).toContain("Mock in the browser");
	});
});

describe("Design / API", () => {
	/** The endpoint of the left list, by its method and path. */
	const endpoint = async (method: string, path: string) =>
		within(await screen.findByRole("list", { name: "Endpoints" })).findByRole("button", {
			name: new RegExp(`^${path.replace(/[/{}]/g, "\\$&")}\\s*${method}$`),
		});

	it("lists the endpoints of the contracts at the left, and the contracts with title and version", async () => {
		const user = userEvent.setup();
		await mountDesign(<Api />);
		const item = await row(/Orders API/);
		expect(item).toHaveTextContent("1.2.0");
		// The endpoints of every tag sit in one list.
		await endpoint("GET", "/orders");
		await endpoint("POST", "/orders");
		await endpoint("GET", "/customers/{id}");
		await user.click(await endpoint("GET", "/orders/{id}"));
		// Method, path and responses of the open endpoint.
		const open = within(await screen.findByRole("region", { name: "GET /orders/{id}" }));
		expect(open.getByRole("heading", { name: "Read one order" })).toBeInTheDocument();
		expect(open.getByText("404")).toBeInTheDocument();
	});

	it("filters the endpoints with Find an endpoint", async () => {
		const user = userEvent.setup();
		await mountDesign(<Api />);
		await user.type(await screen.findByRole("searchbox", { name: "Find an endpoint" }), "customer");
		const list = await screen.findByRole("list", { name: "Endpoints" });
		await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(1));
	});

	it("sends a GET request and shows the status and the body", async () => {
		const user = userEvent.setup();
		await mountDesign(<Api />);
		await user.click(await endpoint("GET", "/orders"));
		await screen.findByRole("heading", { name: "List the orders" });
		await user.click(screen.getByRole("button", { name: "Send" }));
		const out = await screen.findByRole("status");
		expect(out).toHaveTextContent("200");
		expect(out).toHaveTextContent("o-1");
	});

	it("names the server and waits for one click before a request that is not GET", async () => {
		const user = userEvent.setup();
		await mountDesign(<Api />);
		await user.click(await endpoint("POST", "/orders"));
		await screen.findByRole("heading", { name: "Create an order" });
		await user.click(screen.getByRole("button", { name: "Send" }));
		const dialog = within(await screen.findByRole("dialog", { name: /POST to https:\/\// }));
		expect(screen.queryByRole("status")).toBeNull();
		await user.click(dialog.getByRole("button", { name: "Send" }));
		const out = await screen.findByRole("status");
		expect(out).toHaveTextContent("201");
	});

	it("sends nothing when the person closes the dialog", async () => {
		const user = userEvent.setup();
		await mountDesign(<Api />);
		await user.click(await endpoint("POST", "/orders"));
		await screen.findByRole("heading", { name: "Create an order" });
		await user.click(screen.getByRole("button", { name: "Send" }));
		await user.click(
			await within(await screen.findByRole("dialog")).findByRole("button", { name: "Close" }),
		);
		expect(await screen.findByRole("alert")).toHaveTextContent("Cancelled");
		// The answer box stays empty until a response comes.
		expect(screen.getByRole("status")).toBeEmptyDOMElement();
	});

	it("shows the failure and no response when the call fails", async () => {
		const user = userEvent.setup();
		await mountDesign(<Api />);
		await user.click(await endpoint("GET", "/orders"));
		await screen.findByRole("heading", { name: "List the orders" });
		await user.clear(screen.getByRole("textbox", { name: "Path" }));
		await user.type(screen.getByRole("textbox", { name: "Path" }), "no-slash");
		await user.click(screen.getByRole("button", { name: "Send" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Failed");
		// The answer box stays empty until a response comes.
		expect(screen.getByRole("status")).toBeEmptyDOMElement();
	});

	it("shows the error and no endpoint for a contract that is not valid", async () => {
		const user = userEvent.setup();
		files()["docs/api/bad.yaml"] = { text: "openapi: 3.0.3\npaths: [", stamp: "1" };
		await mountDesign(<Api />);
		const item = await row(/bad/);
		expect(item).toHaveTextContent("Not readable");
		await user.click(item);
		expect(await screen.findByRole("alert")).toBeInTheDocument();
	});
});

describe("Design / Flows", () => {
	const table = async () => within(await screen.findByRole("table"));
	const bodyRows = async () => (await table()).getAllByRole("row").length - 1;
	const saved = () => parseFlows(files()[FLOWS]?.text ?? "").rows;
	const matrix = async () => {
		await mountDesign(<FlowMatrixPage />);
		await screen.findByRole("table");
	};
	/** Opens the menu of a row of the matrix and picks one action. */
	const rowAction = async (
		user: ReturnType<typeof userEvent.setup>,
		who: RegExp,
		action: string,
	) => {
		await user.click((await screen.findAllByRole("button", { name: who }))[0] as HTMLElement);
		await user.click(await screen.findByRole("menuitem", { name: action }));
	};

	it("shows the flows as a plain list From / To / Why, with the bricks and the way to the matrix", async () => {
		await mountDesign(<Flows />);
		const list = await table();
		for (const h of ["From", "To", "Why"])
			expect(list.getByRole("columnheader", { name: h })).toBeVisible();
		expect(await bodyRows()).toBe(20);
		expect(await screen.findByText("Bricks and hosts")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Open the full matrix" })).toBeInTheDocument();
		expect(screen.getByRole("region", { name: "Linked" })).toBeInTheDocument();
	});

	it("shows the full matrix with a back link to the flows", async () => {
		await matrix();
		expect(screen.getByRole("heading", { name: "Flow matrix" })).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Network flows" })).toBeInTheDocument();
		expect(await bodyRows()).toBe(20);
	});

	it("combines the filters: one VLAN and denied", async () => {
		const user = userEvent.setup();
		await matrix();
		await user.click(screen.getByRole("combobox", { name: "VLAN or VNET" }));
		await user.click(await screen.findByRole("option", { name: "VLAN 20" }));
		expect(await bodyRows()).toBe(10);
		await user.click(screen.getByRole("button", { name: "Denied" }));
		expect(await bodyRows()).toBe(2);
		await user.type(screen.getByRole("searchbox", { name: "Find a host" }), "icmp");
		expect(await bodyRows()).toBe(1);
	});

	it("rejects a row with a missing field, names it and writes nothing", async () => {
		const user = userEvent.setup();
		await matrix();
		// "Add a flow" sits in the "More" menu of the matrix page.
		await user.click(await screen.findByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: "Add a flow" }));
		await user.type(screen.getByRole("textbox", { name: "Source" }), "10.1.0.0/24");
		await user.type(screen.getByRole("textbox", { name: "Destination" }), "10.2.0.0/24");
		await user.type(screen.getByRole("textbox", { name: "VLAN or VNET" }), "VLAN 30");
		await user.click(screen.getByRole("button", { name: "Save" }));
		expect(await screen.findByRole("alert")).toHaveTextContent("Protocol: Required");
		expect(saved()).toHaveLength(20);
	});

	it("adds, edits and removes a row from its menu", async () => {
		const user = userEvent.setup();
		await matrix();
		// "Add a flow" sits in the "More" menu of the matrix page.
		await user.click(await screen.findByRole("button", { name: "More" }));
		await user.click(await screen.findByRole("menuitem", { name: "Add a flow" }));
		await user.type(screen.getByRole("textbox", { name: "Source" }), "10.1.0.0/24");
		await user.type(screen.getByRole("textbox", { name: "Destination" }), "10.2.0.0/24");
		await user.type(screen.getByRole("textbox", { name: "VLAN or VNET" }), "VLAN 30");
		await user.type(screen.getByRole("textbox", { name: "Protocol" }), "tcp");
		await user.click(screen.getAllByRole("combobox", { name: "Action" }).at(-1) as HTMLElement);
		await user.click(await screen.findByRole("option", { name: "Allow" }));
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(saved()).toHaveLength(21));
		expect(saved().at(-1)).toMatchObject({ id: 21, network: "VLAN 30", action: "allow" });

		await rowAction(user, /^Actions of 10\.1\.0\.0\/24 10\.2\.0\.0\/24/, "Edit");
		const protocol = screen.getByRole("textbox", { name: "Protocol" });
		await user.clear(protocol);
		await user.type(protocol, "udp");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(saved().at(-1)?.protocol).toBe("udp"));

		await rowAction(user, /^Actions of 10\.1\.0\.0\/24 10\.2\.0\.0\/24/, "Remove");
		await waitFor(() => expect(saved()).toHaveLength(20));
		// A row that kept its note keeps it after another row changes.
		expect(saved()[0]).toMatchObject({ note: "Web portal" });
	});

	it("adds a brick, picks it in a flow with a name and a subnet, and follows a rename", async () => {
		const user = userEvent.setup();
		await mountDesign(<Flows />);
		await user.click(await screen.findByRole("button", { name: "Bricks" }));
		await user.type(await screen.findByRole("textbox", { name: "Brick name" }), "Web");
		await user.click(screen.getByRole("button", { name: "Brick" }));
		await waitFor(() => expect(files()["docs/flows/bricks.json"]?.text).toContain('"Web"'));
		cleanup();
		await matrix();
		await rowAction(user, /^Actions of /, "Edit");
		await user.click(await screen.findByRole("combobox", { name: "Source brick" }));
		await user.click(await screen.findByRole("option", { name: "Web" }));
		await user.type(screen.getByRole("textbox", { name: "Name" }), "portal");
		await user.type(screen.getByRole("textbox", { name: "Subnet" }), "10.0.0.0/24");
		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(saved()[0]).toMatchObject({
				sourceName: "Web",
				name: "portal",
				subnet: "10.0.0.0/24",
			}),
		);
		cleanup();
		await mountDesign(<Flows />, false);
		await user.click(await screen.findByRole("button", { name: "Bricks" }));
		const field = await screen.findByRole("textbox", { name: "Brick name Web" });
		await user.clear(field);
		await user.type(field, "Frontend");
		await user.tab();
		await waitFor(() => expect(saved()[0]?.sourceName).toBe("Frontend"));
		expect(files()["docs/flows/bricks.json"]?.text).toContain('"Frontend"');
	});
});

describe("Design in French", () => {
	it("shows the labels and the statuses in French", async () => {
		mockState().prefs.lang = "fr";
		await mountDesign(<Decisions />);
		expect(await screen.findByRole("button", { name: "Nouvelle décision" })).toBeInTheDocument();
		expect(await row(/Ship a browser mock/)).toHaveTextContent("Vous attend");
		expect(screen.getByRole("list", { name: "Décisions" })).toBeInTheDocument();
	});
});
