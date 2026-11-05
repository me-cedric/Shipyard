//! The theme file (spec `themes`, REQ-003, REQ-004; ADR 0018). A theme is data: each value is
//! checked here before it reaches CSS. No I/O: the store reads and writes the files.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use specta::Type;

/// The format version that this build reads and writes.
pub const FORMAT: u32 = 1;
/// The font stacks of Settings / Me. A theme names one; nothing is fetched.
pub const FONTS: [&str; 5] = ["system", "grotesk", "humanist", "serif", "mono"];
/// The colour tokens of the advanced level. The same list is `src/lib/themes/tokens.json`.
pub const TOKENS: [&str; 33] = [
    "surface-0",
    "surface-1",
    "surface-2",
    "surface-3",
    "n-1",
    "n-2",
    "n-3",
    "n-4",
    "n-5",
    "n-6",
    "n-7",
    "n-8",
    "n-9",
    "n-10",
    "n-11",
    "n-12",
    "accent",
    "accent-hover",
    "accent-fg",
    "accent-subtle",
    "accent-text",
    "success",
    "success-subtle",
    "success-text",
    "warning",
    "warning-subtle",
    "warning-text",
    "danger",
    "danger-subtle",
    "danger-text",
    "info",
    "info-subtle",
    "info-text",
];
/// The largest corner radius of a control, in pixels.
pub const MAX_RADIUS: u8 = 16;
const COLOUR_FNS: [&str; 9] = [
    "rgb", "rgba", "hsl", "hsla", "oklch", "oklab", "lab", "lch", "color",
];

/// The theme that the file starts from. Each token that the file does not set keeps its value.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ThemeBase {
    Light,
    Dark,
    Oled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThemeFile {
    /// The format version: [`FORMAT`].
    pub shipyard_theme: u32,
    /// Lower case letters, digits and `-`. The file name in the library.
    pub id: String,
    pub name: String,
    pub base: ThemeBase,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub accent: Option<String>,
    /// Surface 0. The view derives the other surfaces and the neutral scale.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background: Option<String>,
    /// The main text colour.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub foreground: Option<String>,
    /// The corner radius of a control, in pixels.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub radius: Option<u8>,
    /// A key of [`FONTS`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font: Option<String>,
    /// A name of [`TOKENS`] to a colour. A token wins over a simple field.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub tokens: BTreeMap<String, String>,
}

/// A hex colour, or a colour function whose arguments are numbers, `%`, `deg`, `/`, `none` or a
/// colour space name. No nested function, so no `url()` and no `var()`.
pub fn is_colour(v: &str) -> bool {
    let v = v.trim().to_ascii_lowercase();
    if let Some(hex) = v.strip_prefix('#') {
        return matches!(hex.len(), 3 | 4 | 6 | 8) && hex.chars().all(|c| c.is_ascii_hexdigit());
    }
    let Some((name, rest)) = v.split_once('(') else {
        return false;
    };
    let Some(args) = rest.strip_suffix(')') else {
        return false;
    };
    // A colour that a browser computed can be long: `color(srgb 0.0509803921568627 ... / 0.5)`.
    v.len() <= 160
        && COLOUR_FNS.contains(&name)
        && !args.trim().is_empty()
        && args
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || " .,%/+-".contains(c))
}

fn plain_id(id: &str) -> bool {
    (1..=40).contains(&id.len())
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && !id.starts_with('-')
}

/// Every fault of a theme, as `<field>: <reason>`. Empty when the theme is valid.
pub fn faults(t: &ThemeFile) -> Vec<String> {
    let mut out = Vec::new();
    if t.shipyard_theme != FORMAT {
        out.push(format!(
            "shipyardTheme: version {} is not known, use {FORMAT}",
            t.shipyard_theme
        ));
    }
    if !plain_id(&t.id) {
        out.push("id: use 1 to 40 lower case letters, digits and -".into());
    }
    let name = t.name.trim();
    if name.is_empty() || name.chars().count() > 60 || name.chars().any(char::is_control) {
        out.push("name: use 1 to 60 characters".into());
    }
    for (field, v) in [
        ("accent", &t.accent),
        ("background", &t.background),
        ("foreground", &t.foreground),
    ] {
        if v.as_deref().is_some_and(|v| !is_colour(v)) {
            out.push(format!("{field}: not a colour"));
        }
    }
    if t.radius.is_some_and(|r| r > MAX_RADIUS) {
        out.push(format!("radius: use 0 to {MAX_RADIUS}"));
    }
    if let Some(f) = &t.font
        && !FONTS.contains(&f.as_str())
    {
        out.push(format!("font: use one of {}", FONTS.join(", ")));
    }
    for (k, v) in &t.tokens {
        if !TOKENS.contains(&k.as_str()) {
            out.push(format!("tokens.{k}: not a token"));
        } else if !is_colour(v) {
            out.push(format!("tokens.{k}: not a colour"));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn theme() -> ThemeFile {
        ThemeFile {
            shipyard_theme: 1,
            id: "harbor-night".into(),
            name: "Harbor night".into(),
            base: ThemeBase::Dark,
            accent: Some("#3bb9fd".into()),
            background: Some("oklch(0.18 0.02 250)".into()),
            foreground: None,
            radius: Some(6),
            font: Some("humanist".into()),
            tokens: BTreeMap::from([("n-11".into(), "rgb(159 179 200 / 90%)".into())]),
        }
    }

    #[test]
    fn a_valid_theme_has_no_fault() {
        assert_eq!(faults(&theme()), Vec::<String>::new());
    }

    #[test]
    fn colours_are_hex_or_functions_with_numbers() {
        for ok in [
            "#000",
            "#0b1622",
            "#0b1622cc",
            "oklch(0.5 0.1 250)",
            "color(srgb 0.1 0.2 0.3)",
            "oklch(0 0 none)",
            "color(srgb 0.0509803921568627 0.0862745098039216 0.133333333333333 / 0.5)",
        ] {
            assert!(is_colour(ok), "{ok}");
        }
        for bad in [
            "url(https://x.test/a.png)",
            "var(--accent)",
            "rgb(var(--x))",
            "red; background: url(x)",
            "#12",
            "expression(alert(1))",
            "oklch()",
            "red",
        ] {
            assert!(!is_colour(bad), "{bad}");
        }
    }

    #[test]
    fn each_fault_names_its_field() {
        let mut t = theme();
        t.shipyard_theme = 2;
        t.id = "../x".into();
        t.accent = Some("url(https://x.test/a.png)".into());
        t.radius = Some(40);
        t.font = Some("https://x.test/font.woff2".into());
        t.tokens.insert("n-99".into(), "#000".into());
        t.tokens.insert("n-1".into(), "var(--n-2)".into());
        let f = faults(&t);
        for field in [
            "shipyardTheme:",
            "id:",
            "accent:",
            "radius:",
            "font:",
            "tokens.n-99:",
            "tokens.n-1:",
        ] {
            assert!(f.iter().any(|x| x.starts_with(field)), "{field} in {f:?}");
        }
    }

    #[test]
    fn the_fonts_are_the_font_stacks_of_settings() {
        assert!(FONTS.contains(&"system"));
        assert!(!TOKENS.iter().any(|t| t.starts_with("--")));
    }
}
