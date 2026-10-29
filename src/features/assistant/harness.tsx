import { render, screen } from "@testing-library/react";
import { Providers } from "@/app/providers";
import { commands, unwrap } from "@/lib/ipc";
import { AssistantPanel, useAssistant } from "./index";

export type HostProps = {
	open?: boolean;
	view?: string;
	selected?: string | null;
	onOpenRef?: (ref: string) => void;
};

/** What the shell does: it holds the state of the panel and puts the panel beside the view. */
function Host({ open = true, view = "/specs/changes", selected = null, onOpenRef }: HostProps) {
	const chat = useAssistant({ open, view, selected });
	return (
		<>
			<textarea aria-label="Notes" />
			<AssistantPanel
				assistant={chat}
				open={open}
				onClose={() => {}}
				onOpenRef={onOpenRef ?? (() => {})}
			/>
		</>
	);
}

/** The panel on the mock project, with the first thread loaded. */
export async function mountAssistant(props: HostProps = {}, project = true) {
	if (project) await unwrap(commands.projectsOpen("/mock/alpha", false));
	const view = render(
		<Providers>
			<Host {...props} />
		</Providers>,
	);
	const again = (next: HostProps) =>
		view.rerender(
			<Providers>
				<Host {...next} />
			</Providers>,
		);
	// The mode picker shows once the first thread is loaded. Its name is the same in both languages.
	if (props.open !== false) await screen.findByRole("combobox", { name: "Mode" });
	return { ...view, again };
}

export const panel = () => screen.findByRole("complementary", { name: "Assistant" });
export const input = () => screen.getByRole("textbox", { name: "Message" });
