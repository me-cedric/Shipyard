import type { ReactElement } from "react";
import { commands, unwrap } from "@/lib/ipc";
import { useBacklinks } from "@/lib/refs";
import { ShellProvider, useShell } from "@/lib/shell";
import { renderApp } from "@/ui/test-utils";

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
	return renderApp(
		<ShellProvider>
			{ui}
			<Probe />
		</ShellProvider>,
	);
}
