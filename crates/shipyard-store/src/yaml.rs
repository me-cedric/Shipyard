//! The one YAML writer of Shipyard. `serde_norway` puts the items of a list flush under their key
//! and single-quotes some text. Biome and Prettier keep the other style: the items indented by two
//! spaces and double quotes. A file that Shipyard saves must pass `biome format`.

use serde::Serialize;

/// The YAML text of a value, in the style that Biome and Prettier keep.
pub fn to_string<T: Serialize + ?Sized>(value: &T) -> Result<String, serde_norway::Error> {
    Ok(restyle(&serde_norway::to_string(value)?))
}

fn indent_of(l: &str) -> usize {
    l.len() - l.trim_start_matches(' ').len()
}

fn is_item(l: &str) -> bool {
    l.trim_start_matches(' ').starts_with("- ") || l.trim() == "-"
}

/// The column of the key that a line starts: after the `- ` of a list item.
fn key_col(l: &str) -> usize {
    let mut col = indent_of(l);
    while l[col..].starts_with("- ") {
        col += 2 + indent_of(&l[col + 2..]);
    }
    col
}

/// shortcut: a text pass, not a YAML emitter. A folded plain scalar whose line ends with `:` and
/// whose next line starts a list at the same column would be shifted. Upgrade to an emitter that
/// sets this style if such text shows up.
fn restyle(text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let mut shift = vec![0usize; lines.len()];
    let mut raw = vec![false; lines.len()]; // the content of a block scalar: keep its text
    let mut scalar_col: Option<usize> = None; // inside a block scalar: its key column
    for (i, l) in lines.iter().enumerate() {
        if let Some(c) = scalar_col {
            if l.trim().is_empty() || indent_of(l) > c {
                raw[i] = true;
                continue;
            }
            scalar_col = None;
        }
        let col = key_col(l);
        let t = l.trim_end();
        if let Some(m) = ["|", ">", "|-", "|+", ">-", ">+"]
            .iter()
            .find(|m| t.ends_with(&format!(" {m}")))
        {
            // A `- |` item has no key: its content is indented from the dash, not from `|`.
            let item = t.len() - m.len() == col && col >= 2;
            scalar_col = Some(if item { col - 2 } else { col });
        }
        // A key with no value whose list follows at the same column: shift the whole list.
        if t.ends_with(':')
            && lines
                .get(i + 1)
                .is_some_and(|n| indent_of(n) == col && is_item(n))
        {
            for (j, n) in lines.iter().enumerate().skip(i + 1) {
                let d = indent_of(n);
                if !n.trim().is_empty() && (d < col || (d == col && !is_item(n))) {
                    break;
                }
                shift[j] += 2;
            }
        }
    }
    let mut out = String::with_capacity(text.len() + 64);
    for ((l, s), raw) in lines.iter().zip(shift).zip(raw) {
        if !l.is_empty() {
            out.push_str(&" ".repeat(s));
        }
        out.push_str(&if raw { (*l).into() } else { double_quoted(l) });
        out.push('\n');
    }
    out
}

/// `key: 'text'` or `- 'text'` becomes double-quoted, when the text has no quote and no `\`.
fn double_quoted(l: &str) -> String {
    let t = l.trim_end();
    let Some(at) = t.find(": '").map(|i| i + 2).or_else(|| {
        t.trim_start_matches(' ')
            .starts_with("- '")
            .then(|| indent_of(t) + 2)
    }) else {
        return l.into();
    };
    match t[at + 1..].strip_suffix('\'') {
        Some(v) if !v.contains(['"', '\\', '\'']) => format!("{}\"{v}\"", &t[..at]),
        _ => l.into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// What `biome format` keeps, fixed by hand.
    const EXPECTED: &str = "gates:
  - pnpm lint
  - cargo test
name: x
tail: \"\"
note: |
  a:
  - b: 'c'
nested:
  - - a
    - b
  - k: v
    list:
      - m
      - n
    other: it's
empty: []
";

    fn value() -> serde_norway::Value {
        serde_norway::from_str(
            "gates: [pnpm lint, cargo test]\nname: x\ntail: ''\nnote: \"a:\\n- b: 'c'\\n\"\n\
             nested: [[a, b], {k: v, list: [m, n], other: \"it's\"}]\nempty: []\n",
        )
        .unwrap()
    }

    #[test]
    fn the_output_has_the_style_of_biome() {
        assert_eq!(to_string(&value()).unwrap(), EXPECTED);
    }

    #[test]
    fn a_block_scalar_in_a_list_item_keeps_its_text() {
        let v = json!({"gates": ["a: 'y'\nb\n", "x"], "n": [["p\n  q: 'z'\n"]]});
        let text = to_string(&v).unwrap();
        assert!(text.contains("'y'") && text.contains("'z'"), "{text}");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(
                &serde_json::to_string(
                    &serde_norway::from_str::<serde_json::Value>(&text).unwrap()
                )
                .unwrap()
            )
            .unwrap(),
            v
        );
    }

    #[test]
    fn the_text_reads_back_to_the_same_value() {
        let v = json!({"a": ["x", {"b": ["y", ["z"]], "c": "it's"}], "d": "q: \"r\"", "e": "- f\n  g:\n- h\n", "i": ""});
        let text = to_string(&v).unwrap();
        assert_eq!(
            serde_norway::from_str::<serde_json::Value>(&text).unwrap(),
            v
        );
        let w = value();
        assert_eq!(
            serde_norway::from_str::<serde_norway::Value>(&to_string(&w).unwrap()).unwrap(),
            w
        );
    }
}
