import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { Permission, ThreadSettings } from "@/lib/ipc";
import { usePrefs } from "@/lib/prefs";
import { useActiveProject } from "@/lib/projects";
import { Button } from "@/ui/atoms/button";
import { Dialog } from "@/ui/organisms/dialog";
import type { Assistant } from "./use-assistant";

const PERMISSIONS: Permission[] = ["approve", "auto", "bypass", "read_only"];

/**
 * The permission levels that the thread can take, and the one way to set a level: Auto and Bypass
 * show a warning with the effect first. The composer and the card "The assistant may" share it.
 */
export function usePermission(a: Assistant) {
	const { t } = useI18n();
	const readOnly = usePrefs().profile.readOnly;
	const s = a.current?.thread.settings;
	// Auto pre-approves the edit tools: one warning with the effect, and a click, before it applies.
	const [warnAuto, setWarnAuto] = useState(false);
	// Bypass permissions asks once for each project. A project with a read only profile never gets it.
	const project = useActiveProject().data?.id ?? "";
	const [warnBypass, setWarnBypass] = useState(false);
	const bypassKey = `shipyard:bypass-confirmed:${project}`;
	const runner = a.runners.find((r) => r.runner === s?.runner);
	const levels = readOnly
		? PERMISSIONS.filter((p) => p === "read_only")
		: PERMISSIONS.filter((p) => p !== "bypass" || runner?.bypass);
	const applyBypass = async () => {
		if ((await a.setSettings({ permission: "bypass" })) && project)
			localStorage.setItem(bypassKey, "1");
		setWarnBypass(false);
	};
	/** A runner with no Bypass takes the thread back to Edit with approval. */
	const change = (patch: Partial<ThreadSettings>) => {
		const next = patch.runner ? a.runners.find((r) => r.runner === patch.runner) : runner;
		const drop = s?.permission === "bypass" && !next?.bypass;
		void a.setSettings(drop ? { ...patch, permission: "approve" } : patch);
	};
	const pick = (p: Permission) => {
		if (p === "auto") setWarnAuto(true);
		else if (p === "bypass" && !localStorage.getItem(bypassKey)) setWarnBypass(true);
		else void a.setSettings({ permission: p });
	};
	const dialogs = (
		<>
			<Dialog
				open={warnAuto}
				onOpenChange={setWarnAuto}
				title={t.assistant.autoWarn.title}
				actions={
					<Button
						variant="primary"
						onClick={() => {
							void a.setSettings({ permission: "auto" });
							setWarnAuto(false);
						}}
					>
						{t.assistant.autoWarn.accept}
					</Button>
				}
			>
				<p className="text-ui text-n-11">{t.assistant.autoWarn.body}</p>
			</Dialog>
			<Dialog
				open={warnBypass}
				onOpenChange={setWarnBypass}
				title={t.assistant.bypassWarn.title}
				actions={
					<Button variant="danger" onClick={() => void applyBypass()}>
						{t.assistant.bypassWarn.accept}
					</Button>
				}
			>
				<p className="text-ui text-n-11">{t.assistant.bypassWarn.body}</p>
			</Dialog>
		</>
	);
	return { readOnly, levels, pick, change, dialogs };
}
