import { useState } from "react";
import { useEditors } from "@/lib/code";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { ErrorNotice } from "@/ui/molecules/error-notice";

/** Opens a project file in the first code editor that the machine has. Nothing shows when none is found. */
export function OpenInEditor({ path, line }: { path: string; line?: number | null }) {
	const { t } = useI18n();
	const editor = useEditors().data?.[0];
	const [error, setError] = useState<unknown>(null);
	if (!editor) return null;
	return (
		<>
			<Button
				variant="ghost"
				onClick={async () => {
					try {
						setError(null);
						await unwrap(commands.editorOpen(editor.id, path, line ?? null));
					} catch (e) {
						setError(e);
					}
				}}
			>
				{format(t.forge.editor.openIn, { name: editor.name })}
			</Button>
			<ErrorNotice error={error} />
		</>
	);
}
