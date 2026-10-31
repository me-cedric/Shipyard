import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { dataUri } from "@/lib/data-uri";
import { useI18n } from "@/lib/i18n";
import { commands, type Picture, pickImage, unwrap } from "@/lib/ipc";
import { useActiveProject } from "@/lib/projects";
import { Button } from "@/ui/atoms/button";
import { IconButton } from "@/ui/atoms/icon-button";
import { TrashIcon } from "@/ui/icons";
import { ErrorNotice } from "@/ui/molecules/error-notice";

/** The picture as a `data:` address. The logo belongs to the active project. */
export function usePicture(which: Picture) {
	const project = useActiveProject().data?.id ?? null;
	return useQuery({
		queryKey: ["picture", which, which === "logo" ? project : null],
		enabled: which === "avatar" || project !== null,
		queryFn: async () => {
			const img = await unwrap(commands.pictureGet(which));
			return img ? dataUri(img.mime, img.bytes) : null;
		},
	});
}

/** A picture of the person or of the project: shown, chosen from a file, or removed. */
export function PictureField({ which, label }: { which: Picture; label: string }) {
	const { t } = useI18n();
	const qc = useQueryClient();
	const src = usePicture(which).data;
	const [error, setError] = useState<unknown>(null);
	const set = async (path: string | null) => {
		setError(null);
		try {
			await unwrap(commands.pictureSet(which, path, true));
			await qc.invalidateQueries({ queryKey: ["picture", which] });
		} catch (e) {
			setError(e);
		}
	};
	return (
		<span className="flex items-center gap-2">
			{src ? (
				<img src={src} alt={label} className="size-8 rounded-full border object-cover" />
			) : null}
			<Button
				onClick={() =>
					void pickImage().then((p) => {
						if (p) void set(p);
					})
				}
			>
				{t.extras.picture.choose}
			</Button>
			{src ? (
				<IconButton label={t.extras.picture.remove} onClick={() => void set(null)}>
					<TrashIcon size={14} />
				</IconButton>
			) : null}
			{error ? <ErrorNotice error={error} className="text-12 text-danger-text" /> : null}
		</span>
	);
}
