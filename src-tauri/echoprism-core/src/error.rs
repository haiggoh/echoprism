//! Error types for EchoPrism

use thiserror::Error;

#[derive(Error, Debug)]
pub enum CoreError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Instance error: {0}")]
    Instance(String),

    #[error("Extraction error: {0}")]
    Extraction(String),

    #[error("Matching error: {0}")]
    Matching(String),

    #[error("Configuration error: {0}")]
    Config(String),
}

// Result type alias removed to avoid conflicts with std::result::Result
// Use std::result::Result<T, CoreError> directly where needed, or std::result::Result<T, String> for Tauri commands