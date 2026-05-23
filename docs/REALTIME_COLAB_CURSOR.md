# Building Realtime Cursors — Two Paths

An instruction guide for adding Figma-style multiplayer cursors to a Next.js app. Pick one of two paths depending on whether you want to lean on Supabase or your existing WebSocket server.

---

## Pick your path

**Path A — Supabase UI's Realtime Cursor component.** Open source, drop-in, runs on Supabase Realtime. You ship in a day. Trade-off: you depend on Supabase, and Realtime has rate/connection limits on the free tier.

**Path B — Build it on your own WebSocket server.** Full control, no third-party dependency, fits when you already run a WS server. Trade-off: you own reconnection, presence, rate limiting, and scaling.

A simple decision rule:

- If your app already uses Supabase for auth or DB → Path A. No reason to fight it.
- If your app has its own backend and a WS server you control → Path B. You'd duplicate infra otherwise.
- If you want a portfolio piece that _demonstrates_ you can build realtime infra → Path B. "I integrated a library" reads weaker than "I designed a presence protocol."

The rest of this doc assumes you'll likely build Path B for the portfolio version and possibly use Path A in a project where you just want the feature shipped.

---

## Path A — Supabase UI Realtime Cursor

The open-source component lives in the Supabase UI library. Docs: `supabase.com/ui/docs/nextjs/realtime-cursor`. Source: `github.com/supabase/supabase/tree/master/apps/ui-library`.

### What you get

A `<RealtimeCursors />` React component plus a `useRealtimeCursors` hook. Takes two props: `roomName` and `username`. Renders other users' cursors in the same room. Uses Supabase Realtime's Broadcast channel under the hood — no DB writes, just pub/sub messages between clients.

The component ships as three files when installed: `components/cursor.tsx` (the visual cursor), `components/realtime-cursors.tsx` (the orchestrator), and `hooks/use-realtime-cursors.ts` (the broadcast logic). All three land in your repo so you can edit them.

### Prerequisites

1. A Supabase project (free tier works).
2. Realtime enabled on the project (it is by default).
3. The Supabase JS client (`@supabase/supabase-js`) and Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) wired up.
4. The shadcn/ui CLI configured in your Next.js app, since this component is distributed through the shadcn registry.

### Installation steps

1. Run the install command from the Supabase UI docs page — it's a single shadcn registry add command that drops the three files into your project. Alternatively, open it directly in v0 from the docs page if you want to preview before installing.
2. Verify the files appeared in `components/` and `hooks/`. Also check that `lib/supabase/client.ts` exists (the install will scaffold it if missing).
3. Confirm the Supabase env vars are loaded — the client file reads them at module init.

### Wiring it into a page

1. Mark the page (or the wrapping component) as a Client Component — Supabase Realtime opens a WebSocket and can't run on the server.
2. Render `<RealtimeCursors roomName="..." username="..." />` somewhere inside the page.
3. The `roomName` should be a stable identifier scoped to whatever the users are collaborating on (a document ID, a board ID, a project ID). Two clients using the same `roomName` see each other.
4. The `username` is what gets shown on the cursor label — usually pulled from your auth session.

That's the whole integration. The component handles presence detection (join/leave) automatically.

### How it works underneath

Worth understanding before you customize it:

- It opens a Supabase Realtime **broadcast** channel named after `roomName`.
- On every `mousemove`, it broadcasts a message with `{ x, y, username, color }`.
- It subscribes to all messages on the same channel and stores the latest position per user in component state.
- When a user stops broadcasting (closes the tab), Realtime's presence feature fires a leave event and the component removes them.

The default cursor is a Lucide `MousePointer2` icon with a colored label below it. Color is auto-generated from a hash of the username.

### Customizing the cursor appearance

Since the component installs _into your repo_, you customize by editing the files directly. Same model as shadcn/ui.

To change colors:

1. Open `components/realtime-cursors.tsx` and find the color generation logic (it's a hash function over the username producing an HSL value).
2. Swap it for a fixed palette if you want Figma-style discrete colors instead of random hues. A 16-color palette like rose/orange/yellow/green/teal/sky/indigo/purple/pink covers a room well.
3. Use the same `colorFromUsername` function from your auth/user system if you want colors that persist across sessions.

To change the cursor shape:

1. Open `components/cursor.tsx`.
2. Replace the `MousePointer2` Lucide icon with your own SVG. The Figma cursor is a specific arrow shape — you can paste any SVG path here.
3. Keep the `pointer-events-none` class on the wrapper so the cursor doesn't interfere with clicks.

To change the label style:

1. Still in `components/cursor.tsx`, the label is the `<div>` below the icon.
2. Style it however you like — round corners only on three sides for the Figma look, add an avatar `<img>` next to the name, swap the font to your design system, etc.

To add user customization (let the user pick their own color / name / shape):

1. Lift the color, name, and cursor shape into your app's user-preferences state (Zustand, context, or localStorage).
2. Pass them as new props through `RealtimeCursors` → `useRealtimeCursors` → into the broadcast payload.
3. Build a small settings panel UI that updates those values. The change propagates automatically because every mousemove broadcasts the current values.
4. Persist the choices to localStorage so they survive reloads. If users are authenticated, persist to Supabase so the choice follows them across devices.

### Adding smoother cursor movement

The default component renders raw broadcast positions, which can look jittery if updates arrive 50–80ms apart. The Supabase docs themselves recommend `perfect-cursors` (`github.com/steveruizok/perfect-cursors`) for this.

Steps:

1. Install `perfect-cursors`.
2. In `components/realtime-cursors.tsx`, where remote cursors are rendered, wrap each cursor's position updates through a `PerfectCursor` instance — it takes incoming `(x, y)` points and outputs interpolated points along a spline.
3. Apply the interpolated point via `transform: translate3d(x, y, 0)` rather than re-rendering the React tree — much smoother and avoids reconciliation thrash.
4. Dispose the `PerfectCursor` instance when a user leaves, otherwise you leak interpolation buffers.

Only apply this to _remote_ cursors. The local user's cursor is already drawn by the browser, so you don't render your own.

### Limits to know about

- Supabase Realtime free tier has a concurrent-connections cap and a messages-per-second cap. Throttle your mousemove broadcasts to ~30/sec (≈33ms) to stay well under it.
- Broadcast messages are not authorized by default — anyone with the anon key can join any channel. For private rooms, enable Realtime Authorization on the channel (Supabase docs: "Realtime authorization") so only users with a valid JWT and the right RLS policy can subscribe.
- If a user closes their laptop lid, presence may take 30+ seconds to fire `leave`. Add a stale-cursor sweep on the client (drop any cursor that hasn't moved in 30 seconds).

---

## Path B — Build it on your own WebSocket server

What you'll deliver: a small reusable package — call it something like `@yourname/realtime-cursors` — that works with any WebSocket server you control. Two halves: a server-side message handler, and a client-side React provider plus components.

### Architectural decisions to make first

Settle these before writing anything, because they shape everything else.

1. **The server is a relay, not a source of truth.** It maintains rooms in memory (a map of room → connections) and forwards messages. It never writes cursor positions to a database. Presence is ephemeral.
2. **Awareness pattern, not shared-state pattern.** Each client publishes _its own_ presence. The server forwards to others. You don't merge or reconcile — last write wins per user.
3. **Local-first rendering.** The user's own cursor is drawn by the browser; you don't render it. You only render _remote_ cursors received over the wire.
4. **Throttle on send, interpolate on receive.** Send at 30 fps (33ms). Interpolate to 60 fps for display. Halves bandwidth with no visible quality loss.
5. **Discriminated union message types.** Every wire message has a `type` field. This makes the server and client handlers exhaustively type-safe and easy to evolve.

### Package layout

Organize as a workspace package with three folders:

- **`shared/`** — protocol definitions, type definitions, color palette. Imported by both sides.
- **`server/`** — room manager and message handler. Framework-agnostic — takes a `send` function and returns `onMessage` / `onClose` callbacks so it works with `ws`, Bun's WebSocket, uWebSockets.js, or Cloudflare Durable Objects.
- **`client/`** — React provider, hooks, cursor components.

Split the package exports so `server/` and `client/` are separate subpath imports (`@yourname/realtime-cursors/server` vs `/client`). Next.js will otherwise try to bundle Node's `ws` into the browser.

### Build order

Build in this order so each piece is testable before the next exists.

#### 1. The wire protocol (shared)

Define the message types as a discriminated union. Two directions:

- **Client → Server:** `join` (with room ID, user ID, initial presence), `presence` (a partial presence patch), `leave`, `ping`.
- **Server → Client:** `sync` (initial room state on join), `join` (new user joined), `presence` (someone moved), `leave` (someone left), `pong`, `error`.

Two things worth doing now:

- Include a protocol version number in `join` so you can reject old clients when you evolve the format.
- Make presence updates **partial patches** — `Partial<Presence>` — so cursor positions don't resend the user's name and color 30 times per second. The client merges patches into its local copy.

The `Presence` type itself: `{ cursor: { x, y } | null, name, color, shape, avatarUrl? }`. `null` cursor means "hidden / off-screen." Make the package generic over this type so consumers can extend it with `selection`, `viewport`, `isTyping`, etc.

#### 2. Color palette and assignment (shared)

- Hand-pick 16–20 high-contrast colors that work on both light and dark backgrounds. Figma's palette is a good reference.
- Provide a deterministic `colorFromUserId(userId)` function using a stable hash (FNV-1a is a good simple choice — same output on every JS engine, no dependencies).
- Determinism matters: if Ngo is always purple, teammates build mental shortcuts. Random per-session colors break that.
- Provide a fallback `pickAvailableColor(userId, taken)` that prefers the deterministic color but picks a free one if taken.

#### 3. The server room manager

A class wrapping a `Map<roomId, Map<userId, connection>>`. Methods: `join`, `leave`, `broadcast(roomId, message, exceptUserId)`. Nothing fancier — that's the whole API.

#### 4. The server message handler

A factory function that returns a connection handler. For each incoming WebSocket, it returns `{ onMessage, onClose }` callbacks the WS framework can call.

Behavior:

- On `join`: validate protocol version → call optional `authorize` hook → add to room → send `sync` to the joiner with current room state → broadcast `join` to everyone else.
- On `presence`: sanitize the patch (clamp coordinates, strip unknown keys) → update the stored presence → broadcast to everyone else.
- On `leave` or socket close: remove from room → broadcast `leave` to everyone else.
- On `ping`: reply `pong`.

Two non-negotiable hooks for the factory:

- **`authorize({ roomId, userId, presence })`** — async, returns boolean. This is where you verify the JWT / session and check if the user can access the room. Reject before adding to the room.
- **`sanitizePresence(patch)`** — runs on every presence patch. Clamp cursor coordinates to a sane range. Strip unknown fields. Apply per-connection rate limiting here (drop if >80 msg/sec from this connection).

#### 5. Wiring the handler to your WebSocket framework

If you're using `ws`: for each incoming connection, call `handler.handleConnection(send)`, then forward `message` events to `onMessage` and `close` events to `onClose`.

Same shape for Bun's WebSocket or any other library. Because the handler is framework-agnostic, you can swap implementations without touching protocol logic.

#### 6. The client connection layer

A class that wraps `WebSocket` and adds:

- **Exponential backoff reconnection.** Start at 500ms, double on each failure, cap at 30s. Reset on successful connect.
- **Heartbeat.** Send `ping` every 25s. If the underlying socket is dead, the next send will throw and trigger reconnect.
- **Status events.** Expose `connecting | open | closed` so the UI can show a connection indicator.

#### 7. The React provider

A context provider that:

- Holds the connection instance.
- Holds the local user's presence in a ref (not state — cursors update too often).
- Holds the remote users' presences in a Map ref keyed by user ID.
- Forces a re-render on each incoming message via a `useState` counter.

Important detail: don't put high-frequency remote state directly in `useState`. Use refs + a forced re-render, or `useSyncExternalStore` if you want selector-based subscriptions. Naive `useState` will tear through reconciliation on every frame.

Expose `useRealtime()` returning `{ me, remote, status, updatePresence }`.

#### 8. The cursor-tracking hook

`useTrackCursor()` — attaches a throttled `mousemove` listener, calls `updatePresence({ cursor: { x, y } })`. Options:

- `throttleMs` (default 33).
- `target` element (default `window`) — for canvas/whiteboard apps, you want coordinates relative to the canvas, not the viewport.
- `hideOnLeave` — fires `cursor: null` when the mouse exits.

#### 9. The cursor component

A single remote cursor — receives `(x, y, color, name, shape, avatarUrl)` and renders:

- An SVG arrow (Figma-style) or pointer, colored.
- A label below it with the name (and avatar if provided).
- White outline on the SVG so it's visible on dark backgrounds.

For smooth movement: use `perfect-cursors`. Each cursor instance gets its own `PerfectCursor` that takes new `(x, y)` points and calls back with interpolated points along a spline. Apply via `transform: translate3d(...)` on the wrapper div — bypasses React reconciliation entirely.

Dispose the `PerfectCursor` in a cleanup effect when the cursor unmounts.

#### 10. The cursors layer

A `<CursorsLayer />` component that:

- Positions itself `fixed inset-0` with `pointer-events: none` and high `z-index`.
- Iterates the remote users from context and renders a `<Cursor />` for each one whose cursor is not `null`.
- Runs a stale-cursor sweep every second — drop any remote user whose `lastSeen` is older than 30s. Belt-and-suspenders for ungraceful disconnects.

#### 11. The customizer UI

A small floating panel that lets the user:

- **Edit their name** — text input, mirrors to presence.
- **Pick a color** — grid of palette swatches; the current color has a ring around it.
- **Pick a cursor shape** — `default` arrow vs `pointer` finger. Add more as your design system grows.
- **Toggle visibility** — checkbox to hide their cursor from others (sends `cursor: null`).

Persist all four to `localStorage` under a single key. On mount, hydrate from localStorage and call `updatePresence` once. Save on every change.

For users with accounts, also persist to your backend so preferences follow them across devices — store as a JSON blob on the user record.

### Public API surface

What the package exports:

- `RealtimeProvider` — wraps your app.
- `useRealtime()` — access to `{ me, remote, status, updatePresence }`.
- `useTrackCursor()` — auto-track and broadcast the user's cursor.
- `CursorsLayer` — render-everyone-else overlay.
- `Cursor` — single cursor (exposed for advanced layouts).
- `CursorCustomizer` — drop-in settings panel.
- `CURSOR_PALETTE`, `colorFromUserId`, `pickAvailableColor` — color utilities.
- All shared types.

### Using it in a Next.js app

1. Wrap the page or layout in `<RealtimeProvider>` with `wsUrl`, `room`, `user`.
2. Inside the provider, render `<CursorsLayer />` (overlay), `<CursorCustomizer />` (settings UI), and a tiny client component that calls `useTrackCursor()`.
3. Mark the wrapping component as a Client Component since it opens a WebSocket.

---

## Comparison: when each path wins

| Concern                                     | Supabase UI Path                       | Custom WS Path                |
| ------------------------------------------- | -------------------------------------- | ----------------------------- |
| Time to ship                                | ~1 day                                 | ~3–5 days                     |
| Infra to run                                | None (Supabase manages)                | Your WS server                |
| Auth                                        | Supabase Auth + Realtime Authorization | Whatever you already have     |
| Portfolio value                             | Lower (integration)                    | Higher (architecture)         |
| Cost at scale                               | Supabase pricing                       | Your hosting                  |
| Customization ceiling                       | High (files in your repo)              | Maximum                       |
| Extending to selections / viewport / typing | Possible but bolted-on                 | Built-in via generic presence |

If you're building this once for a real project and the project already uses Supabase: take Path A. If you're building this for the portfolio and want to reuse across SealPass, the form builder, and future projects: take Path B — the package pays itself back on the second project.

---

## Gotchas that apply to both paths

**Coordinate spaces.** `clientX/Y` is viewport-relative, which means cursors drift when users have different scroll positions or zoom levels. For a canvas/whiteboard app, transform to canvas coordinates _before_ broadcasting and back to screen on render. For a document app, use coordinates relative to a known anchor element.

**Throttle on send, interpolate on receive.** 30 fps over the wire + `perfect-cursors` interpolation looks like 60 fps and uses half the bandwidth. Sending raw 60 fps is wasted bytes.

**Rate-limit on the server, not just the client.** A malicious client can ignore your throttle and spam thousands of messages per second. Drop messages above ~80/sec per connection on the server.

**Authorize room access.** Anyone who can guess a room ID can join unless you check. Validate a token on join. Never trust the `userId` the client claims — derive it from the auth token.

**Stale cursor sweep.** TCP disconnects can take 30+ seconds to surface as a `close` event on the server. Run a client-side timer that drops any remote cursor not updated in the last 30s.

**Don't render your own cursor.** The browser already draws it. Filter the local user out of the rendering pass.

**Respect `prefers-reduced-motion`.** Disable cursor interpolation when the user has reduced motion enabled — jump to positions instead of animating.

**SSR boundary.** Anything that opens a WebSocket must be a Client Component. Make sure the provider and the page rendering it are marked accordingly.

---

## Suggested next features (for the v0.2 of your package)

Once cursors work, the same protocol extends naturally:

- **Selection broadcasting** — add `selection` to presence; same broadcast pattern.
- **Follow mode** — add `viewport` to presence; let user A's scroll/zoom mirror user B's.
- **Reactions / emoji ping** — ephemeral one-shot events, separate message type from presence.
- **Comment pins** — anchored to coordinates, but persistent → these _do_ need DB writes, unlike cursors.
- **Edge deployment** — your `RoomManager` maps cleanly to a Cloudflare Durable Object per room. Same protocol, free fan-out at the edge.

The shape of `Presence` being generic is what makes all of this cheap — every new feature is a new field on the type, not a new piece of infrastructure.
