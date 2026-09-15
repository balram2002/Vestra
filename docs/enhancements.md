# Enhancement setup and verification

## Google sign-in

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the server environment. Set `NEXT_PUBLIC_SITE_URL` to the application's origin. Create a Web application OAuth client in Google Cloud and register this exact redirect URI:

`https://YOUR-DOMAIN/api/auth/google/callback`

For local testing use `http://localhost:3000/api/auth/google/callback`. Rebuild after configuring credentials so the sign-in buttons are rendered. Unconfigured deployments continue offering password sign-in.

The implementation follows [Google's OpenID Connect server flow](https://developers.google.com/identity/openid-connect/openid-connect): authorization code exchange, PKCE, a signed HttpOnly state/nonce cookie and signed ID-token verification. Only verified email identities are accepted. Provider subjects have a unique index. Existing password accounts are not silently linked by matching email; those users can continue with their password or password recovery. Configured email two-step verification is enforced before a session is issued.

Real Google consent and callback testing requires the owner's OAuth client credentials and Google account.

## Categories

Marketing → Shop page opens `/admin/categories-page`. Select **Customise shop page** once to adopt the live category defaults. Thereafter sections use the same page editor, live previews, scheduling, ordering, visibility and confirmation/reset controls as the homepage. Reset restores the current catalogue's department defaults and hides added sections. Images come from category media, with product and ancestor-image fallbacks. Change taxonomy photography in the catalogue editor.

## Reels

Vertical swipes, wheel gestures, arrow keys, Page Up/Down and desktop arrow buttons use a custom damped spring. Reduced-motion preferences settle immediately. One visible clip plays; hidden tabs pause playback. Clips have pause/mute controls, media-error fallback, wishlist persistence and native sharing with clipboard fallback.

Sidebar gestures use [@use-gesture](https://use-gesture.netlify.app/docs/) with edge intent, vertical-scroll and carousel guards.
