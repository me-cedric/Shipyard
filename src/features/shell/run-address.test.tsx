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
			to: "/flow/runs/$runId",
			params: { runId: "r1" },
			search: {},
		});
		expect(runOfRef("run:r1/build")?.search).toEqual({ unit: "build" });
		expect(runOfRef("run:r1")?.params).toEqual({ runId: "r1" });
		expect(runOfRef("pr:github:44")).toBeUndefined();
	});

	it("opens a run by its address, with Flow selected in the section bar", async () => {
		await open();
		const run = await find("ACME-2");
		const router = mountApp(`/factory/runs/${run.id}`);
		expect(await screen.findByRole("region", { name: "ACME-2" })).toBeInTheDocument();
		const tabs = screen.getByRole("navigation", { name: "Tabs" });
		expect(within(tabs).getByRole("link", { name: "Flow", current: "page" })).toBeInTheDocument();
		// The board and its columns do not show above the run.
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

	it("says No run for an unknown run, and leads back to Flow", async () => {
		await open();
		const user = userEvent.setup();
		const router = mountApp("/factory/runs/nope");
		expect(await screen.findByText("No run")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Flow" }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/flow/flow"));
		await idle(router);
	});

	it("opens the run from a card, and Back returns to the list", async () => {
		await open();
		const user = userEvent.setup();
		const router = mountApp("/factory/runs");
		await user.click(await screen.findByRole("button", { name: /ACME-2/ }));
		await waitFor(() => expect(router.state.location.pathname).toBe("/flow/feature/wi%3AACME-2"));
		await screen.findByRole("region", { name: "ACME-2" });
		router.history.back();
		await waitFor(() => expect(router.state.location.pathname).toBe("/flow/flow"));
		await idle(router);
	});

	it("opens the run from a Home inbox chip and from Open plan", async () => {
		await open();
		const user = userEvent.setup();
		const waiting = await find("ACME-1");
		const router = mountApp("/home/today");
		// The card of Today names the run by its title, which opens the run.
		const card = await screen.findByRole("article");
		await user.click(within(card).getByRole("button", { name: waiting.title }));
		await waitFor(() => expect(router.state.location.pathname).toBe(`/flow/runs/${waiting.id}`));
		await idle(router);
	});

	it("opens the run from Open plan", async () => {
		await open();
		const user = userEvent.setup();
		const plan = (await unwrap(commands.runsList())).find((r) => r.state === "PlanReview");
		const router = mountApp("/home/today");
		const queue = within(await screen.findByRole("list", { name: "Needs you" }));
		// The queue shows three things: "N more" shows the rest in place.
		await user.click(await queue.findByRole("button", { name: /^\d+ more$/ }));
		await user.click(
			await queue.findByRole("button", { name: new RegExp(`Review the plan ${plan?.title}`) }),
		);
		await user.click(await screen.findByRole("button", { name: "Open plan" }));
		await waitFor(() => expect(router.state.location.pathname).toBe(`/flow/runs/${plan?.id}`));
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
		await waitFor(() => expect(router.state.location.pathname).toBe(`/flow/runs/${run.id}`));
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
		await waitFor(() => expect(router.state.location.pathname).toBe(`/flow/runs/${first?.run}`));
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
		await waitFor(() => expect(router.state.location.pathname).toBe(`/flow/runs/${run.id}`));
		await idle(router);
	});

	it("opens the run from a Usage row with the keyboard, and the row names the ticket and its title", async () => {
		await open();
		const user = userEvent.setup();
		const run = await find("ACME-2");
		const router = mountApp("/factory/usage");
		const row = (await screen.findAllByText("ACME-2"))[0]?.closest('[role="row"]') as HTMLElement;
		expect(row).toHaveTextContent(run.title);
		expect(row).not.toHaveTextContent("run:");
		row.focus();
		await user.keyboard("{Enter}");
		await waitFor(() => expect(router.state.location.pathname).toBe(`/flow/runs/${run.id}`));
		await idle(router);
	});

	it("opens the run from its ref and from the agent of a live row of Crew", async () => {
		await open();
		const user = userEvent.setup();
		const run = await find("ACME-2");
		const session = (await unwrap(commands.sessionsList())).find(
			(s) => s.run === run.id && s.state === "running",
		);
		const router = mountApp("/factory/agents-map");
		// The address of the agents map opens the live rows.
		const table = () => screen.findByRole("table", { name: "Agents at work" });
		const runRef = (
			await within(await table()).findAllByRole("button", {
				name: new RegExp(`^${run.reference},`),
			})
		)[0];
		runRef?.focus();
		await user.keyboard("{Enter}");
		await waitFor(() => expect(router.state.location.pathname).toBe(`/flow/runs/${run.id}`));
		expect(router.state.location.search).toEqual({});
		router.history.back();
		await waitFor(() => expect(router.state.location.pathname).toBe("/crew/crew"));
		expect(router.state.location.search).toEqual({ view: "live" });
		const agent = await waitFor(async () => {
			const b = within(await table())
				.getAllByRole("button")
				.find((x) => x.title === `run:${run.id}/${session?.step}`);
			if (!b) throw new Error("no agent");
			return b;
		});
		await user.click(agent);
		await waitFor(() => expect(router.state.location.search).toEqual({ unit: session?.step }));
		await idle(router);
	});

	it("opens the run from a row of Today / Activity, with Stop as a separate control", async () => {
		await open();
		const user = userEvent.setup();
		const run = await find("ACME-2");
		const router = mountApp("/today/activity");
		const panel = within(await screen.findByRole("region", { name: "Active runs" }));
		const link = await panel.findByRole("link", { name: /ACME-2/ });
		expect(link).toHaveAttribute("href", `/flow/runs/${run.id}`);
		expect(within(link).queryByRole("button")).not.toBeInTheDocument();
		expect(panel.getByRole("button", { name: "Stop ACME-2" })).toBeInTheDocument();
		await user.click(link);
		await waitFor(() => expect(router.state.location.pathname).toBe(`/flow/runs/${run.id}`));
		await idle(router);
	});

	it("opens the run from a Today run row", async () => {
		await open();
		const user = userEvent.setup();
		const run = await find("ACME-2");
		const router = mountApp("/home/today");
		await user.click(await screen.findByRole("link", { name: run.title }));
		await waitFor(() => expect(router.state.location.pathname).toBe(`/flow/runs/${run.id}`));
		await idle(router);
	});
});
