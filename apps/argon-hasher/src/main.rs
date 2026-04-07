mod core;

use std::env;
use std::process::ExitCode;

fn usage() {
	eprintln!("Usage:");
	eprintln!("  cargo run -- hash <password>");
	eprintln!("  cargo run -- verify <password> <argon2_phc_hash>");
}

fn main() -> ExitCode {
	let mut args = env::args().skip(1);
	let Some(command) = args.next() else {
		usage();
		return ExitCode::from(2);
	};

	match command.as_str() {
		"hash" => {
			let Some(password) = args.next() else {
				usage();
				return ExitCode::from(2);
			};
			if args.next().is_some() {
				usage();
				return ExitCode::from(2);
			}
			match core::hash_password(&password) {
				Ok(hash) => {
					println!("{hash}");
					ExitCode::SUCCESS
				}
				Err(err) => {
					eprintln!("{err}");
					ExitCode::from(1)
				}
			}
		}
		"verify" => {
			let Some(password) = args.next() else {
				usage();
				return ExitCode::from(2);
			};
			let Some(hash) = args.next() else {
				usage();
				return ExitCode::from(2);
			};
			if args.next().is_some() {
				usage();
				return ExitCode::from(2);
			}
			match core::verify_password(&password, &hash) {
				Ok(valid) => {
					println!("{valid}");
					if valid {
						ExitCode::SUCCESS
					} else {
						ExitCode::from(1)
					}
				}
				Err(err) => {
					eprintln!("{err}");
					ExitCode::from(1)
				}
			}
		}
		_ => {
			usage();
			ExitCode::from(2)
		}
	}
}