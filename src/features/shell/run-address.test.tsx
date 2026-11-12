import { RouterContextProvider } from "@tanstack/react-router";
import { renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { Providers } from "@/app/providers";
import { createAppRouter, createMemoryHistory } from "@/app/router";
import { commands, unwrap } from "@/lib/ipc";
import { DEMO_FOLDER } from "@/lib/ipc/mock";
import { NotificationsProvider, useOpenNotice } from "@/lib/notifications";
import { runHref, runOfRef, ShellProvider } from "@/lib/shell";
import { mountApp } from "@/test/mount";
import { routers } from "@/test/routers";

// update-ux-declutter REQ-027: each run has an address, and each link to a run opens it.
const find = async (key: string) => {
	const r = (await unwrap(commands.runsList())).find((x) => x.key === key);
	if (!r) throw new Error(key);
	return r;
};
const open = () => unwrap(commands.projectsOpen(DEMO_FOLDER, false));
const idle = (router: ReturnType<typeof mountApp>) =>
	waitFor(() => expect(router.state.status).toBe("idle"));

describe("Run address", () => {
	beforeEach(() => {
		window.matchMedia = ((query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => {},
			removeEventListener: () => {},
		})) as unknown as typeof window.matchMedia;
	});

	it("builds the address of a run and of a unit from a ref", () => {
		expect(runHref("r1")).toEqual({
			to: "/factory/runs/$runId",
			params: { runId: "r1" },
			search: {},
		});
		expect(runOfRef("run:r1/build")?.search).toEqual({ unit: "build" });
		expect(runOfRef("run:r1")?.params).toEqual({ runId: "r1" });
		expect(runOfRef("pr:github:44")).toBeUndefined();
	});

	it("opens a run by its address, with Runs selected in the Factory bar", async () => {
		await open();
		const run = await find("ACME-2");
		const router = mountApp(`/factory/runs/${run.id}`);
		expect(await screen.findByRole("region", { name: "ACME-2" })).toBeInTheDocument();
		const tabs = screen.getByRole("navigation", { name: "Tabs" });
		expect(within(tabs).getByRole("link", { name: "Runs", current: "page" })).toBeInTheDocument();
		// The Runs list header and its lanes do not show above the run.
		expect(screen.queryByRole("heading", { name: /^Working/ })).not.toBeInTheDocument();
		await idle(router);
	});

	it("keeps the unit in the address as a search parameter", async () => {
		await open();
		const run = await find("ACME-2");
		const router = mountApp(`/factory/runs/${run.id}?unit=build`);
		await screen.findByRole("region", { name: "ACME-2" });
		expect(router.state.location.search).toEqual({ unit: "build" });
		await idle(router);
	});

	it("says No run for an unknown run, and leads back to Runs", async () => {
		await open();
		const user = userEvent.setup();
		const router = mountApp("/factory/runs/nope");
		expect(await screen.findByText("No run")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Runs" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/factory/runs"));
		await idle(router);
	});

	it("opens the run from a card, and Back returns to the list", async () => {
		await open();
		const user = userEvent.setup();
		const run = await find("ACME-2");
		const router = mountApp("/factory/runs");
		await user.click(await screen.findByRole("button", { name: /ACME-2/ }));
		await waitFor(() => expect(router.state.location.pathname).toBe(`/factory/runs/${run.id}`));
		await screen.findByRole("region", { name: "ACME-2" });
		router.history.back();
		await waitFor(() => expect(router.state.location.pathname).toBe("/factory/runs"));
		await idle(router);
	});

	it("opens the run from a Home inbox chip and from Open plan", async () => {
		await open();
		const user = userEvent.setup();
		const waiting = await find("ACME-1");
		const router = mountApp("/home/today");
		const card = await screen.findByRole("region", { name: "Q-101" });
		await user.click(within(card).getByRole("button", { name: new RegExp(`run:${waiting.id}`) }));
		await waitFor(() => expect(router.state.location.pathname).toBe(`/factory/runs/${waiting.id}`));
		await idle(router);
	});

	it("opens the run from Open plan", async () => {
		await open();
		const user = userEvent.setup();
		const plan = (await unwrap(commands.runsList())).find((r) => r.state === "PlanReview");
		const router = mountApp("/home/today");
		await user.click(await screen.findByRole("button", { name: "Open plan" }));
		await waitFor(() => expect(router.state.location.pathname).toBe(`/factory/runs/${plan?.id}`));
		await idle(router);
	});

	it("opens the run from a notification target", async () => {
		await open();
		const run = await find("ACME-2");
		const router = createAppRouter(createMemoryHistory({ initialEntries: ["/home/today"] }));
		routers().push(router);
		const wrapper = ({ children }: { children: ReactNode }) => (
			<Providers>
				<RouterContextProvider router={router}>
					<NotificationsProvider>
						<ShellProvider>{children}</ShellProvider>
					</NotificationsProvider>
				</RouterContextProvider>
			</Providers>
		);
		const { result } = renderHook(() => useOpenNotice(), { wrapper });
		await waitFor(() => expect(result.current).toBeTruthy());
		result.current({
			id: "n1",
			kind: "needs-you",
			title: "x",
			target: { ref: `run:${run.id}` },
			time: 0,
			read: false,
		});
		await waitFor(() => expect(router.state.location.pathname).toBe(`/factory/runs/${run.id}`));
		await waitFor(() => expect(router.state.status).toBe("idle"));
	});

	it("opens the run from a Sessions row, at its unit", async () => {
		await open();
		const user = userEvent.setup();
		const first = (await unwrap(commands.sessionsList())).find((s) => s.pull == null);
		const router = mountApp("/factory/sessions");
		const row = (await screen.findAllByText(first?.key ?? ""))[0]?.closest(
			'[role="row"]',
		) as HTMLElement;
		await user.click(row);
		await waitFor(() => expect(router.state.location.pathname).toBe(`/factory/runs/${first?.run}`));
		expect(router.state.location.search).toEqual({ unit: first?.step });
		await idle(router);
	});

	it("opens the run from a row of the Usage table", async () => {
		await open();
		const user = userEvent.setup();
		const run = await find("ACME-2");
		const router = mountApp("/factory/usage");
		const row = (await screen.findAllByText("ACME-2"))[0]?.closest('[role="row"]') as HTMLElement;
		await user.click(row);
		await waitFor(() => expect(router.state.location.pathname).toBe(`/factory/runs/${run.id}`));
		await idle(router);
	});

	it("opens the run from an Activity row, with Stop as a separate control", async () => {
		await open();
		const user = userEvent.setup();
		const run = await find("ACME-2");
		const router = mountApp("/home/today");
		await user.click(await screen.findByRole("button", { name: /^Activity: / }));
		const panel = await screen.findByRole("dialog", { name: "Activity" });
		const link = await within(panel).findByRole("link", { name: /ACME-2/ });
		expect(link).toHaveAttribute("href", `/factory/runs/${run.id}`);
		expect(within(link).queryByRole("button")).not.toBeInTheDocument();
		expect(within(panel).getByRole("button", { name: "Stop ACME-2" })).toBeInTheDocument();
		await user.click(link);
		await waitFor(() => expect(router.state.location.pathname).toBe(`/factory/runs/${run.id}`));
		await idle(router);
	});

	it("opens the run from a Today run row", async () => {
		await open();
		const user = userEvent.setup();
		const run = await find("ACME-2");
		const router = mountApp("/home/today");
		await user.click(await screen.findByRole("link", { name: run.title }));
		await waitFor(() => expect(router.state.location.pathname).toBe(`/factory/runs/${run.id}`));
		await idle(router);
	});
});
