//! macOS network cost via Network.framework's NWPathMonitor (Task 11).
//!
//! The update handler is an Objective-C block; hand-rolling the block ABI in
//! Rust segfaulted (measured), so the block lives in a tiny Swift helper
//! compiled by build.rs (swift/netmonitor.swift) and Rust calls the C entry
//! point `ep_netmonitor_start`. The handler reports (isExpensive,
//! isConstrained) to a channel; lib.rs re-emits it to the frontend as
//! `network-cost-changed`. macOS only; the iOS port uses NWPathMonitor
//! natively in Swift (see the iOS port plan).
#![cfg(target_os = "macos")]

extern "C" {
    fn ep_netmonitor_start(cb: extern "C" fn(bool, bool));
    fn ep_netmonitor_stop();
}

static mut TX: Option<tokio::sync::mpsc::UnboundedSender<(bool, bool)>> = None;

extern "C" fn ep_netmonitor_cb(expensive: bool, constrained: bool) {
    unsafe {
        let tx = &raw const TX;
        if let Some(tx) = &*tx {
            let _ = tx.send((expensive, constrained));
        }
    }
}

/// Start the path monitor; every path update is sent on `tx` as
/// (isExpensive, isConstrained).
pub fn start_monitor(tx: tokio::sync::mpsc::UnboundedSender<(bool, bool)>) {
    unsafe {
        TX = Some(tx);
        ep_netmonitor_start(ep_netmonitor_cb);
    }
}

/// Stop the monitor (tests / teardown).
#[allow(dead_code)]
pub fn stop_monitor() {
    unsafe { ep_netmonitor_stop() }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The ABI proof: the monitor's handler must fire with the CURRENT path
    /// within a few seconds on a networked machine (Swift control fired
    /// immediately, so a timeout here means the binding broke).
    #[tokio::test]
    async fn monitor_handler_fires_with_current_path() {
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<(bool, bool)>();
        start_monitor(tx);
        let got = tokio::time::timeout(std::time::Duration::from_secs(8), rx.recv())
            .await
            .expect("NWPathMonitor handler must fire within 8 s")
            .expect("channel alive");
        let _ = got;
    }
}
