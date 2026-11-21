# Phone apps

Buun Mail runs on Android and iOS from the same code as the desktop: the Rust mail engine and the React UI, built by
Tauri for each phone. The app id is `com.buungroup.mail` on both. The Android project is committed under
`apps/desktop/src-tauri/gen/android`; the iOS project is made fresh on a Mac by `tauri ios init`.

Phones update through their stores, not the in-app updater. Betas go to Google Play testing and TestFlight, stable
releases to Play open testing (or production) and TestFlight, and every release that built Android also carries a
signed APK.

## Build on your machine

### Android

You need JDK 17, the Android SDK with NDK `27.0.12077973`, and the Rust Android targets:

```bash
sdkmanager "platform-tools" "ndk;27.0.12077973"
export ANDROID_HOME="$HOME/Android/Sdk"          # where the SDK is
export NDK_HOME="$ANDROID_HOME/ndk/27.0.12077973"
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
pnpm install
pnpm dev:android                                 # on a phone or emulator, UI hot-reloading
pnpm build:android --aab --apk                   # release .aab and universal .apk
```

The release build is unsigned unless a key is there. To sign it, put the upload keystore next to the Android project
and describe it in `apps/desktop/src-tauri/gen/android/keystore.properties` (gitignored, like every `.jks`):

```properties
storeFile=upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

`storeFile` is relative to `gen/android`, or absolute. The same four values can come from the environment instead:
`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. That is how CI
signs.

The outputs land in `gen/android/app/build/outputs/bundle/universalRelease/` and
`gen/android/app/build/outputs/apk/universal/release/`.

To stamp a version, pass it as Tauri config, the way CI does:

```bash
pnpm build:android --aab --apk --config "$(node tools/mobile-version.mjs android v0.6.0-beta.2)"
```

To publish a bundle from your machine, with the Play key at `~/.config/buun-mail/play-service-account.json` or named
by `PLAY_SERVICE_ACCOUNT_JSON`:

```bash
node tools/play-ship.mjs --aab <file>.aab --track internal --name 0.6.0-beta.2 --dry-run   # checks access only
node tools/play-ship.mjs --aab <file>.aab --track internal --name 0.6.0-beta.2 --notes "What changed"
node tools/play-ship.mjs --promote-from internal --track alpha                            # no upload
```

### iOS

iOS builds need a Mac with Xcode 26 or later and the Rust iOS targets:

```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
pnpm install
cd apps/desktop
pnpm exec tauri ios init                                          # makes src-tauri/gen/apple
pnpm exec tauri icon ../../packages/brand/assets/mobile-icon-1024.png
cd ../..
pnpm dev:ios                                                      # in the simulator or on a phone
pnpm build:ios --export-method app-store-connect                  # a signed .ipa, with your team set up in Xcode
```

The icon step rewrites the desktop and Android icons too. Throw those changes away with `git restore` unless you meant
them; CI runs it on a throwaway checkout.

## The pipeline

| Workflow | When | What |
|---|---|---|
| `beta.yml` | Every beta on `dev` | After the desktop pre-release is out: Android to Play internal testing, then the same release to closed testing (`alpha`), and iOS to TestFlight |
| `release.yml` | Every stable release on `main` | After the release is out: Android to `PRODUCTION_APP_TRACK` (open testing, `beta`, by default) and iOS to TestFlight |
| `mobile-android.yml` | Called by both, or by hand | Builds the signed `.aab` and `.apk` for a tag, attaches `Buun.Mail_<version>_android.apk` to that release, publishes the `.aab` to a Play track |
| `mobile-play-promote.yml` | Called by `beta.yml`, or by hand | Moves the newest release on one Play track to another, with no build |
| `mobile-ios.yml` | Called by both, or by hand | Checks the Apple credentials, builds on a hosted Mac (`macos-26`), uploads to App Store Connect for TestFlight |

To run one by hand: Actions, the workflow, Run workflow, with an existing release tag such as `v0.6.0-beta.2`.

### Versions

- **Android.** The version name is the tag's version as it is (`0.6.0-beta.2`). The version code is the minutes since
  2020-01-01 UTC, so it rises with every build and Play never refuses it as used.
- **iOS.** App Store Connect takes only `X.Y.Z`, so a beta `0.6.0-beta.2` ships as `0.6.0`. The build number is the
  same minute clock, plus `IOS_BUILD_OFFSET` when set, so betas and the stable release of one version never collide.

`tools/mobile-version.mjs` works both out and prints the Tauri config the build merges in.

### When a release skips a phone app

A phone build is slow and sends every tester an update, so a release builds a phone app only when something it is
built from changed since the last one that shipped. `tools/mobile-impact.mjs` compares with a tag per platform and
channel: `android-beta`, `ios-beta`, `android-stable`, `ios-stable`. A successful store publish moves that tag; a
skipped or failed one leaves it, and the changes keep counting.

What counts: `apps/desktop/ui`, `apps/desktop/src-tauri` (its `gen/android` for Android only), `crates`,
`packages/brand`, `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`, `package.json`, `pnpm-lock.yaml` and
`pnpm-workspace.yaml`. Tests, Markdown, pipelines, tools and the desktop-only Tauri config do not. Any doubt builds:
no tag yet, a diff that fails, a check that fails.

To make the next release build a phone app again, delete its tag, for example
`git push origin :refs/tags/android-beta`.

Without its secrets a phone app is skipped with a notice on the run, so the desktop releases go on as before. A hand
run of a phone workflow fails instead, naming what is missing.

## Secrets

Settings, Secrets and variables, Actions, Secrets. Repository secrets; nothing here is per environment.

| Secret | Used by | Where it comes from |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | `mobile-android.yml` | The upload keystore (below), `base64 -w0 upload.jks` (on a Mac `base64 -i upload.jks`) |
| `ANDROID_KEYSTORE_PASSWORD` | `mobile-android.yml` | The store password you gave `keytool` |
| `ANDROID_KEY_ALIAS` | `mobile-android.yml` | The alias you gave `keytool`, such as `upload` |
| `ANDROID_KEY_PASSWORD` | `mobile-android.yml` | The key password you gave `keytool` (the store password, unless you set another) |
| `PLAY_SERVICE_ACCOUNT_JSON` | `mobile-android.yml`, `mobile-play-promote.yml` | The service account's JSON key from Google Cloud (below), pasted whole, not base64 |
| `APPLE_TEAM_ID` | `mobile-ios.yml` | developer.apple.com, Account, Membership details, Team ID (10 characters). Already set if macOS signing is |
| `APP_STORE_CONNECT_KEY_ID` | `mobile-ios.yml` | App Store Connect, Users and Access, Integrations, App Store Connect API, Team Keys: the Key ID column |
| `APP_STORE_CONNECT_ISSUER_ID` | `mobile-ios.yml` | The same page: Issuer ID, above the table |
| `APP_STORE_CONNECT_API_KEY_BASE64` | `mobile-ios.yml` | The `AuthKey_<KEYID>.p8` you download once when making the key, `base64 -i AuthKey_<KEYID>.p8` |
| `IOS_DISTRIBUTION_CERT_P12_BASE64` | `mobile-ios.yml`, optional | An Apple Distribution certificate with its private key, exported as `.p12`, base64. Setting it switches to stored-certificate signing |
| `IOS_DISTRIBUTION_CERT_PASSWORD` | `mobile-ios.yml`, with the above | The password you exported the `.p12` with |
| `IOS_APP_PROFILE_BASE64` | `mobile-ios.yml`, with the above | The App Store provisioning profile for `com.buungroup.mail`, `base64 -i <file>.mobileprovision` |

## Variables

Settings, Secrets and variables, Actions, Variables. All optional.

| Variable | Default | Effect |
|---|---|---|
| `SHIP_ANDROID` | on | `false`: releases never build or publish the Android app |
| `SHIP_IOS` | on | `false`: releases never build or upload the iOS app |
| `SHIP_BETA_CLOSED` | on | `false`: betas stop at Play internal testing and are not promoted to closed testing. Set it until the Play app's setup is finished (below) |
| `PRODUCTION_APP_TRACK` | `beta` | The Play track for stable releases: `beta` (open testing), `alpha` (closed), `internal` or `production` |
| `PLAY_HOLD_FOR_REVIEW` | off | `true`: save closed, open and production releases without sending them to Google's review. Play may refuse to hold an app it reviews automatically; the release is then sent normally, with a line in the log |
| `PLAY_NOTES_LANGUAGE` | `en-US` | The language of the release notes on Play. It must be one of the store listing's languages |
| `IOS_BUILD_OFFSET` | 0 | Added to the iOS build number, if builds were ever uploaded with higher numbers some other way |

## Google Play, once

1. **The app.** In [Play Console](https://play.google.com/console), Create app: name Buun Mail, default language
   English (United States), App, Free. Play App Signing is on by default: Google keeps the key users' phones see, and
   you sign uploads with an upload key.
2. **The upload key.** Make it once and keep a copy somewhere safe (a password manager); a lost upload key can be
   reset through Play support, but it takes days.

   ```bash
   keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000 \
     -dname "CN=Buun Group, O=Buun Group, C=AU"
   base64 -w0 upload.jks     # ANDROID_KEYSTORE_BASE64
   ```

   Set the four `ANDROID_*` secrets from it.
3. **The first bundle, by hand.** Play only accepts API uploads once the app has a bundle. Run Mobile Android by hand
   for the newest beta tag before `PLAY_SERVICE_ACCOUNT_JSON` exists: it builds, attaches the APK and keeps the
   `.aab` as the run's `buun-mail-aab` artifact. In Play Console, Testing, Internal testing, Create new release,
   upload that `.aab`, and roll it out. Add yourself to the internal testers list on the same page.
4. **The service account.** In [Google Cloud console](https://console.cloud.google.com), pick or make a project and
   enable the Google Play Android Developer API. IAM and admin, Service accounts, Create service account (no roles
   needed there). On the account, Keys, Add key, Create new key, JSON: that file is `PLAY_SERVICE_ACCOUNT_JSON`.
5. **Its rights on Play.** Play Console, Users and permissions, Invite new users, the service account's email. Under
   App permissions add Buun Mail with Release to testing tracks, Release apps to production, and View app
   information. A new permission can take a few minutes, sometimes a day, to apply.
6. **Closed and open testing.** Finish the Dashboard's set-up tasks (privacy policy, app access, ads, content rating,
   target audience, data safety, store listing). Until then Play only takes draft releases ("draft app" in the log),
   so keep `SHIP_BETA_CLOSED` at `false`. Make the closed testing track's testers list, then do its first release by
   hand (promote the internal one in Play Console) and set `SHIP_BETA_CLOSED` back.
7. **Production.** A new personal developer account must run a closed test with 12 testers for 14 days before Play
   grants production access; an organisation account does not. Once production is open, set `PRODUCTION_APP_TRACK`
   to `production` if stable releases should go straight there.

The APK on each GitHub release is signed with the upload key, not Play's app signing key, so a phone that installed
it cannot update to the Play build in place (or the other way round) without uninstalling first.

## App Store Connect, once

1. **The team.** A paid Apple Developer Program membership for Buun Group. `APPLE_TEAM_ID` is on
   developer.apple.com, Account, Membership details.
2. **The App ID.** developer.apple.com, Certificates, Identifiers and Profiles, Identifiers, +, App IDs, App:
   Explicit, bundle ID `com.buungroup.mail`. The app needs no extra capabilities.
3. **The app record.** [App Store Connect](https://appstoreconnect.apple.com), Apps, +, New App: iOS, name Buun Mail,
   bundle ID `com.buungroup.mail`, any SKU such as `buun-mail`. The upload has nowhere to go without it.
4. **The API key.** App Store Connect, Users and Access, Integrations, App Store Connect API, Team Keys, +. Role
   Admin, which automatic signing needs to create the certificate and profile. Note the Key ID and the Issuer ID and
   download the `.p8` (Apple offers it once). Set the three `APP_STORE_CONNECT_*` secrets.
5. **Signing, one of two ways.**
   - Automatic (the default): register one iPhone or iPad under Devices with its UDID. Apple will not make the
     development profile Xcode signs with first while the device list is empty. Nothing else to set.
   - Stored certificate: Certificates, +, Apple Distribution, from a signing request made in Keychain Access (or
     `openssl req -new -newkey rsa:2048 -nodes -keyout dist.key -out dist.csr`). Export the certificate with its key
     as `.p12` with a password. Then Profiles, +, Distribution, App Store Connect, `com.buungroup.mail`, that
     certificate, and download the `.mobileprovision`. Set the three `IOS_*` secrets. Regenerate the profile before
     it expires; the check warns 30 days ahead.
6. **TestFlight.** Builds appear under TestFlight once Apple has processed them. Internal testers (people on the App
   Store Connect team) get them at once; an external group needs one Beta App Review first. Each build asks the export
   compliance question until it is answered; Buun Mail uses only the encryption the system provides (TLS), which is
   exempt. Once you have confirmed that answer, an `apps/desktop/src-tauri/Info.ios.plist` with
   `ITSAppUsesNonExemptEncryption` set to false (Tauri merges that file into the app's `Info.plist`) stops the
   question for every later build.

`mobile-ios.yml` starts with `tools/apple-preflight.mjs`, a read-only check that the key works, the App ID and the app
record exist, and the chosen signing has what it needs. Lines marked FIX in its output say what to do; nothing has
been built at that point, so a fix costs seconds, not a Mac run.
