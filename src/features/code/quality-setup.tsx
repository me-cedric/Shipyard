import { useEffect, useState } from "react";
import { useForgeActions } from "@/lib/code";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/ui/atoms/button";
import { Textarea } from "@/ui/atoms/textarea";
import { Dialog } from "@/ui/organisms/dialog";
import { message } from "./project-gate";

/**
 * The checks that the team runs, one command on each line. The list starts from what the project
 * files and its CI workflows show. Save writes it to `gates` in `.shipyard/project.yaml`.
 */
export function QualitySetup({ onClose }: { onClose: () => void }) {
	const { t } = useI18n();
	const { gatesPropose, gatesSave } = useForgeActions();
	const [text, setText] = useState("");
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		gatesPropose()
			.then((list) => setText(list.join("\n")))
			.catch((e) => setError(message(e)));
	}, [gatesPropose]);
	const gates = text
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	return (
		<Dialog
			open
			onOpenChange={(o) => !o && onClose()}
			title={t.forge.quality.setup}
			wide
			actions={
				<Button
					variant="primary"
					disabled={gates.length === 0}
					onClick={() => gatesSave(gates).then(onClose, (e) => setError(message(e)))}
				>
					{t.forge.quality.save}
				</Button>
			}
		>
			<Textarea
				label={t.forge.quality.setupCommands}
				className="min-h-40 font-mono"
				value={text}
				onChange={(e) => setText(e.target.value)}
			/>
			{error ? (
				<p role="alert" className="text-ui text-danger-text">
					{error}
				</p>
			) : null}
		</Dialog>
	);
}
