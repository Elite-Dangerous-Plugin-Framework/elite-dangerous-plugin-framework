use std::io::{self, Read};
use std::{env, fs::File, io::Write, path::PathBuf};

use sha2::{digest, Digest};
const EMBEDDED_BUN_VERSION: &str = "1.2.20";

fn main() {
    tauri_build::build()
}
