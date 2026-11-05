import { useQuery } from "@tanstack/react-query";
import { designKeys } from "@/lib/design";
import { format, useI18n } from "@/lib/i18n";
import { commands, unwrap } from "@/lib/ipc";
import { Button } from "@/ui/atoms/button";
import { ErrorNotice } from "@/ui/molecules/error-notice";

const COLOR = /^(#|rgb|hsl|hwb|lab|lch|oklab|oklch|color\()/i;

/** A token name can come twice in one file (two modes): the key counts each name. */
function uniqueKeys<T extends { name: string }>(rows: T[]): [string, T][] {
	const seen = new Map<string, number>();
	return rows.map((r) => {
		const n = seen.get(r.name) ?? 0;
		seen.set(r.name, n + 1);
		return [`${r.name}#${n}`, r];
	});
}

/**
 * Design / Screens: the tokens of the open project, from its design doc and its token files. The
 * view only reads. With no token it offers `onAdd`, which puts a starter block in the doc text for
 * the person to save. It never shows the tokens of Shipyard.
 */
export function TokenView({ onAdd }: { onAdd: () => void }) {
	const { t } = useI18n();
	const s = t.design.screens;
	const q = useQuery({
		queryKey: [...designKeys.list, "tokens"],
		queryFn: () => unwrap(commands.designTokens()),
	});
	const files = q.data ?? [];
	return (
		// The region scrolls, so the keyboard needs to reach it (axe `scrollable-region-focusable`).
		<section
			aria-label={s.tokens}
			// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling region must take the focus
			tabIndex={0}
			className="min-h-0 overflow-auto"
		>
			<ErrorNotice error={q.error} />
			{q.isSuccess && files.length === 0 ? (
				<div className="flex flex-col items-start gap-2 py-2">
					<p className="text-ui text-n-11">{s.noTokens}</p>
					<Button variant="secondary" onClick={onAdd}>
						{s.addTokens}
					</Button>
				</div>
			) : null}
			{files.map((f) => (
				<div key={f.path}>
					<h3 className="py-1 text-12 font-medium text-n-11" title={f.path}>
						{format(t.count, { name: f.path, count: f.tokens.length })}
					</h3>
					<ul>
						{uniqueKeys(f.tokens).map(([key, r]) => (
							<li key={key} className="flex h-row items-center gap-2 border-b text-12">
								{COLOR.test(r.value) ? (
									<span
										aria-hidden="true"
										className="size-4 shrink-0 rounded-sm border"
										style={{ background: r.value }}
									/>
								) : null}
								<span className="font-mono">{r.name}</span>
								<span className="min-w-0 flex-1 truncate font-mono text-n-11" title={r.value}>
									{r.value}
								</span>
							</li>
						))}
					</ul>
				</div>
			))}
		</section>
	);
}
