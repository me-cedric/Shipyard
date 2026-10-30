//! National public holidays, computed for a year (spec `work`, REQ-016). No I/O, no file: the plan
//! adds them to the holidays that the team wrote. Regional days are left out.

use crate::work::{iso, parse_day};

/// The countries that have rules here, by ISO 3166 code. France is the default.
pub const COUNTRIES: [&str; 10] = ["FR", "BE", "LU", "CH", "DE", "NL", "ES", "IT", "GB", "US"];

fn day(y: i32, m: u32, d: u32) -> i32 {
    parse_day(&format!("{y:04}-{m:02}-{d:02}")).unwrap_or(0)
}

/// 0 is Monday.
fn weekday(day: i32) -> i32 {
    (day + 3).rem_euclid(7)
}

/// Easter Sunday (anonymous Gregorian algorithm).
fn easter(y: i32) -> i32 {
    let a = y % 19;
    let b = y / 100;
    let c = y % 100;
    let d = b / 4;
    let e = b % 4;
    let f = (b + 8) / 25;
    let g = (b - f + 1) / 3;
    let h = (19 * a + b - d - g + 15) % 30;
    let i = c / 4;
    let k = c % 4;
    let l = (32 + 2 * e + 2 * i - h - k) % 7;
    let m = (a + 11 * h + 22 * l) / 451;
    let month = (h + l - 7 * m + 114) / 31;
    let date = (h + l - 7 * m + 114) % 31 + 1;
    day(y, month as u32, date as u32)
}

/// The `n`th weekday `wd` (0 is Monday) of a month. A negative `n` counts from the end.
fn nth(y: i32, m: u32, wd: i32, n: i32) -> i32 {
    if n > 0 {
        let first = day(y, m, 1);
        first + (wd - weekday(first)).rem_euclid(7) + 7 * (n - 1)
    } else {
        let (ny, nm) = if m == 12 { (y + 1, 1) } else { (y, m + 1) };
        let last = day(ny, nm, 1) - 1;
        last - (weekday(last) - wd).rem_euclid(7) + 7 * (n + 1)
    }
}

/// A fixed day that falls on a weekend is kept on the Friday before or the Monday after (US rule).
fn observed(d: i32) -> i32 {
    match weekday(d) {
        5 => d - 1,
        6 => d + 1,
        _ => d,
    }
}

/// The public holidays of `country` in `year`, as sorted `YYYY-MM-DD`. Empty for a country that
/// has no rules here.
pub fn public(country: &str, year: i32) -> Vec<String> {
    let y = year;
    let e = easter(y);
    let f = |m, d| day(y, m, d);
    let mut days: Vec<i32> = match country {
        "FR" => vec![
            f(1, 1),
            e + 1,
            f(5, 1),
            f(5, 8),
            e + 39,
            e + 50,
            f(7, 14),
            f(8, 15),
            f(11, 1),
            f(11, 11),
            f(12, 25),
        ],
        "BE" => vec![
            f(1, 1),
            e + 1,
            f(5, 1),
            e + 39,
            e + 50,
            f(7, 21),
            f(8, 15),
            f(11, 1),
            f(11, 11),
            f(12, 25),
        ],
        "LU" => vec![
            f(1, 1),
            e + 1,
            f(5, 1),
            f(5, 9),
            e + 39,
            e + 50,
            f(6, 23),
            f(8, 15),
            f(11, 1),
            f(12, 25),
            f(12, 26),
        ],
        "CH" => vec![
            f(1, 1),
            e - 2,
            e + 1,
            e + 39,
            e + 50,
            f(8, 1),
            f(12, 25),
            f(12, 26),
        ],
        "DE" => vec![
            f(1, 1),
            e - 2,
            e + 1,
            f(5, 1),
            e + 39,
            e + 50,
            f(10, 3),
            f(12, 25),
            f(12, 26),
        ],
        "NL" => {
            let kings = f(4, 27);
            vec![
                f(1, 1),
                e + 1,
                if weekday(kings) == 6 {
                    kings - 1
                } else {
                    kings
                },
                e + 39,
                e + 50,
                f(12, 25),
                f(12, 26),
            ]
        }
        "ES" => vec![
            f(1, 1),
            f(1, 6),
            e - 2,
            f(5, 1),
            f(8, 15),
            f(10, 12),
            f(11, 1),
            f(12, 6),
            f(12, 8),
            f(12, 25),
        ],
        "IT" => vec![
            f(1, 1),
            f(1, 6),
            e + 1,
            f(4, 25),
            f(5, 1),
            f(6, 2),
            f(8, 15),
            f(11, 1),
            f(12, 8),
            f(12, 25),
            f(12, 26),
        ],
        "GB" => {
            // England and Wales. A day on a weekend moves to the next free working day.
            let new_year = match weekday(f(1, 1)) {
                5 => f(1, 3),
                6 => f(1, 2),
                _ => f(1, 1),
            };
            let christmas = match weekday(f(12, 25)) {
                4 => [f(12, 25), f(12, 28)],
                5 => [f(12, 27), f(12, 28)],
                6 => [f(12, 26), f(12, 27)],
                _ => [f(12, 25), f(12, 26)],
            };
            let mut v = vec![
                new_year,
                e - 2,
                e + 1,
                nth(y, 5, 0, 1),
                nth(y, 5, 0, -1),
                nth(y, 8, 0, -1),
            ];
            v.extend(christmas);
            v
        }
        "US" => vec![
            observed(f(1, 1)),
            nth(y, 1, 0, 3),
            nth(y, 2, 0, 3),
            nth(y, 5, 0, -1),
            observed(f(6, 19)),
            observed(f(7, 4)),
            nth(y, 9, 0, 1),
            nth(y, 10, 0, 2),
            observed(f(11, 11)),
            nth(y, 11, 3, 4),
            observed(f(12, 25)),
        ],
        _ => Vec::new(),
    };
    days.sort_unstable();
    days.dedup();
    days.into_iter().map(iso).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn france_2026_has_its_eleven_days() {
        assert_eq!(
            public("FR", 2026),
            [
                "2026-01-01",
                "2026-04-06",
                "2026-05-01",
                "2026-05-08",
                "2026-05-14",
                "2026-05-25",
                "2026-07-14",
                "2026-08-15",
                "2026-11-01",
                "2026-11-11",
                "2026-12-25",
            ]
        );
    }

    #[test]
    fn easter_moves_and_weekend_rules_apply() {
        assert_eq!(iso(easter(2024)), "2024-03-31");
        assert_eq!(iso(easter(2025)), "2025-04-20");
        // GB 2021: Christmas on a Saturday, so the 27th and 28th are off.
        let gb = public("GB", 2021);
        assert!(gb.contains(&"2021-12-27".into()) && gb.contains(&"2021-12-28".into()));
        assert!(gb.contains(&"2021-05-03".into()) && gb.contains(&"2021-05-31".into()));
        // US 2026: Independence Day on a Saturday is kept on Friday 3 July. Thanksgiving is 26 November.
        let us = public("US", 2026);
        assert!(us.contains(&"2026-07-03".into()) && us.contains(&"2026-11-26".into()));
        assert!(public("XX", 2026).is_empty());
        for c in COUNTRIES {
            assert!(public(c, 2027).len() >= 7, "{c}");
        }
    }
}
