fn main() {
    // Task 11 (macOS): compile the Swift NWPathMonitor helper into a dylib
    // BEFORE tauri_build (it validates bundle resources, which reference gen/).
    // The pure-Rust block ABI for nw_path_monitor_set_update_handler segfaulted
    // (measured), so the block lives in Swift; Rust calls ep_netmonitor_start.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let out_dir = std::env::var("OUT_DIR").unwrap();
        let gen_dir = std::path::Path::new("gen");
        std::fs::create_dir_all(gen_dir).ok();
        let dylib = format!("{out_dir}/libepnetmonitor.dylib");
        let mut cmd = std::process::Command::new("swiftc");
        cmd.args(["-emit-library", "-o", &dylib, "swift/netmonitor.swift"]);
        // cross-compiles only: swiftc defaults to the HOST arch, which is what
        // we want when TARGET == HOST (passing the bare host triple actually
        // fails: Swift needs a versioned deployment target). Pass -target only
        // when it differs from the host, mapped to a versioned macOS triple.
        if let (Ok(target), Ok(host)) = (std::env::var("TARGET"), std::env::var("HOST")) {
            if target != host {
                let versioned = match target.as_str() {
                    "aarch64-apple-darwin" | "arm64-apple-darwin" => "arm64-apple-macosx10.15",
                    "x86_64-apple-darwin" => "x86_64-apple-macosx10.15",
                    other => other,
                };
                cmd.arg("-target").arg(versioned);
            }
        }
        let status = cmd.status().expect("swiftc must run to build the netmonitor helper");
        assert!(status.success(), "swiftc failed on swift/netmonitor.swift");
        // stable path for the bundled app (tauri.conf.json resources)
        let bundled = gen_dir.join("libepnetmonitor.dylib");
        std::fs::copy(&dylib, &bundled).expect("copy dylib to gen/");
        // Task 3 (2026-11-16-followups-plan): NO link-time dependency anymore —
        // the released v0.1.20 .app linked the helper by an ABSOLUTE CI path
        // (/Users/runner/...) and dyld aborted (exit 134) on every Mac. The
        // binary now dlopens the dylib at RUNTIME from the bundle Resources
        // (libloading, network_cost.rs), so `otool -L <binary>` must show 0
        // netmon entries. The rpath/link lines are deliberately gone.
        println!("cargo:rerun-if-changed=swift/netmonitor.swift");
    }

    tauri_build::build();
}
