# Wardrobe iOS: one-time setup (manual steps)

Everything here is done once, by hand, by the account holder. CI does the
rest: every push to `main` that touches `ios/` archives a signed build and
uploads it to TestFlight, where it reaches your iPhone and iPad automatically.

Commands are for fish (your terminal). Do the sections in order; 1–4 can be
done while the app is being built, 5 needs the homestacks PR merged.

## 0. What you end up with

| Where | Name | Kind | Value |
|-------|------|------|-------|
| GitHub `gpdl49/wardrobe` → Settings → Secrets and variables → Actions → **Secrets** | `ASC_KEY_ID` | secret | App Store Connect API key ID (10 chars) |
| same | `ASC_ISSUER_ID` | secret | Issuer ID (UUID) |
| same | `ASC_KEY_P8` | secret | Full text of `AuthKey_<KEYID>.p8`, including the `-----BEGIN PRIVATE KEY-----` lines |
| same → **Variables** | `IOS_OIDC_CLIENT_ID` | variable | Client ID of the Zitadel app `wardrobe-ios` (not secret) |
| Apple Developer | App ID `xyz.vidur.wardrobe` | identifier | Associated Domains capability on |
| App Store Connect | App "Wardrobe" record | app | bundle `xyz.vidur.wardrobe` |
| App Store Connect → TestFlight | Internal group `Owner` | group | you as tester, automatic distribution on |

No certificates or provisioning profiles are created or stored by hand: CI
uses **cloud signing** (Xcode `-allowProvisioningUpdates` authenticated with
the API key creates and uses a cloud-managed Apple Distribution certificate
and an App Store provisioning profile). That is why the key needs the
**Admin** role.

Team: `2J2LYH5QBS` (Individual, Vidur Butalia), already in `ios/project.yml`.

## 1. Register the App ID

1. <https://developer.apple.com/account/resources/identifiers/list> → **+** →
   **App IDs** → **App** → Continue.
2. Description `Wardrobe`; Bundle ID **Explicit** `xyz.vidur.wardrobe`.
3. Capabilities: tick **Associated Domains**. Leave the rest off (no push, no
   iCloud). Continue → Register.

(Cloud signing would also create it, but the App Store Connect record in
step 2 needs the bundle ID to exist first, and the capability must be on for
universal links.)

## 2. Create the app record in App Store Connect

1. <https://appstoreconnect.apple.com/apps> → **+** → **New App**.
2. Platforms **iOS**. Name: App Store names are unique across the store and
   `Wardrobe` is almost certainly taken, so use e.g. **Wardrobe Centerpoint**
   (only shown in App Store Connect/TestFlight; the home-screen name stays
   "Wardrobe" from `CFBundleDisplayName`).
3. Primary language English (U.K.) or (U.S.); Bundle ID
   `xyz.vidur.wardrobe`; SKU `wardrobe-ios`; User Access **Full Access** →
   Create.
4. You never submit it for review. Nothing in "App Information"/"Pricing" is
   needed for internal TestFlight. If App Store Connect asks you to accept an
   updated agreement (Business → Agreements), accept the free-apps one.

## 3. Create the App Store Connect API key

1. <https://appstoreconnect.apple.com/access/integrations/api> → **Team
   Keys**. If the tab says you must request access, click **Request Access**
   (account holder only), accept, and reload.
2. **Generate API Key** (or **+**): name `wardrobe-ci`, access **Admin** →
   Generate. (Admin is required for cloud-managed signing certificates; App
   Manager can upload builds but cannot create them.)
3. Note the **Key ID** and the **Issuer ID** shown above the table.
4. **Download API Key** → `AuthKey_<KEYID>.p8`. It downloads once only.

## 4. Store the key in GitHub

```fish
cd ~/src/github.com/gpdl49/wardrobe
gh secret set ASC_KEY_ID --body 'XXXXXXXXXX'
gh secret set ASC_ISSUER_ID --body 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
gh secret set ASC_KEY_P8 < ~/Downloads/AuthKey_XXXXXXXXXX.p8
gh secret list
```

Then move the `.p8` into 1Password (as a document) and delete it from
Downloads: `rm ~/Downloads/AuthKey_*.p8`.

## 5. Zitadel client ID → GitHub variable (after the homestacks PR merges)

The homestacks PR adds the native Zitadel app `wardrobe-ios` (Crossplane,
`clusters/sinkhole/crossplane-system/zitadel-apps/51-oidc-wardrobe-ios.yaml`)
and switches oauth2-proxy to accept its ID tokens. Once Flux has applied it
(a few minutes after merge), read the generated client ID, either in the
Zitadel console (<https://z.vidur.xyz/ui/console> → Projects → homestacks →
Applications → `wardrobe-ios` → Client ID) or:

```fish
kubectl --context vidur-centerpoint -n wardrobe-system get secret wardrobe-ios-oidc -o jsonpath='{.data.client_id}' | base64 -d; echo
```

and store it:

```fish
gh variable set IOS_OIDC_CLIENT_ID --body '<client id>'
```

CI fails fast with a clear message while this variable is missing.

## 6. TestFlight

1. App Store Connect → your app → **TestFlight** → **Internal Testing** →
   **+** → group `Owner`. Turn on **Automatically distribute builds** (in the
   group's settings).
2. Add testers → yourself (the account holder is already an App Store
   Connect user).
3. On the iPhone and the iPad: install **TestFlight** from the App Store,
   sign in with the same Apple ID, accept the invite email (once).
4. Export compliance is answered by the build itself
   (`ITSAppUsesNonExemptEncryption = NO`: only HTTPS), so builds go straight
   to "Ready to Test" after processing (5–15 minutes after the CI upload).

## 7. First build

After sections 3–5, either merge to `main` with changes under `ios/`, or run
it by hand:

```fish
gh workflow run ios.yaml --ref main
gh run watch
```

The build number is the workflow run number; the version comes from
`MARKETING_VERSION` in `ios/project.yml`. TestFlight notifies the devices
when the build is ready; open TestFlight → Wardrobe → Install. Sign in with
your Centerpoint account.

## Local builds on your own devices (optional)

For a debug build straight from the Mac (no TestFlight):

```fish
cd ~/src/github.com/gpdl49/wardrobe
mise run ios:generate       # xcodegen → ios/Wardrobe.xcodeproj
open ios/Wardrobe.xcodeproj
```

In Xcode: Settings → Accounts → add your Apple ID (team "Vidur Butalia"),
select the device, Run. Automatic signing creates a development profile for
connected devices. Enable Developer Mode on the device when iOS asks
(Settings → Privacy & Security → Developer Mode).

## Costs and limits

- GitHub-hosted macOS minutes count 10× against the private-repo allowance
  (2,000 min/month on Free ⇒ about 200 macOS minutes, ~15–20 TestFlight
  builds). The workflow only runs when `ios/` changes. If that becomes a
  limit, register the MacBook as a self-hosted runner and change `runs-on`.
- TestFlight builds expire after 90 days; any new build resets it.

## Rotating or revoking

- API key: App Store Connect → Integrations → revoke `wardrobe-ci`, generate
  a new one, redo section 4.
- Cloud-managed certificates: Certificates, Identifiers & Profiles →
  Certificates; revoking one just makes the next CI run create another.
