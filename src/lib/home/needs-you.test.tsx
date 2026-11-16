import { screen, waitFor } from "@testing-library/react";
import { commands, unwrap } from "@/lib/ipc";
import { mockState } from "@/lib/ipc/mock";
import { renderApp } from "@/ui/test-utils";
import { useNeedsYou } from "./index";

function Probe({ everyone = false }: { everyone?: boolean }) {
	const { items, loading, timesheet } = useNeedsYou(everyone);
	return (
		<>
			<span data-testid="loading">{String(loading)}</span>
			<span data-testid="timesheet">{String(timesheet)}</span>
			<span data-testid="items">{items.map((i) => `${i.kind}:${i.id}:${i.who}`).join("|")}</span>
		</>
	);
}
const ids = async () => {
	await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
	await waitFor(() => expect(screen.getByTestId("items").textContent).not.toBe(""));
	return (screen.getByTestId("items").textContent ?? "").split("|").map((x) => x.split(":"));
};

describe("useNeedsYou (spec:app-redesign#REQ-007, REQ-008)", () => {
	beforeEach(async () => {
		await unwrap(commands.projectsOpen("/mock/alpha", false));
	});

	it("lists questions, approvals, plan reviews, agent reviews, then messages, each with a stable id", async () => {
		await unwrap(commands.prReviewStart(141, true));
		renderApp(<Probe />);
		const list = await ids();
		const kinds = list.map((x) => x[0]);
		const order = ["question", "approval", "plan", "review", "message"];
		expect(kinds).toEqual(
			[...kinds].sort((a, b) => order.indexOf(a ?? "") - order.indexOf(b ?? "")),
		);
		expect(new Set(kinds)).toEqual(new Set(order));
		expect(new Set(list.map((x) => x.slice(0, -1).join(":"))).size).toBe(list.length);
		expect(list.every((x) => x.at(-1) === "agent")).toBe(true);
	});

	it("keeps the time reminder out of the list", async () => {
		renderApp(<Probe />);
		await ids();
		expect(screen.getByTestId("items").textContent).not.toMatch(/timesheet/);
	});

	it("applies the routing of the role: a PM loses the approvals, Everyone brings them back", async () => {
		mockState().person = {
			member: "eve",
			found: "email",
			role: "pm",
			admin: false,
			readOnly: false,
			rights: ["costs.view"],
		};
		const mine = renderApp(<Probe />);
		await waitFor(() => expect(screen.getByTestId("items").textContent).not.toMatch(/approval:/));
		mine.unmount();
		renderApp(<Probe everyone />);
		await waitFor(() => expect(screen.getByTestId("items").textContent).toMatch(/approval:/));
	});
});
