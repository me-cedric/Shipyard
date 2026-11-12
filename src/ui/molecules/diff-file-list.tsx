import { type ComponentProps, type ReactNode, useMemo } from "react";
import { format, useI18n } from "@/lib/i18n";
import { Badge } from "../atoms/badge";
import { Checkbox } from "../atoms/checkbox";
import { ChevronDownIcon, ChevronRightIcon } from "../icons";
import { DiffView, parseDiff } from "./diff-view";
import { FILE_MARK, type FileState } from "./file-row";

export type DiffFileItem = {
	path: string;
	/** The mark of the row. Absent: no mark. */
	state?: FileState;
	/** The unified diff. `null` or absent: the forge sent none, the row says "No preview". */
	patch?: string | null;
	binary?: boolean;
	truncated?: boolean;
	/** Review threads and pending comments on the file: a badge on the row. */
	comments?: number;
};

type Extras = Pick<
	ComponentProps<typeof DiffView>,
	"notes" | "lineActionLabel" | "onLineAction" | "lineActionDisabled" | "hiddenNotesLabel"
>;

/** The lines that a file adds and removes. */
export function countsOf(text: string) {
	const lines = parseDiff(text);
	return {
		added: lines.filter((l) => l.kind === "add").length,
		removed: lines.filter((l) => l.kind === "del").length,
	};
}

function Row({
	file,
	open,
	onToggle,
	viewed,
	onViewedChange,
	head,
	foot,
	diffProps,
}: {
	file: DiffFileItem;
	open: boolean;
	onToggle: () => void;
	viewed?: boolean;
	onViewedChange?: (viewed: boolean) => void;
	head?: ReactNode;
	foot?: ReactNode;
	diffProps?: Extras;
}) {
	const { t } = useI18n();
	const n = useMemo(() => (file.patch ? countsOf(file.patch) : null), [file.patch]);
	const mark = file.state ? FILE_MARK[file.state] : null;
	return (
		<div data-path={file.path} className="border-b last:border-b-0">
			<div className="flex items-center bg-n-2 hover:bg-n-3">
				<button
					type="button"
					aria-expanded={open}
					onClick={onToggle}
					className="flex min-h-row min-w-0 flex-1 items-center gap-2 px-3 text-left text-n-11 focus-visible:shadow-glow"
				>
					{open ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
					{mark && file.state ? (
						<Badge
							variant={mark.variant}
							role="img"
							aria-label={t.code.state[file.state]}
							className="w-5 justify-center px-0"
						>
							{mark.letter}
						</Badge>
					) : null}
					<span className="min-w-0 flex-1 truncate font-mono text-11">{file.path}</span>
					{file.comments ? (
						<Badge variant="info">
							{format(
								file.comments === 1
									? t.forge.pullInline.commentsOne
									: t.forge.pullInline.commentsMany,
								{ n: file.comments },
							)}
						</Badge>
					) : null}
					{n && !file.binary ? (
						<>
							<span aria-hidden="true" className="font-mono text-11">
								<span className="text-success-text">+{n.added}</span>{" "}
								<span className="text-danger-text">−{n.removed}</span>
							</span>
							<span className="sr-only">
								{format(t.forge.pullFiles.counts, { added: n.added, removed: n.removed })}
							</span>
						</>
					) : null}
				</button>
				{onViewedChange ? (
					<span className="pr-3">
						<Checkbox
							hideLabel
							label={format(t.forge.pullFiles.viewedFile, { path: file.path })}
							checked={!!viewed}
							onCheckedChange={(v) => onViewedChange(v === true)}
						/>
					</span>
				) : null}
			</div>
			{open ? (
				// An open diff far off screen skips its layout and paint until it comes near (no JS).
				<div className="[contain-intrinsic-size:auto_24rem] [content-visibility:auto]">
					{head}
					{file.patch == null && !file.binary ? (
						<p className="px-3 py-1 text-ui text-n-11">{t.code.noPreview}</p>
					) : (
						<DiffView
							text={file.patch ?? ""}
							path={file.path}
							binary={file.binary}
							truncated={file.truncated}
							label={format(t.code.diff, { path: file.path })}
							binaryLabel={t.code.binary}
							truncatedLabel={t.code.truncated}
							showAllLabel={t.forge.pullFiles.showAll}
							{...diffProps}
						/>
					)}
					{foot}
				</div>
			) : null}
		</div>
	);
}

/**
 * The changed files, each closed with its path and its counts. A diff mounts only while its file
 * is open. The parent owns `expanded` and `viewed`, so it can draw Expand all and a viewed counter.
 */
export function DiffFileList({
	files,
	expanded,
	onToggle,
	viewed,
	onViewedChange,
	head,
	foot,
	diffProps,
}: {
	files: DiffFileItem[];
	expanded: ReadonlySet<string>;
	onToggle: (path: string) => void;
	/** With `onViewedChange`, each row gets a Viewed checkbox. */
	viewed?: ReadonlySet<string>;
	onViewedChange?: (path: string, viewed: boolean) => void;
	/** Above the diff of an open file: an action such as Open file. */
	head?: (file: DiffFileItem) => ReactNode;
	/** Under the diff of an open file: the comments on lines that the diff does not show. */
	foot?: (file: DiffFileItem) => ReactNode;
	/** The notes and the line action of the diff of one file: line comments go here. */
	diffProps?: (file: DiffFileItem) => Extras;
}) {
	return (
		<>
			{files.map((f) => (
				<Row
					key={f.path}
					file={f}
					open={expanded.has(f.path)}
					onToggle={() => onToggle(f.path)}
					viewed={viewed?.has(f.path)}
					onViewedChange={onViewedChange && ((v) => onViewedChange(f.path, v))}
					head={head?.(f)}
					foot={foot?.(f)}
					diffProps={diffProps?.(f)}
				/>
			))}
		</>
	);
}
