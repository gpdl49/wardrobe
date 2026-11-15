# Outfits, Immich and AI suggestions: contract

The build contract for outfits (saved and shared sets of items with extra
photos), the Immich link, and AI tagging and outfit suggestions. It extends
[`docs/wardrobe.md` in gpdl49/homestacks](https://github.com/gpdl49/homestacks/blob/main/docs/wardrobe.md);
the homestacks work package ports this file into that document. Everything in
that document still holds unless this file says otherwise.

Sources of truth, in order: this file; `lib/api/types.ts` (response shapes);
`prisma/schema.prisma` (data model); `lib/access` (who may do what). Those
three files and this one are **frozen** for the work packages in
[plan.md](plan.md): request a change instead of making one.

## Decisions

| Area | Decision |
|------|----------|
| Outfit | A named, ordered set of items from **one owner's** wardrobe, with optional notes, seasons, tags and photos. |
| Sharing | With other Wardrobe users only; no public links. A whole-wardrobe share covers the owner's outfits at the share's level. An outfit share grants one user **view** access to one outfit. |
| Outfit photos | Two sources in one list: uploads (the existing photo pipeline, `kind: "outfit"`) and linked Immich assets (stored by reference, never copied). |
| Immich | `https://immich.vidur.xyz` (v3). Each user pastes their own Immich API key in Wardrobe settings; it is stored encrypted. Linked assets are streamed through Wardrobe with the key of the user who linked them, so anyone who can read the outfit can see them. |
| AI tags | The existing vision analysis already suggests tags. It now reuses the owner's existing tag vocabulary, and tags can be queued and applied in bulk. Still suggestions the user accepts. |
| AI outfits | A text model on OpenRouter proposes outfits from item metadata (no images), optionally steered by a prompt, a season and must-include items. Proposals are saved or dismissed. |
| Preferences (later) | Not built now. What is built: every save and dismissal is recorded, and the owner's saved outfits are given to the model as examples of their taste. A user-editable style profile and weighting by feedback are follow-ups that need no schema change beyond a profile table. |

## App environment (additions)

```
IMMICH_URL                 # optional, e.g. https://immich.vidur.xyz (no trailing slash, no /api)
SECRETS_KEY                # optional; base64 of 32 random bytes. AES-256-GCM key for stored Immich API keys
OPENROUTER_TEXT_MODEL      # default chosen in code; overridable
```

Immich features are enabled when both `IMMICH_URL` and `SECRETS_KEY` are set
(`immichEnabled()` in `lib/env`). Outfit suggestions are enabled when
`OPENROUTER_API_KEY` is set (`suggestionsEnabled()`). `GET /api/me` reports all
three switches in `features`.

## Data model (additions)

- `Outfit`: `id`, `ownerId`, `name` (1–200), `notes`, `seasons`, timestamps. Tags through `OutfitTag` (the owner's `Tag` rows, shared with items).
- `OutfitItem`: `outfitId`, `itemId`, `position`. Primary key (`outfitId`, `itemId`). Deleting an item removes it from its outfits.
- `OutfitShare`: `id`, `outfitId`, `granteeId`, `createdAt`. Unique (`outfitId`, `granteeId`). View only.
- `Photo` gains `outfitId` (nullable) and kind `outfit`. A photo has an item, an outfit or neither (an unassigned packing capture), never both (check constraint). An outfit photo's owner is the outfit's owner.
- `OutfitImmichAsset`: `id`, `outfitId`, `linkedById` (whose Immich key reads it), `assetId` (Immich asset UUID), `fileName`, `width`, `height`, `thumbhash`, `takenAt`, `createdAt`. Unique (`outfitId`, `assetId`).
- `ImmichConnection`: `userId` (primary key), `apiKey` (encrypted, `v1:<iv>:<tag>:<ciphertext>`, each part base64url), `immichUserId`, `immichEmail`, `immichName`, timestamps.
- `SuggestionRun`: `id`, `ownerId` (the wardrobe), `requestedById`, `status` (`queued` | `running` | `done` | `failed`), `request` (JSON `SuggestionRequest`), `model`, `error`, timestamps.
- `OutfitSuggestion`: `id`, `runId`, `ownerId`, `position`, `name`, `rationale`, `itemIds` (uuid[]), `feedback` (null | `saved` | `dismissed`), `outfitId` (the outfit it was saved as; unique, set null when that outfit is deleted), timestamps.

## HTTP API (additions, JSON, `/api`)

```
GET    /me                                    -> + features: {vision, suggestions, immich}

GET    /outfits?owner=&q=&tag=&season=&item=&cursor=&limit=  -> {outfits: OutfitSummary[], nextCursor}   (newest first; limit 1–100, default 24)
GET    /outfits/shared-with-me                -> OutfitSummary[]   (outfits shared directly with the caller, any owner, newest first)
POST   /outfits                               {name, notes?, seasons?, tags?, itemIds?, ownerId?, suggestionId?} -> 201 OutfitDetail   (Idempotency-Key)
GET    /outfits/{id}                          -> OutfitDetail
PATCH  /outfits/{id}                          {name?, notes?, seasons?, tags?, itemIds?} -> OutfitDetail   (itemIds replaces the list, in order)
DELETE /outfits/{id}                          -> 204 (deletes its uploaded photos and their objects; unlinks its Immich assets)
POST   /outfits/{id}/shares                   {grantee (email or username)} -> 201 OutfitShare (422 unknown grantee or self; 409 duplicate)
DELETE /outfits/{id}/shares/{shareId}         -> 204

POST   /photos                                {outfitId?, itemId?, kind, contentType, size}   (outfitId needs kind "outfit" and no itemId, and the reverse: 422)
PATCH  /photos/{id}                           unchanged for item photos; an outfit photo cannot be reassigned or change kind (422)
GET    /photos/{id}/{variant}                 also readable through an outfit (see Access)

GET    /immich                                -> ImmichStatus
PUT    /immich                                {apiKey} -> ImmichStatus   (validates the key against Immich; 422 `immich_key_rejected`)
DELETE /immich                                -> 204 (forgets the key; assets the user linked stay listed but stop loading)
GET    /immich/assets?q=&cursor=&limit=       -> {assets: ImmichAsset[], nextCursor}   (the caller's own library, images only, newest first; q is a smart search, ordered by relevance instead; limit 1–100, default 50)
GET    /immich/assets/{assetId}/thumb         -> 200 image bytes (the caller's own key; for the picker)
POST   /outfits/{id}/immich-assets            {assetIds: uuid[1..50]} -> 201 OutfitPhoto[]   (already linked ones are returned, not duplicated)
DELETE /outfits/{id}/immich-assets/{linkId}   -> 204
GET    /outfits/{id}/immich-assets/{linkId}/{variant}  -> 200 image bytes (thumb | display), Cache-Control: private, max-age=300

GET    /suggestion-runs?owner=                -> SuggestionRun[] (newest first, at most 20)
POST   /suggestion-runs                       {ownerId?, prompt?, season?, itemIds?, count?} -> 202 SuggestionRun   (Idempotency-Key)
GET    /suggestion-runs/{id}                  -> SuggestionRun (poll until status is done or failed)
POST   /outfit-suggestions/{id}/dismiss       -> OutfitSuggestion (idempotent; 409 if already saved)

POST   /items/analyses                        {ownerId?, itemIds?} -> 202 {queued: n}   (vision for items with a ready photo, no queued or running vision analysis and no done one since the current prompt revision; at most 50 per call)
POST   /items/analyses/apply-tags             {ownerId?, itemIds?, fields?} -> {updated: n}   (from each item's newest done vision analysis: adds its tags, and fills pattern, material and seasons only where the item has none; fields ⊆ tags, pattern, material, seasons, default [tags]; marks it applied)
```

Every Immich route answers 409 `immich_disabled` when Immich is not enabled,
and every route that needs the caller's key answers 409 `immich_not_connected`
without one. An Immich failure (network, 5xx, revoked key) is 502
`immich_unavailable`; a missing asset is 404. `POST /suggestion-runs` and
`POST /items/analyses` answer 409 when the model is disabled.

### Rules

- **Access to an outfit.** The owner has `owner`; a whole-wardrobe share gives its level (`view` or `edit`); an outfit share gives `view`. A location share gives nothing. No access is a 404, view access on a write a 403. Use `accessToOutfit` and `readableOutfits` from `lib/access`.
- **What reading an outfit reveals.** Its name, notes, seasons, tags, photos and its items as `ItemSummary`. For an item the caller could not otherwise read, `access` is `view` and `location` is `null`, and its id is left out of `OutfitDetail.readableItemIds` (the items the caller can open with `GET /items/{id}`); clients link only those. The caller may also load the **cover photo** of such an item through `GET /photos/{id}/{variant}`; the item's other photos and `GET /items/{id}` stay 404.
- **Who may change what.** The owner and whole-wardrobe editors create, edit and delete outfits, and add and remove their photos. Only the owner manages an outfit's shares; `OutfitDetail.shares` is empty for everyone else. The grantee must have signed in at least once.
- **Items in an outfit.** Every item must belong to the outfit's owner and be readable by the caller (422 otherwise). At most 50, no duplicates. `ownerId?` on `POST /outfits` defaults to the caller and needs edit access to that wardrobe.
- **Outfit lists.** `GET /outfits?owner=` returns what the caller may read in that wardrobe: everything with wardrobe access, otherwise the outfits shared with them directly. `item=` filters to outfits containing that item id.
- **Cover.** `OutfitSummary.cover` is the outfit's first ready uploaded photo, else its first Immich asset, else `null`; `previewItems` (the first six items) lets a client draw a collage instead.
- **Immich keys.** Stored only encrypted; never returned, logged or sent to the browser. The key needs the Immich permissions `user.read`, `asset.read` and `asset.view`. Wardrobe calls Immich server to server at `IMMICH_URL` with `x-api-key`.
- **Linked Immich assets.** Only the owner or a whole-wardrobe editor links assets, from their own Immich library (the asset must be readable with their key: 422 otherwise). The link stores metadata for layout and streams bytes on demand with the **linker's** key. If that key is gone or the asset is deleted, the variant is 404 and the client shows a placeholder. Nothing is written to Immich.
- **Suggestions.** `POST /suggestion-runs` needs edit access to the wardrobe and at least four `active` or `stored` items (409 otherwise). `itemIds` (at most 5) must appear in every proposal; `count` is 1–6, default 3; `prompt` is at most 500 characters. The job sends item metadata only (id, name, category path, colours, pattern, material, seasons, tags), at most 400 items (those the caller named first, then the newest), plus the owner's twenty newest outfits as taste examples. Output is strict JSON schema; proposals naming unknown items or fewer than two items are dropped; a run with none left fails. Jobs never retry.
- **Saving a suggestion.** `POST /outfits` with `suggestionId` creates the outfit (the request's own `name` and `itemIds` win over the proposal's) and marks the suggestion `saved` with its `outfitId`. A suggestion already saved is 409. Dismissing sets `dismissed`.
- **Bulk tagging.** Both routes need edit access to each item; items the caller cannot edit are skipped, not errors. Without `itemIds` they cover the whole wardrobe (`ownerId`, default the caller).
- **Tag vocabulary.** The vision prompt lists the owner's fifty most used tags and asks the model to reuse them where they fit.
- **Garment attributes.** The vision model also picks neckline, collar, sleeve, fit, length and closure from closed lists (`lib/analyses/attributes.ts` in the app), or null where one does not apply. Each value becomes a tag exactly as listed (`v-neck`, `button-down collar`), ahead of at most six free-form tags, twelve in all. Free-form tags leave out colours, pattern, material and attribute values. Done analyses older than `VISION_PROMPT_REVISION` count as stale for bulk queueing, so a prompt change can reach items already analysed.

## Pages (web)

`/outfits` (grid; search, tag and season filters; wardrobe switcher; "Shared
with me") · `/outfits/new` and `/outfits/[id]/edit` (name, notes, seasons,
tags, item picker with reordering) · `/outfits/[id]` (items, photo gallery
with upload and "Add from Immich", share dialog, delete) · `/outfits/suggest`
(prompt, season, must-include items; proposals with save and dismiss; past
runs) · `/settings` (Immich connection; bulk tagging). The catalogue's item
page links to the outfits an item is in.

Nav: Outfits is a primary item after Catalogue; Settings is secondary.

## Shared UI contracts

- `components/immich/immich-picker.tsx` exports
  `ImmichPicker({ open, onOpenChange, onPick })` where
  `onPick(assetIds: string[]) => void | Promise<void>`. The picker only
  selects; the caller links.
- Each web package adds its own client module (`lib/client/outfits.ts`,
  `lib/client/immich.ts`, `lib/client/suggestions.ts`) with its fetch
  functions, query keys and hooks, built on `request` from `lib/client/api.ts`.
  `lib/client/api.ts` and `lib/client/queries.ts` are frozen.
