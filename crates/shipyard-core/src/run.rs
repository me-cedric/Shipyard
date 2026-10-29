//! Run states of the factory. W6 owns the transitions.

use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum RunState {
    Queued,
    Claimed,
    Planning,
    PlanReview,
    Working,
    SelfReview,
    PROpen,
    ChangesRequested,
    Merged,
    Done,
    WaitingForAnswer,
    Blocked,
    RetryQueued,
    Paused,
    Failed,
    Cancelled,
}

impl RunState {
    /// Main path first, then side states.
    pub const ALL: [RunState; 16] = [
        Self::Queued,
        Self::Claimed,
        Self::Planning,
        Self::PlanReview,
        Self::Working,
        Self::SelfReview,
        Self::PROpen,
        Self::ChangesRequested,
        Self::Merged,
        Self::Done,
        Self::WaitingForAnswer,
        Self::Blocked,
        Self::RetryQueued,
        Self::Paused,
        Self::Failed,
        Self::Cancelled,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "Queued",
            Self::Claimed => "Claimed",
            Self::Planning => "Planning",
            Self::PlanReview => "PlanReview",
            Self::Working => "Working",
            Self::SelfReview => "SelfReview",
            Self::PROpen => "PROpen",
            Self::ChangesRequested => "ChangesRequested",
            Self::Merged => "Merged",
            Self::Done => "Done",
            Self::WaitingForAnswer => "WaitingForAnswer",
            Self::Blocked => "Blocked",
            Self::RetryQueued => "RetryQueued",
            Self::Paused => "Paused",
            Self::Failed => "Failed",
            Self::Cancelled => "Cancelled",
        }
    }
}

impl FromStr for RunState {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, ()> {
        Self::ALL.into_iter().find(|v| v.as_str() == s).ok_or(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sixteen_states_round_trip() {
        assert_eq!(RunState::ALL.len(), 16);
        for s in RunState::ALL {
            assert_eq!(s.as_str().parse(), Ok(s));
        }
        assert!("queued".parse::<RunState>().is_err());
    }
}
