import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format, useI18n } from "@/lib/i18n";
import { commands } from "@/lib/ipc";
import { DOC_DIR, useDocFile, useDocList, useSlideTheme } from "@/lib/knowledge";
import { Button } from "@/ui/atoms/button";
import { PlayIcon } from "@/ui/icons";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { EditorFrame } from "@/ui/organisms/editor-frame";
import { SlideDeck } from "@/ui/organisms/slide-deck";
import { ListTab } from "./list-tab";

const TEMPLATE = (name: string) => `# ${name}\n\n---\n\n## Slide\n\n- Point\n`;

/** One deck: the text with a live preview, and the present mode (REQ-017 to REQ-019). */
function DeckEditor({ path, title }: { path: string; title: string }) {
	const { t } = useI18n();
	const k = t.knowledge;
	const file = useDocFile(path);
	const theme = useSlideTheme().data?.value;
	const [present, setPresent] = useState(false);
	// The Rust parser splits the slides: the app holds no copy of the rule.
	const deck = useQuery({
		queryKey: ["knowledge", "deck", file.text],
		queryFn: () => commands.slideParse(file.text),
		placeholderData: (prev) => prev,
	}).data;
	const slides = deck?.slides ?? [];
	return (
		<EditorFrame
			title={title}
			refId={`doc:${path}`}
			actions={
				<Button onClick={() => setPresent(true)} disabled={slides.length === 0}>
					<PlayIcon size={14} />
					{k.slides.present}
				</Button>
			}
			primary={{ label: k.editor.save, onClick: () => void file.save(), disabled: !file.dirty }}
			save={file.conflict ? "conflict" : file.dirty ? "dirty" : "clean"}
			error={file.error ? { message: file.error } : null}
			onReload={() => void file.reload()}
			onKeepMine={() => void file.keepMine()}
			labels={k.editor}
		>
			<div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-1 gap-3">
				<CodeEditor label={k.editor.text} value={file.text} onChange={file.setText} />
				{theme ? (
					<div className="min-h-0 overflow-auto">
						<SlideDeck
							slides={slides}
							style={theme}
							label={`${k.slides.slides} (${slides.length})`}
							slideLabel={(n) => format(k.slides.slide, { n })}
						/>
					</div>
				) : null}
			</div>
			{present && theme ? (
				<SlideDeck
					present
					slides={slides}
					style={theme}
					label={k.slides.present}
					slideLabel={(n) => format(k.slides.slide, { n })}
					onLeave={() => setPresent(false)}
				/>
			) : null}
		</EditorFrame>
	);
}

/** Knowledge / Slides: the decks of the repository, one theme for all (REQ-017). */
export function Slides() {
	const { t } = useI18n();
	const k = t.knowledge.slides;
	const rows = useDocList().data?.slides;
	return (
		<ListTab
			title={k.title}
			noun={k.newDeck}
			nameLabel={k.name}
			base={DOC_DIR.slides}
			rows={rows}
			template={TEMPLATE}
		>
			{(row) => <DeckEditor path={row.path} title={row.title} />}
		</ListTab>
	);
}
