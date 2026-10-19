//! Logging setup. The crate logs through `tracing`, but a subscriber is only
//! installed here — without one, every log line in the app is silently
//! discarded (which is also why the dead background tasks went unnoticed for
//! months).

/// Installs the global tracing subscriber. Idempotent via try_init: the first
/// caller wins, later calls are no-ops. Respects RUST_LOG when set; defaults
/// to info.
pub(crate) fn init_tracing() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .try_init();
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression for the never-initialised subscriber (found 2026-10-19):
    /// tracing-subscriber was a declared dependency but nothing ever installed
    /// one, so every `tracing::info!/warn!/error!` in the app was a compiled
    /// no-op. The contract: init_tracing() leaves a real global dispatcher in
    /// place — not tracing's `NoSubscriber` default. Safe as a mutation check
    /// because nothing else in the crate installs a subscriber.
    #[test]
    fn init_tracing_installs_a_global_subscriber() {
        init_tracing();
        let installed = tracing::dispatcher::get_default(|d| {
            !d.is::<tracing::subscriber::NoSubscriber>()
        });
        assert!(
            installed,
            "no global tracing subscriber after init_tracing()"
        );
    }
}
