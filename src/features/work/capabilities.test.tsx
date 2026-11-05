import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { commands, unwrap, type WorkContext_Serialize } from "@/lib/ipc";
import { mountApp } from "@/test/mount";
import { importAll, withTracker } from "@/test/tracker";

type Flag = "hierarchy" | "transitions" | "timeTracking";

/** The fake tracker with one capability flag off. */
async function without(flag: Flag) {
	const real = await unwrap(commands.workContext(0));
	const caps = { ...real.capabilities, [flag]: false } as NonNullable<
		WorkContext_Serialize["capabilities"]
	>;
	return vi
		.spyOn(commands, "workContext")
		.mockResolvedValue({ status: "ok", data: { ...real, capabilities: caps } });
}

const openTicket = async (user: ReturnType<typeof userEvent.setup>) => {
	mountApp("/work/backlog");
	await user.click(
		within(await screen.findByRole("group", { name: "ACME-8" })).getByRole("button"),
	);
	return within(await screen.findByRole("complementary", { name: "ACME-8" }));
};

describe("A tracker with a capability flag off", () => {
	it("shows Time as off, with no error, when the tracker has no worklogs", async () => {
		await withTracker();
		await importAll();
		const real = commands.timeList;
		const spy = vi.spyOn(commands, "timeList").mockImplementation(async (...a) => {
			const r = await real(...a);
			return r.status === "ok" ? { ...r, data: { ...r.data, canSend: false } } : r;
		});
		mountApp("/work/time");
		expect(await screen.findByText("Missing: Time tracking")).toBeInTheDocument();
		expect(screen.queryByRole("alert")).toBeNull();
		spy.mockRestore();
	});

	it("shows the status as off, with no error, when the tracker has no transitions", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		const spy = await without("transitions");
		const aside = await openTicket(user);
		expect(await aside.findByText("Missing: Transitions")).toBeInTheDocument();
		expect(aside.getByRole("combobox", { name: "Status" })).toBeDisabled();
		expect(aside.queryByRole("alert")).toBeNull();
		spy.mockRestore();
	});

	it("opens the board and the ticket with no error when the tracker has no hierarchy", async () => {
		const user = userEvent.setup();
		await withTracker();
		await importAll();
		const spy = await without("hierarchy");
		const aside = await openTicket(user);
		await waitFor(() => expect(aside.getByRole("combobox", { name: "Status" })).toBeEnabled());
		expect(screen.queryByRole("alert")).toBeNull();
		spy.mockRestore();
	});
});
