import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { commands, errorDialog, isTauri, toFailure } from "@/lib/ipc";
import { outcomeError, useProjectActions } from "@/lib/projects";

/** A folder that the person drops on the window opens as a project, as the folder picker does. The first dropped path counts. */
export function useDropFolder() {
	const { t } = useI18n();
	const { openFolder } = useProjectActions();
	useEffect(() => {
		if (!isTauri()) return;
		let stop = false;
		let off = () => {};
		// A window that cannot listen only loses the drop: it is a shortcut for the Open folder button.
		void Promise.resolve()
			.then(() => getCurrentWebview())
			.then((view) =>
				view.onDragDropEvent((e) => {
					if (e.payload.type !== "drop") return;
					const path = e.payload.paths[0];
					if (!path) return;
					// A composer takes its own drop. The position is physical: scale it to CSS pixels.
					const { x, y } = e.payload.position;
					const r = window.devicePixelRatio || 1;
					if (document.elementFromPoint(x / r, y / r)?.closest("[data-drop-zone]")) return;
					void commands
						.projectsIsFolder(path)
						.then((folder) => (folder ? openFolder(path) : null))
						.then((o) => {
							const error = o && outcomeError(t, o);
							if (error) void errorDialog(error);
						})
						.catch((err) => void errorDialog(toFailure(err).message));
				}),
			)
			.then((f) => {
				if (stop) f();
				else off = f;
			})
			.catch(() => {});
		return () => {
			stop = true;
			off();
		};
	}, [openFolder, t]);
}
