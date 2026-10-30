import { beforeEach, describe, expect, it } from "vitest";
import { commands } from "./bindings";
import { resetMock } from "./mock";
import { unwrap } from "./result";

const open = () => unwrap(commands.projectsOpen("/mock/alpha", false));
const API = "docs/api/orders.yaml";
const FLOWS = "docs/flows/network.yaml";

describe("mock design", () => {
	beforeEach(async () => {
		resetMock();
		await open();
	});

	it("seeds one artifact of each kind, the ADRs and the screens", async () => {
		const l = await unwrap(commands.designList());
		expect(l.artifacts.filter((a) => a.kind === "diagram").map((a) => a.format)).toEqual([
			"excalidraw",
			"drawio",
			"bpmn",
			"mermaid",
		]);
		expect(l.artifacts.map((a) => a.reference)).toEqual(
			expect.arrayContaining([
				"model:system",
				"api:orders",
				"data:shop",
				"flow:network",
				"screen:home",
			]),
		);
		expect(l.artifacts.find((a) => a.kind === "api")).toMatchObject({
			title: "Orders API",
			version: "1.2.0",
		});
		expect(l.adrs.map((a) => [a.number, a.status])).toEqual([
			["0001", "accepted"],
			["0002", "accepted"],
			["0003", "proposed"],
			["0004", "accepted"],
		]);
		expect(l.screens.map((s) => [s.slug, s.broken])).toEqual([
			["home", false],
			["checkout", true],
		]);
		expect(l.doc).toBe("docs/designs/design.md");
	});

	it("lists a design file of the folder as a screen when no screen names it", async () => {
		await unwrap(commands.designWrite("docs/designs/mockups/Landing Page.html", "<p/>", "", true));
		const l = await unwrap(commands.designList());
		expect(l.screens.at(-1)).toMatchObject({
			slug: "landing-page",
			file: "docs/designs/mockups/Landing Page.html",
		});
		expect(l.screens.map((s) => s.slug)).toEqual(["home", "checkout", "landing-page"]);
	});

	it("fails without a project", async () => {
		resetMock();
		await expect(unwrap(commands.designList())).rejects.toMatchObject({
			details: expect.stringContaining("no active project"),
		});
	});

	it("stamps a write and returns the conflict for an old stamp", async () => {
		const { stamp } = await unwrap(commands.designRead(API));
		const a = await unwrap(commands.designWrite(API, "openapi: 3.0.3\n", stamp, false));
		expect(a).toEqual({ conflict: false, stamp: expect.not.stringMatching(`^${stamp}$`) });
		const b = await unwrap(commands.designWrite(API, "other\n", stamp, false));
		expect(b).toEqual({ conflict: true, stamp: a.stamp });
		expect((await unwrap(commands.designRead(API))).text).toBe("openapi: 3.0.3\n");
		await expect(
			unwrap(commands.designWrite("docs/api/new.yaml", "x", null, true)),
		).resolves.toMatchObject({
			conflict: false,
		});
		await expect(
			unwrap(commands.designWrite("docs/api/new.yaml", "x", null, true)),
		).rejects.toMatchObject({ details: expect.stringContaining("exists") });
		await expect(unwrap(commands.designRead("../secret"))).rejects.toMatchObject({
			details: expect.stringContaining("path not allowed"),
		});
	});

	it("creates the next ADR as proposed and decides it", async () => {
		const adr = await unwrap(commands.designAdrCreate("Use  a queue"));
		expect(adr).toMatchObject({
			number: "0005",
			status: "proposed",
			path: "docs/decisions/0005-use-a-queue.md",
		});
		const { stamp } = await unwrap(commands.designRead(adr.path));
		await expect(
			unwrap(commands.designAdrDecide(adr.path, "reject", "  ", stamp)),
		).rejects.toMatchObject({ details: expect.stringContaining("a comment is required") });
		await unwrap(commands.designAdrDecide(adr.path, "reject", "too costly", stamp));
		const l = await unwrap(commands.designList());
		expect(l.adrs.find((a) => a.number === "0005")?.status).toBe("rejected");
		await expect(
			unwrap(commands.designAdrDecide(adr.path, "accept", "x", stamp)),
		).rejects.toMatchObject({
			details: expect.stringContaining("only a proposed ADR can be decided"),
		});
	});

	it("saves the flow table and names a row with a missing field", async () => {
		const { text, stamp } = await unwrap(commands.designRead(FLOWS));
		expect(text.match(/^- id:/gm)).toHaveLength(20);
		const row = {
			id: 21,
			source: "10.10.0.5",
			destination: "10.20.0.9",
			network: "VLAN 10",
			protocol: "tcp",
			action: "allow" as const,
		};
		await expect(
			unwrap(commands.designFlowsSave(FLOWS, [{ ...row, protocol: " " }], stamp)),
		).rejects.toMatchObject({
			details: expect.stringContaining("row 21: missing field: protocol"),
		});
		await expect(
			unwrap(commands.designFlowsSave(FLOWS, [{ ...row, source: "10.10.0" }], stamp)),
		).rejects.toMatchObject({
			details: expect.stringContaining("row 21: invalid source: 10.10.0"),
		});
		expect((await unwrap(commands.designRead(FLOWS))).text).toBe(text);
		const ok = await unwrap(commands.designFlowsSave(FLOWS, [row], stamp));
		expect(ok.conflict).toBe(false);
		expect((await unwrap(commands.designFlowsSave(FLOWS, [row], stamp))).conflict).toBe(true);
	});

	it("answers a try request from the contract", async () => {
		const req = {
			path: API,
			server: "https://{env}.example.com/v1",
			method: "get",
			route: "/orders/o-1?x=1",
			body: null,
		};
		const r = await unwrap(commands.designTry(req, false));
		expect(r.status).toBe(200);
		expect(JSON.parse(r.body)).toMatchObject({ id: "o-1" });
		expect((await unwrap(commands.designTry({ ...req, route: "/nope" }, false))).status).toBe(404);
		await expect(
			unwrap(commands.designTry({ ...req, method: "POST", route: "/orders" }, false)),
		).rejects.toMatchObject({
			details: expect.stringContaining("this change needs the click of a person"),
		});
		expect(
			(await unwrap(commands.designTry({ ...req, method: "POST", route: "/orders" }, true))).status,
		).toBe(201);
		await expect(
			unwrap(commands.designTry({ ...req, server: "https://evil.test" }, false)),
		).rejects.toMatchObject({ details: expect.stringContaining("does not list") });
		await expect(
			unwrap(commands.designTry({ ...req, method: "TRACE" }, true)),
		).rejects.toMatchObject({ details: expect.stringContaining("not allowed") });
	});

	it("records an open target and refuses a broken .fig link", async () => {
		await unwrap(commands.designOpen("https://www.figma.com/file/abc123/Home"));
		await expect(unwrap(commands.designOpen("docs/designs/checkout.fig"))).rejects.toMatchObject({
			details: expect.stringContaining("not an https"),
		});
	});

	it("lists the entities and the backlinks of the design files", async () => {
		expect(await unwrap(commands.refsResolve("api:orders"))).toMatchObject({
			state: "resolved",
			title: "Orders API",
		});
		const groups = await unwrap(commands.refsBacklinks("diagram:context"));
		expect(groups.map((g) => [g.kind, g.items.map((i) => i.source)])).toEqual([
			["doc", ["doc:docs/designs/design.md"]],
			["screen", ["screen:home"]],
		]);
	});
});
