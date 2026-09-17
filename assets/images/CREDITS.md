# Image credits

Every file under `assets/images/` is supplied directly by the business (not
fetched from Wikimedia Commons via `tools/fetch-images.mjs`, and not the
earlier locally generated placeholder). No third-party licence or
attribution applies.

To replace any single photo, drop a new file in at the same slot path (see
`tools/images.manifest.json` for the full slot list) and update its entry in
`assets/js/data/images.js` — the slot key never changes, so nothing else in
the codebase needs to.
