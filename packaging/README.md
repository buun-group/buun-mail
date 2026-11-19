# Packaging

How Buun Mail reaches each operating system. The release workflow (`.github/workflows/release.yml`) builds every
installer on a version tag; this folder holds what the workflow does not.

## Contents

| Path | Purpose |
|---|---|
| `arch/PKGBUILD` | Builds and installs from source on Arch Linux and its derivatives (`makepkg -si`) |
| `linux/buun-mail.desktop` | The desktop entry the PKGBUILD installs; Tauri's own bundles write theirs |

## Which file to pick

| System | File |
|---|---|
| Debian, Ubuntu, Mint, Pop!_OS | `.deb` |
| Fedora, RHEL, openSUSE | `.rpm` |
| Arch, Manjaro, EndeavourOS | `.AppImage`, or `makepkg -si` with `arch/PKGBUILD` |
| Any other Linux | `.AppImage` |
| macOS, Apple silicon or Intel | `.dmg` for that chip |
| Windows | `.msi`, or the setup `.exe` |

Local builds: `pnpm build` makes this machine's installers into `target/release/bundle/`.
