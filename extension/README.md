# Readio — Chrome extension

Sends the current tab's URL to your running Readio server. This is
an unpacked, unpublished extension for personal use only.

## Install (one-time, manual — Chrome doesn't allow this to be automated)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this `extension/` folder

## Use

1. Make sure the Readio server is running (`npm start` in the
   project root — defaults to `http://localhost:3000`)
2. Click the extension icon on any article/video tab
3. Click **Add to Readio**

If your server runs somewhere other than `http://localhost:3000` (a
different port, or a Tailscale hostname once that's set up), open
**Server settings** in the popup and change it — it's saved locally via
`chrome.storage`.

## Note on permissions

The manifest requests `host_permissions: ["<all_urls>"]` so it can POST to
whatever server URL you configure (localhost, a LAN IP, or a Tailscale
hostname) without hardcoding one. That's fine for an unpacked extension
only you install, but this manifest would need tightening (a specific
host pattern) before it could ever be published to the Chrome Web Store.
