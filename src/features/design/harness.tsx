import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import type { ReactElement } from "react";
import { Providers } from "@/app/providers";
import { refActions } from "@/app/ref-actions";
import { RefDetail } from "@/features/shell/ref-detail";
import { commands, unwrap } from "@/lib/ipc";
import { ShellProvider, useShell } from "@/lib/shell";
import { Inspector } from "@/ui/organisms/inspector";

function Frame({ children }: { children: ReactElement }) {
	const { inspectorOpen, setInspectorOpen, selectedRef, openRef } = useShell();
	return (
		<>
			<main>{children}</main>
			<Inspector open={inspectorOpen} onClose={() => setInspectorOpen(false)} title="Inspector">
				{selectedRef ? <RefDetail refId={selectedRef} onOpen={openRef} /> : null}
			</Inspector>
		</>
	);
}

/** One Design view with the inspector of the shell, on the mock project. */
export async function mountDesign(view: ReactElement, open = true) {
	if (open) await unwrap(commands.projectsOpen("/mock/alpha", false));
	// The views sit in a router: the open action of the empty state needs it.
	const router = createRouter({
		routeTree: createRootRoute({
			component: () => (
				<ShellProvider refActions={refActions}>
					<Frame>{view}</Frame>
				</ShellProvider>
			),
		}),
		history: createMemoryHistory(),
	});
	return render(
		<Providers>
			<RouterProvider router={router} />
		</Providers>,
	);
}

/** Shows the text beside the picture: a reader opens on the picture alone (spec:app-redesign#REQ-021). */
export const showText = async (user: UserEvent) =>
	user.click(await screen.findByRole("button", { name: "Both" }));

/** The inspector of the shell. */
export const inspector = () => screen.findByRole("complementary", { name: "Inspector" });
