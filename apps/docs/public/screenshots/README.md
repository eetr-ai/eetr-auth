# App screenshots

Screenshots of the running **eetr-auth** app, embedded in the docs via the `<AppShot>`
MDX component (`<AppShot src="sign-in.png" alt="..." caption="..." />`).

Save PNGs here using the exact filenames below. `<AppShot>` uses a plain `<img>` with the
basePath, so a missing file simply won't render — it never breaks the build.

Capture tips: ~1400–1600px wide, crop to the relevant area, light theme preferred for
consistency (dark is fine too — the frame adapts).

## Core set

| Filename | Capture | Used on |
|---|---|---|
| `sign-in.png` | The sign-in page (username/password + passkey button + logo) | features/authentication |
| `admin-dashboard.png` | Admin dashboard home/overview | features/admin |
| `clients-list.png` | Clients list showing the **Dynamic** badge + registration-type filter | features/clients |
| `password-policies.png` | Setup → Password policies editor | features/authentication |
| `mfa-totp-enroll.png` | Authenticator (TOTP) enrollment with the QR code | guides/mfa-totp |
| `setup-site-identity.png` | Dashboard → Setup → **Site identity** tab (title, logo, URL, CDN) | getting-started/cloudflare-template |

## Optional / nice-to-have

| Filename | Capture | Used on |
|---|---|---|
| `users-list.png` | Users list with environment badges | features/admin |
| `passkey-settings.png` | Passkey list in account settings | features/authentication |
| `new-client.png` | New client form (redirect URIs, auth method, scopes) | features/clients |
| `token-activity.png` | Token activity log viewer | features/tokens |
