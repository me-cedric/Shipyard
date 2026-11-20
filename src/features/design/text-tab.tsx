import type { ReactNode } from "react";
import {
	type Artifact,
	DESIGN_DIR,
	ofKind,
	slug,
	useDesignActions,
	useDesignList,
} from "@/lib/design";
import { useI18n } from "@/lib/i18n";
import { RightButton } from "@/lib/rights";
import { cn } from "@/lib/utils";
import { Badge } from "@/ui/atoms/badge";
import { Button } from "@/ui/atoms/button";
import { Chip } from "@/ui/atoms/chip";
import { CodeEditor } from "@/ui/molecules/code-editor";
import { ContextMenu } from "@/ui/molecules/context-menu";
import { SideSwitch, useSides } from "@/ui/molecules/pane-toggle";
import type { Highlighter } from "@/ui/molecules/syntax";
import { LibraryPage } from "../library/page-parts";
import { FileFrame, type Frame } from "./frame";
import {
	DesignGate,
	Empty,
	fileName,
	ListNotice,
	Reader,
	TextCard,
	useEdit,
	usePage,
} from "./parts";

export type ReaderView = {
	frame: Frame;
	/** The picture side shows. */
	shown: boolean;
	/** The files of the page as chips. */
	files: ReactNode;
};

type Props = {
	kind: "model" | "data";
	title: string;
	/** The name of the new action and of its form. */
	newLabel: string;
	ext: string;
	template: string;
	textLabel: string;
	highlight: Highlighter;
	/** The files show as chips under the title, with the new action as the last chip. */
	chips?: boolean;
	/** The picture side, and the parts that stay beside it. */
	view: (v: ReaderView) => ReactNode;
};

function Body({
	a,
	frame,
	created,
	files,
	page,
	...p
}: Props & {
	a: Artifact;
	frame: Frame;
	created: boolean;
	files: ReactNode;
	page: ReturnType<typeof usePage>;
}) {
	const { t } = useI18n();
	const d = t.design.page;
	const { file, error } = frame;
	const { sides, choose } = useSides(
		`design-${p.kind}`,
		created || file.conflict || error?.line != null,
		"preview",
	);
	const { area, edit } = useEdit(() => sides.editor || choose("both"));
	const item = { ref: a.reference, title: a.title, path: a.path };
	return (
		<LibraryPage
			title={p.title}
			action={
				<>
					<SideSwitch sides={sides} choose={choose} />
					<RightButton right="design.edit" onClick={edit}>
						{d.edit}
					</RightButton>
					<Button variant="primary" onClick={() => page.askChange(item)}>
						{d.ask}
					</Button>
				</>
			}
			menu={[
				...(p.chips ? [] : [{ label: p.newLabel, onClick: () => page.add() }]),
				...page.pageMenu(item),
			]}
		>
			{page.dialogs}
			{p.chips ? files : null}
			<ListNotice />
			{frame.alerts}
			<div ref={area} className="contents">
				<Reader>
					{/* The open file by name, for a reader of the screen. */}
					<h2 className="sr-only">{a.title}</h2>
					{p.view({ frame, shown: sides.preview, files })}
					{sides.editor ? (
						<TextCard name={fileName(a.path)} save={frame.save}>
							<CodeEditor
								label={p.textLabel}
								value={file.text}
								errorLine={error?.line}
								onChange={file.setText}
								highlight={p.highlight}
							/>
						</TextCard>
					) : null}
				</Reader>
			</div>
		</LibraryPage>
	);
}

/**
 * A page of text files that open on their live view, with the text on demand
 * (spec:app-redesign#REQ-021): LikeC4 models and DBML models. The switch Picture / Both / Text and
 * Edit sit in the page header. The view keeps its last good render and reports its error with the
 * line (REQ-006, REQ-007, REQ-014, REQ-015).
 */
export function ReaderPage(p: Props) {
	const { t } = useI18n();
	const list = useDesignList().data;
	const act = useDesignActions();
	const arts = ofKind(list, p.kind);
	const items = arts.map((a) => ({
		ref: a.reference,
		title: a.title,
		issue: a.issue,
		path: a.path,
	}));
	const page = usePage(
		p.title,
		items,
		{
			run: async (name) => {
				const s = slug(name);
				await act.create(`${DESIGN_DIR[p.kind]}/${s}.${p.ext}`, p.template);
				return `${p.kind}:${s}`;
			},
		},
		p.newLabel,
	);
	const a = arts.find((x) => x.reference === page.selected);
	const files = (
		<fieldset
			aria-label={p.chips ? t.design.page.models : t.design.page.files}
			className={cn("m-0 flex min-w-0 gap-2 border-0 p-0", p.chips ? "flex-wrap" : "flex-col")}
		>
			{items.map((i) => (
				<ContextMenu key={i.ref} items={page.menuOf(i)}>
					{p.chips ? (
						<Chip selected={i.ref === page.selected} onClick={() => page.pick(i.ref)}>
							{i.title}
							{i.issue ? <Badge variant="danger">{t.design.unreadable}</Badge> : null}
						</Chip>
					) : (
						<Button
							aria-pressed={i.ref === page.selected}
							className="w-full font-mono font-normal"
							onClick={() => page.pick(i.ref)}
						>
							{i.path ? fileName(i.path) : i.title}
							{i.issue ? <Badge variant="danger">{t.design.unreadable}</Badge> : null}
						</Button>
					)}
				</ContextMenu>
			))}
			{p.chips ? (
				<RightButton
					right="design.edit"
					variant="ghost"
					className="rounded-sm bg-n-3 px-3.5 font-medium"
					onClick={() => page.add()}
				>
					{p.newLabel}
				</RightButton>
			) : null}
		</fieldset>
	);
	return (
		<DesignGate title={p.title}>
			{a ? (
				<FileFrame key={a.path} path={a.path} issue={a.issue}>
					{(frame) => (
						<Body
							{...p}
							a={a}
							frame={frame}
							created={a.reference === page.created}
							files={files}
							page={page}
						/>
					)}
				</FileFrame>
			) : (
				<LibraryPage title={p.title}>
					{page.dialogs}
					<ListNotice />
					<Empty label={p.newLabel} onAdd={() => page.add()} />
				</LibraryPage>
			)}
		</DesignGate>
	);
}
