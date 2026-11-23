# Pikva mobile app

Flutter app for parents, gate staff and school admins. It talks straight to the
Pikva backend (`/api/v1`) with a Bearer token.

- Android and iOS, app id `com.costechhq.pikva`
- Source layout: `lib/core` (api, router, theme), `lib/features/<feature>`
  (`domain`, `data`, `presentation`), `lib/shared` (widgets used by several
  features)

## Run it while developing

Start the backend, then from this folder:

```
flutter run
```

By default the app calls `http://10.0.2.2:8000/api/v1`, which is how the
**Android emulator** reaches your computer. For a real phone on the same Wi-Fi,
or the iOS simulator, give the address yourself:

```
flutter run --dart-define=API_BASE_URL=http://192.168.1.20:8000/api/v1
```

Plain `http` works in debug builds only. Release builds are https only.

## Checks

```
flutter analyze
flutter test
```

## Build a release for Android

Release builds need three things: your own signing key, an https server
address, and a version number.

### 1. Make your signing key (once)

Run this in a terminal (it asks for a password and some details). Keep the
`.jks` file and both passwords somewhere safe and backed up: **if you lose the
key you cannot publish updates under the same signing identity** (Google Play
App Signing can recover an upload key, but plan as if it can't). Never commit
them.

```
keytool -genkey -v -keystore C:/Users/YOU/pikva-upload-keystore.jks -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

Then copy `android/key.properties.example` to `android/key.properties` and fill
in the passwords and the path. `key.properties` and `*.jks` are already ignored
by git.

If `android/key.properties` is missing, a release build still works for local
testing but is signed with the debug key and **Google Play will reject it**
(the build prints a warning).

### 2. Set the version

In `pubspec.yaml`: `version: 1.0.0+1`. The part before `+` is the version
people see. The number after `+` must go up with every upload to the store
(`1.0.0+2`, `1.0.1+3`, ...).

### 3. Build

The server address is required and must be https:

```
flutter build appbundle --release --dart-define=API_BASE_URL=https://YOUR-SERVER/api/v1
```

Upload `build/app/outputs/bundle/release/app-release.aab` to the Play Console.

To try the release build on a phone first, make an APK instead:

```
flutter build apk --release --dart-define=API_BASE_URL=https://YOUR-SERVER/api/v1
```

A release build made without a usable https address shows a "wrong server
address" screen instead of failing silently.

## Icons and splash screen

Settings are in `flutter_launcher_icons.yaml` and `flutter_native_splash.yaml`;
the images are in `assets/icon/`. After changing them:

```
dart run flutter_launcher_icons
dart run flutter_native_splash:create
```

Check `git diff ios/Runner.xcodeproj/project.pbxproj` afterwards: the icon tool
once changed a build setting there to an invalid value.
