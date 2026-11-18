//! "Build a tile for me" (`spec:app-redesign#REQ-032`): the request to the agent and the check of
//! its reply. No I/O. The agent proposes one tile of the catalogue. Nothing else passes the check.

use serde::{Deserialize, Serialize};
use specta::Type;

/// The widths and the heights that the tile settings offer, in grid cells.
pub const WIDTHS: [u32; 5] = [3, 4, 6, 8, 12];
pub const HEIGHTS: [u32; 4] = [2, 3, 4, 6];
/// The most characters of the words of the person, and of the name of a tile.
pub const WORDS_MAX: usize = 500;
pub const TITLE_MAX: usize = 60;

/// A tile that the agent proposes. It is on no dashboard until a person accepts it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct TileProposal {
    pub kind: String,
    pub title: String,
    pub w: u32,
    pub h: u32,
}

/// The words of the person, trimmed. Empty or too long words are refused.
pub fn words(text: &str) -> Result<&str, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("say what the tile must show".into());
    }
    if text.chars().count() > WORDS_MAX {
        return Err(format!(
            "the text of the tile is longer than {WORDS_MAX} characters"
        ));
    }
    Ok(text)
}

/// The request of the turn. It holds the catalogue and the form of the reply, and no word of the
/// person: those go as a quote, which the prompt marks as data.
pub fn request(kinds: &[&str]) -> String {
    format!(
        "A person describes one dashboard tile in the quote. Choose the tile kind of the catalogue \
         that shows it best. Read no file and change nothing.\n\
         Catalogue of tile kinds: {}.\n\
         Widths: {WIDTHS:?}. Heights: {HEIGHTS:?}.\n\
         Reply with one JSON object and no other text: \
         {{\"kind\": \"<a kind of the catalogue>\", \"title\": \"<a short name>\", \"w\": <width>, \"h\": <height>}}",
        kinds.join(", ")
    )
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Reply {
    kind: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    w: Option<u32>,
    #[serde(default)]
    h: Option<u32>,
}

/// The size of `sizes` nearest to `n`. No size: `default`.
fn hold(n: Option<u32>, sizes: &[u32], default: u32) -> u32 {
    let n = n.unwrap_or(default);
    sizes
        .iter()
        .copied()
        .min_by_key(|s| s.abs_diff(n))
        .unwrap_or(default)
}

/// The tile of a reply. The reply is one JSON object, alone or in a code fence. A kind outside
/// `kinds` and a reply of another form are errors. The size is held to the sizes of the settings.
/// The name is one line of plain characters, cut at [`TITLE_MAX`].
pub fn parse(reply: &str, kinds: &[&str]) -> Result<TileProposal, String> {
    let form = || "the agent gave no tile: build it again".to_string();
    let (start, end) = reply.find('{').zip(reply.rfind('}')).ok_or_else(form)?;
    let body = reply.get(start..=end).ok_or_else(form)?;
    let r: Reply = serde_json::from_str(body).map_err(|_| form())?;
    if !kinds.contains(&r.kind.as_str()) {
        return Err(format!("unknown tile: {}", r.kind));
    }
    let title: String = r
        .title
        .chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .trim()
        .chars()
        .take(TITLE_MAX)
        .collect();
    Ok(TileProposal {
        kind: r.kind,
        title,
        w: hold(r.w, &WIDTHS, 4),
        h: hold(r.h, &HEIGHTS, 3),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const KINDS: [&str; 3] = ["work", "runs", "questions"];

    #[test]
    fn a_reply_of_the_asked_form_gives_a_tile_of_the_catalogue() {
        let t = parse(
            r#"{"kind":"runs","title":"Runs by state","w":6,"h":4}"#,
            &KINDS,
        )
        .unwrap();
        assert_eq!(
            (t.kind.as_str(), t.title.as_str(), t.w, t.h),
            ("runs", "Runs by state", 6, 4)
        );
        // A code fence and words around the object do not matter.
        let fenced = "Here it is:\n```json\n{\"kind\": \"work\"}\n```";
        let t = parse(fenced, &KINDS).unwrap();
        assert_eq!(
            (t.kind.as_str(), t.title.as_str(), t.w, t.h),
            ("work", "", 4, 3)
        );
    }

    #[test]
    fn a_kind_outside_the_catalogue_and_a_wrong_form_are_refused() {
        assert_eq!(
            parse(r#"{"kind":"weather"}"#, &KINDS).unwrap_err(),
            "unknown tile: weather"
        );
        for bad in [
            "",
            "I cannot do that.",
            r#"{"title":"No kind"}"#,
            r#"{"kind":"work","w":"wide"}"#,
            r#"{"kind":"work","path":"/etc/passwd"}"#,
            r#"["work"]"#,
            "} {",
        ] {
            assert!(
                parse(bad, &KINDS)
                    .unwrap_err()
                    .starts_with("the agent gave no tile"),
                "{bad}"
            );
        }
    }

    #[test]
    fn the_size_is_held_to_the_sizes_of_the_settings_and_the_name_is_cut() {
        let t = parse(r#"{"kind":"work","w":100,"h":0}"#, &KINDS).unwrap();
        assert_eq!((t.w, t.h), (12, 2));
        let t = parse(r#"{"kind":"work","w":5,"h":5}"#, &KINDS).unwrap();
        assert!(WIDTHS.contains(&t.w) && HEIGHTS.contains(&t.h));
        let long = format!(r#"{{"kind":"work","title":"  a\nb{}"}}"#, "x".repeat(200));
        let t = parse(&long, &KINDS).unwrap();
        assert_eq!(t.title.chars().count(), TITLE_MAX);
        assert!(t.title.starts_with("abx"));
    }

    #[test]
    fn the_words_of_the_person_have_a_size_and_stay_out_of_the_request() {
        assert_eq!(words("  runs by state \n").unwrap(), "runs by state");
        assert!(words("  ").is_err());
        assert!(words(&"x".repeat(WORDS_MAX + 1)).is_err());
        let r = request(&KINDS);
        assert!(r.contains("work, runs, questions"));
    }
}
