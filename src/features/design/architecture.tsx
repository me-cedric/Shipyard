import { TEMPLATE } from "@/lib/design";
import { useI18n } from "@/lib/i18n";
import { likec4 } from "@/ui/molecules/syntax";
import { LikeC4View } from "@/ui/organisms/likec4-view";
import { Canvas } from "./parts";
import { ReaderPage } from "./text-tab";

/**
 * Library / Architecture: the LikeC4 models, rendered live (REQ-006, REQ-007). A full-width
 * reader: the models as chips under the title, the picture left and the text right.
 */
export function Architecture() {
	const { t } = useI18n();
	return (
		<ReaderPage
			kind="model"
			title={t.tabs.design.architecture}
			newLabel={t.design.page.newModel}
			ext="c4"
			template={TEMPLATE.model}
			textLabel={t.design.architecture.text}
			highlight={likec4}
			chips
			view={({ frame, shown }) =>
				shown ? (
					<Canvas>
						<LikeC4View
							source={frame.file.text}
							label={t.design.architecture.render}
							onError={frame.onError}
						/>
					</Canvas>
				) : null
			}
		/>
	);
}
