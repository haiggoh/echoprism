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
        let status = std::process::Command::new("swiftc")
            .args([
                "-emit-library",
                "-o",
                &dylib,
                "swift/netmonitor.swift",
            ])
            .status()
            .expect("swiftc must run to build the netmonitor helper");
        assert!(status.success(), "swiftc failed on swift/netmonitor.swift");
        // stable path for the bundled app (tauri.conf.json resources) + rpath
        let bundled = gen_dir.join("libepnetmonitor.dylib");
        std::fs::copy(&dylib, &bundled).expect("copy dylib to gen/");
        println!("cargo:rustc-link-search=native={out_dir}");
        println!("cargo:rustc-link-lib=dylib=epnetmonitor");
        println!("cargo:rustc-link-arg=-Wl,-rpath,{out_dir}");
        println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Resources");
        println!("cargo:rerun-if-changed=swift/netmonitor.swift");
    }

    tauri_build::build();
}
