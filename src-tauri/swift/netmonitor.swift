// Task 11 (macOS): network-cost monitor via Network.framework.
// Tiny Swift helper compiled by build.rs (the pure-Rust block ABI segfaulted
// — measured; Swift owns the block here). The iOS port uses NWPathMonitor
// natively (see docs/plans/2026-11-14-ios-personal-port.md).
import Network
import Foundation

private var monitor: NWPathMonitor?
private var callback: (@convention(c) (Bool, Bool) -> Void)?

@_cdecl("ep_netmonitor_start")
public func ep_netmonitor_start(_ cb: @convention(c) (Bool, Bool) -> Void) {
    callback = cb
    let m = NWPathMonitor()
    m.pathUpdateHandler = { path in
        callback?(path.isExpensive, path.isConstrained)
    }
    m.start(queue: DispatchQueue.global(qos: .utility))
    monitor = m
}

@_cdecl("ep_netmonitor_stop")
public func ep_netmonitor_stop() {
    monitor?.cancel()
    monitor = nil
    callback = nil
}
