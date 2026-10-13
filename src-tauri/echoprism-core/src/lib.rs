//! EchoPrism Core - Core types and traits

pub mod types;
pub mod error;
pub mod config;

// Re-export all types from types module
pub use types::*;

// Re-export error types
pub use error::*;

// Re-export config types with explicit names to avoid conflicts
pub use config::{AppConfig, InstanceConfig, UserPreferences as ConfigUserPreferences};