import { useState } from "react";
import { useEditors } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { ErrorNotice } from "@/ui/molecules/error-notice";

/** Opens a project file in the first code editor that the machine has. Nothing shows when none is found. */
export function OpenInEditor({
	path,
	line,
	plain,
}: {
	path: string;
	line?: number | null;
	/** The outlined button "Open in the editor", without the name of the editor. */
	plain?: boolean;
}) {
	const { t } = useI18n();
	const editor = useEditors().data?.[0];
	const [error, setError] = useState<unknown>(null);
	if (!editor) return null;
	return (
		<>
			<Button
				variant={plain ? undefined : "ghost"}
				onClick={async () => {
					try {
						setError(null);
						await unwrap(commands.editorOpen(editor.id, path, line ?? null));
					} catch (e) {
						setError(e);
					}
				}}
			>
				{plain ? t.forge.history.openEditor : format(t.forge.editor.openIn, { name: editor.name })}
			</Button>
			<ErrorNotice error={error} />
		</>
	);
}
