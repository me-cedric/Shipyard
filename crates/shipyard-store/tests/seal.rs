//! Seal tests (spec `work`, REQ-005, REQ-014): seal, wrong passphrase, locked, day rate.

use shipyard_store::seal::{self, PREFIX, SealError, Sealer};

#[test]
fn a_sealed_text_is_unreadable_and_opens_with_the_passphrase() {
    let sealed = seal::seal("correct horse", "rate: 640").unwrap();
    assert!(seal::is_sealed(&sealed));
    assert!(sealed.starts_with(PREFIX));
    assert!(!sealed.contains("rate"));
    assert!(!sealed.contains('\n'), "one line");
    assert_eq!(
        seal::open(Some("correct horse"), &sealed).unwrap(),
        "rate: 640"
    );
}

#[test]
fn a_wrong_passphrase_is_refused_and_named() {
    let sealed = seal::seal("right", "secret").unwrap();
    assert_eq!(
        seal::open(Some("wrong"), &sealed),
        Err(SealError::WrongPassphrase)
    );
}

#[test]
fn a_sealed_text_with_no_passphrase_is_locked() {
    let sealed = seal::seal("right", "secret").unwrap();
    assert_eq!(seal::open(None, &sealed), Err(SealError::Locked));
}

#[test]
fn a_plain_text_passes_through_with_or_without_a_passphrase() {
    assert_eq!(seal::open(None, "name: x").unwrap(), "name: x");
    assert_eq!(seal::open(Some("p"), "name: x").unwrap(), "name: x");
}

#[test]
fn an_empty_passphrase_is_refused() {
    assert_eq!(seal::seal("  ", "x"), Err(SealError::EmptyPassphrase));
}

#[test]
fn the_same_text_sealed_twice_gives_two_texts() {
    let mut s = Sealer::new("p").unwrap();
    let a = s.seal("same").unwrap();
    let b = s.seal("same").unwrap();
    assert_ne!(a, b);
    assert_eq!(s.open(&a).unwrap(), "same");
    assert_eq!(s.open(&b).unwrap(), "same");
}

#[test]
fn a_changed_or_cut_text_is_damaged_or_refused() {
    let sealed = seal::seal("p", "secret").unwrap();
    let cut = &sealed[..sealed.len() - 8];
    assert!(seal::open(Some("p"), cut).is_err());
    let (head, tail) = sealed.split_at(sealed.len() - 6);
    let flipped = format!(
        "{head}{}",
        if tail.starts_with('A') { "B" } else { "A" }.to_string() + &tail[1..]
    );
    assert!(seal::open(Some("p"), &flipped).is_err());
    assert_eq!(
        seal::open(Some("p"), &format!("{PREFIX}x")),
        Err(SealError::Damaged)
    );
}

#[test]
fn a_day_rate_seals_as_a_number_and_a_sealer_opens_many_with_one_key() {
    let mut s = Sealer::new("project").unwrap();
    let rates: Vec<String> = [987_654.25_f64, 612_345.5]
        .iter()
        .map(|r| s.seal(&r.to_string()).unwrap())
        .collect();
    assert!(
        rates
            .iter()
            .all(|r| seal::is_sealed(r) && !r.contains("987654"))
    );
    let back: Vec<f64> = rates
        .iter()
        .map(|r| s.open(r).unwrap().parse().unwrap())
        .collect();
    assert_eq!(back, [987_654.25, 612_345.5]);
}
