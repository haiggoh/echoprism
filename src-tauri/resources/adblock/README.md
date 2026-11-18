# Ad-block rule list (Task 5)

`content-rules.json` is a Safari WebKit content-blocker rule list blocking
ad/tracking hosts (doubleclick, googlesyndication, googleadservices) and
YouTube ad endpoints (`/pagead/`, `/api/stats/ads`, `/ptracking`).

Status 2026-11-18: wry 0.57 (Tauri 2.12's webview layer) exposes
`WKUserContentController.addUserScript` but NOT `addContentRuleList`, so this
file is NOT attached to the webview yet — it is versioned here ready to wire
the moment wry exposes it (or via a small objc shim in build.rs). The active
ad defense today is the json-prune user script inlined in
`../embed_player.html` (prunes `adPlacements`/`playerAds`/`adSlots` from
player responses inside the embed iframe; unit-tested copy in
`src/lib/adPrune.ts`). YouTube changes these lists — review and re-date this
file when touching it.
