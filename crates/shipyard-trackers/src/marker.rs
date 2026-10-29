//! Hidden markers in comment bodies: the question marker of `add-questions-loop` (REQ-006) and the
//! claim stamp of `add-sync` (REQ-009).
//!
//! A caller writes and reads one form, the canonical marker `<!-- shipyard:KIND ARG -->`. `KIND`
//! is lowercase letters. `ARG` is one token of letters, digits, `.`, `_` and `-`. The adapter maps
//! the canonical form to the wire form of its tracker and back:
//!
//! | Tracker | Wire form | Why |
//! |---|---|---|
//! | GitHub, GitLab | canonical | The API keeps the raw Markdown. The page hides an HTML comment. |
//! | Jira (wiki), Azure DevOps (HTML), Linear (Markdown) | `(shipyard:KIND ARG)` | These stores rewrite or drop an HTML comment (`--` becomes a dash, a sanitizer removes it). A token of letters, digits and one hyphen stays as it is in each of them. It shows as small plain text. |
//!
//! `to_wire` runs on every body that an adapter sends. `from_wire` runs on every body that an
//! adapter returns, so a caller never sees the wire form.

/// The canonical marker.
pub fn make(kind: &str, arg: &str) -> String {
    format!("<!-- shipyard:{kind} {arg} -->")
}

/// The `ARG` of the first canonical marker of `kind` in `body`.
pub fn find(body: &str, kind: &str) -> Option<String> {
    scan(body, CANON.0, CANON.1)
        .into_iter()
        .find_map(|(_, _, inner)| {
            let (k, arg) = inner.split_once(' ')?;
            (k == kind).then(|| arg.to_string())
        })
}

const CANON: (&str, &str) = ("<!-- shipyard:", " -->");
const PLAIN: (&str, &str) = ("(shipyard:", ")");

/// The body as the tracker stores it. `plain` is the form for Jira, Azure DevOps and Linear.
pub(crate) fn to_wire(body: &str, plain: bool) -> String {
    if plain {
        rewrite(body, CANON, PLAIN)
    } else {
        body.to_string()
    }
}

/// The body as a caller reads it: every wire marker becomes the canonical one.
pub(crate) fn from_wire(body: &str) -> String {
    rewrite(body, PLAIN, CANON)
}

/// `(start, end, inner)` of each well-formed marker between `open` and `close`.
fn scan<'a>(body: &'a str, open: &str, close: &str) -> Vec<(usize, usize, &'a str)> {
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(i) = body[from..].find(open) {
        let start = from + i;
        let inner_at = start + open.len();
        let hit = body[inner_at..]
            .find(close)
            .map(|j| (&body[inner_at..inner_at + j], inner_at + j + close.len()))
            .filter(|(inner, _)| valid(inner));
        match hit {
            Some((inner, end)) => {
                out.push((start, end, inner));
                from = end;
            }
            None => from = inner_at,
        }
    }
    out
}

/// `KIND ARG`, one space, no other character.
fn valid(inner: &str) -> bool {
    let Some((kind, arg)) = inner.split_once(' ') else {
        return false;
    };
    !kind.is_empty()
        && kind.bytes().all(|b| b.is_ascii_lowercase())
        && !arg.is_empty()
        && arg
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}

fn rewrite(body: &str, from: (&str, &str), to: (&str, &str)) -> String {
    let mut out = String::with_capacity(body.len());
    let mut at = 0;
    for (start, end, inner) in scan(body, from.0, from.1) {
        out.push_str(&body[at..start]);
        out.push_str(to.0);
        out.push_str(inner);
        out.push_str(to.1);
        at = end;
    }
    out.push_str(&body[at..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_canonical_marker_round_trips_through_the_plain_form() {
        let body = format!("Which option?\n\n1. a\n2. b\n\n{}", make("q", "Q-007"));
        let wire = to_wire(&body, true);
        assert!(wire.ends_with("(shipyard:q Q-007)"), "{wire}");
        assert!(!wire.contains("<!--"));
        assert_eq!(from_wire(&wire), body);
        assert_eq!(find(&from_wire(&wire), "q").as_deref(), Some("Q-007"));
    }

    #[test]
    fn the_raw_form_is_not_changed_and_reading_is_idempotent() {
        let body = make("claim", "m-1a2b.c3");
        assert_eq!(to_wire(&body, false), body);
        assert_eq!(from_wire(&body), body);
    }

    #[test]
    fn text_that_is_not_a_marker_stays() {
        for text in [
            "(shipyard:q)",
            "(shipyard:Q Q-1)",
            "(shipyard:q Q 1)",
            "(shipyard:q Q-1",
            "see (shipyard) and <!-- note -->",
            "<!-- shipyard:q Q-1 -- >",
        ] {
            assert_eq!(from_wire(text), text);
            assert_eq!(to_wire(text, true), text);
        }
    }

    #[test]
    fn two_markers_and_a_broken_one_in_a_body() {
        let wire = "(shipyard:q Q-1) mid (shipyard:q ) end (shipyard:claim m-2)";
        assert_eq!(
            from_wire(wire),
            "<!-- shipyard:q Q-1 --> mid (shipyard:q ) end <!-- shipyard:claim m-2 -->"
        );
        assert_eq!(find(&from_wire(wire), "claim").as_deref(), Some("m-2"));
        assert_eq!(find(&from_wire(wire), "w"), None);
    }
}
