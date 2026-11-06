import { useQuery } from "@tanstack/react-query";
import { dataUri } from "@/lib/data-uri";
import { useI18n } from "@/lib/i18n";
import { type BlobSource, commands, type DiffSide, unwrap } from "@/lib/ipc";

const MIME: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	svg: "image/svg+xml",
	ico: "image/x-icon",
	bmp: "image/bmp",
	avif: "image/avif",
};

const ext = (path: string) => path.split(".").pop()?.toLowerCase() ?? "";

const size = (n: number) =>
	n < 1024
		? `${n} B`
		: n < 1024 ** 2
			? `${(n / 1024).toFixed(1)} KB`
			: `${(n / 1024 ** 2).toFixed(1)} MB`;

function useBlob(path: string, source: BlobSource) {
	return useQuery({
		queryKey: ["code", "blob", path, source],
		queryFn: () => unwrap(commands.codeBlob(path, source)),
	});
}

/** The picture of a file that has no text diff: the old and the new one, else one line with its kind and size. */
export function Preview({ path, side }: { path: string; side: DiffSide }) {
	const { t } = useI18n();
	const staged = side === "staged";
	const now = useBlob(path, staged ? "index" : "work");
	const was = useBlob(path, staged ? "head" : "index");
	if (now.isPending || was.isPending) return null;
	const mime = MIME[ext(path)];
	// A SVG shows as a picture, never inline: its scripts stay dead.
	const shown = (
		[
			[t.code.before, was.data],
			[t.code.after, now.data],
		] as const
	).flatMap(([name, b]) => (mime && b && b.bytes.length > 0 ? [{ name, bytes: b.bytes }] : []));
	if (shown.length > 0)
		return (
			<div className="flex flex-wrap items-start justify-center gap-3 p-3">
				{shown.map(({ name, bytes }) => (
					<img
						key={name}
						src={dataUri(mime ?? "", bytes)}
						alt={shown.length > 1 ? `${name}: ${path}` : path}
						className="max-h-96 max-w-full object-contain"
					/>
				))}
			</div>
		);
	const n = now.data?.size ?? was.data?.size ?? 0;
	return (
		<p className="px-3 py-6 text-center text-ui text-n-11">
			{`${t.code.noPreview} · ${mime ? ext(path).toUpperCase() : t.code.binary} · ${size(n)}`}
		</p>
	);
}
