import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { dataUri } from "@/lib/data-uri";
import { format, useI18n } from "@/lib/i18n";
import { commands, type DesignToken, type FigmaFile, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { Input } from "@/ui/atoms/input";
import { ErrorNotice } from "@/ui/molecules/error-notice";

/**
 * Design / Screens: the Figma API. The token goes to the OS keychain; then the files of a Figma
 * project list, and each file shows its preview and its design tokens. Nothing is written to Figma.
 */
export function FigmaPanel({ file }: { file?: string | null }) {
	const { t } = useI18n();
	const g = t.extras.figma;
	const qc = useQueryClient();
	const hasToken = useQuery({
		queryKey: ["figma", "token"],
		queryFn: () => unwrap(commands.figmaTokenState()),
	}).data;
	const [token, setToken] = useState("");
	const [project, setProject] = useState("");
	const [files, setFiles] = useState<FigmaFile[]>([]);
	const [shown, setShown] = useState<{ name: string; src?: string; tokens?: DesignToken[] } | null>(
		null,
	);
	const [error, setError] = useState<unknown>(null);
	const attempt = async (job: () => Promise<void>) => {
		setError(null);
		try {
			await job();
		} catch (e) {
			setError(e);
		}
	};
	const preview = (key: string, name: string) =>
		attempt(async () => {
			const bytes = await unwrap(commands.figmaPreview(key));
			setShown({ name, src: dataUri("image/png", bytes) });
		});
	const tokens = (key: string, name: string) =>
		attempt(async () => setShown({ name, tokens: await unwrap(commands.figmaTokens(key)) }));
	return (
		<section aria-label={g.title} className="flex flex-col gap-2">
			<h3 className="text-12 font-medium text-n-11">{g.title}</h3>
			{hasToken === false ? (
				<form
					className="flex items-end gap-2"
					onSubmit={(e) => {
						e.preventDefault();
						void attempt(async () => {
							await unwrap(commands.figmaTokenSet(token, true));
							setToken("");
							await qc.invalidateQueries({ queryKey: ["figma", "token"] });
						});
					}}
				>
					<Input
						label={g.token}
						type="password"
						autoComplete="off"
						value={token}
						onChange={(e) => setToken(e.target.value)}
						className="w-64"
					/>
					<Button type="submit" variant="primary" disabled={!token.trim()}>
						{g.saveToken}
					</Button>
				</form>
			) : null}
			{hasToken ? (
				<>
					{file ? (
						<div className="flex gap-2">
							<Button onClick={() => void preview(file, g.file)}>
								{format(g.preview, { name: g.file })}
							</Button>
							<Button onClick={() => void tokens(file, g.file)}>
								{format(g.tokens, { name: g.file })}
							</Button>
						</div>
					) : null}
					<form
						className="flex items-end gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							void attempt(async () => setFiles(await unwrap(commands.figmaFiles(project))));
						}}
					>
						<Input
							label={g.project}
							value={project}
							onChange={(e) => setProject(e.target.value)}
							className="w-80"
						/>
						<Button type="submit" disabled={!project.trim()}>
							{g.list}
						</Button>
					</form>
					{files.length ? (
						<ul aria-label={g.files} className="flex flex-col">
							{files.map((f) => (
								<li key={f.key} className="flex h-row items-center gap-2 border-b text-ui">
									<span className="min-w-0 flex-1 truncate">{f.name}</span>
									<Button variant="ghost" onClick={() => void preview(f.key, f.name)}>
										{format(g.preview, { name: f.name })}
									</Button>
									<Button variant="ghost" onClick={() => void tokens(f.key, f.name)}>
										{format(g.tokens, { name: f.name })}
									</Button>
								</li>
							))}
						</ul>
					) : null}
				</>
			) : null}
			{shown?.src ? (
				<img
					src={shown.src}
					alt={shown.name}
					className="max-h-[50vh] max-w-full self-start rounded-md border"
				/>
			) : null}
			{shown?.tokens ? (
				<ul aria-label={g.designTokens} className="flex flex-col">
					{shown.tokens.map((x) => (
						<li key={x.name} className="flex h-row items-center gap-2 border-b text-12">
							{x.kind === "color" ? (
								<span
									aria-hidden="true"
									className="size-4 shrink-0 rounded-sm border"
									style={{ background: x.value }}
								/>
							) : null}
							<span className="font-mono">{x.name}</span>
							<span className="min-w-0 flex-1 truncate font-mono text-n-11">{x.value}</span>
						</li>
					))}
				</ul>
			) : null}
			{error ? <ErrorNotice error={error} className="text-ui text-danger-text" /> : null}
		</section>
	);
}
