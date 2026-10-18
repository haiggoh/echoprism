// EchoPrism desktop entry. All application logic — plugin registration,
// state setup, and the invoke handler — lives in the library crate
// (`src/lib.rs`, `pub fn run()`); this shim exists so the package has a bin
// target for `cargo run` and `tauri dev`.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    echoprism::run();
}
