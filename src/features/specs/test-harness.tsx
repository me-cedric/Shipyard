import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { commands, unwrap } from "@/lib/ipc";
import { useBacklinks } from "@/lib/refs";
import { ShellProvider, useShell } from "@/lib/shell";
import { useChanges } from "@/lib/specs";
import { renderApp } from "@/ui/test-utils";
import { ChangeDetail } from "./change-detail";

/** What the inspector would show: the ref that a view selected and its backlinks by kind. */
function Probe() {
	const { selectedRef } = useShell();
	const groups = useBacklinks(selectedRef).data ?? [];
	return (
		<output aria-label="Inspector">
			{selectedRef}
			{groups.map((g) => ` ${g.kind}:${g.items.length}`)}
		</output>
	);
}

/** A view inside the shell state, with the mock project open. */
export async function renderSpecs(ui: ReactElement) {
	await unwrap(commands.projectsOpen("/mock/alpha", false));
	// The pages sit in a router: the way back and the links of the cards need it.
	const router = createRouter({
		routeTree: createRootRoute({
			component: () => (
				<ShellProvider>
					{ui}
					<Probe />
				</ShellProvider>
			),
		}),
		history: createMemoryHistory(),
	});
	return renderApp(<RouterProvider router={router} />);
}

/** The detail of one change, as the Brief of its feature page draws it. */
export function OpenChange({ id }: { id: string }) {
	const change = useChanges().data?.find((c) => c.id === id);
	return change ? <ChangeDetail change={change} onBack={() => {}} /> : null;
}

/** Opens a change and waits until its proposal form has loaded, so the buttons that the test clicks stay. */
export async function renderChange(id: string) {
	const view = await renderSpecs(<OpenChange id={id} />);
	await screen.findByRole("textbox", { name: "Why" });
	return view;
}
