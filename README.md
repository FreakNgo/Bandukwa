# Peer Arena FPS — P2P Fix

Static browser FPS project for GitHub + Vercel. It does not require Node.js, `npm install`, or a separate game server for the normal client-side game.

## Deploy to Vercel

1. Extract this ZIP.
2. Upload the contents of this folder to a GitHub repository.
3. Import that repository in Vercel.
4. Select **Other** as the framework preset. Leave Build Command and Install Command blank. Set Output Directory to `.`.
5. Deploy. The deployed site must be served over HTTPS for WebRTC and browser clipboard features.

The game loads Three.js and its model loaders from jsDelivr, and loads PeerJS on demand from esm.sh when a player creates or joins an online room. Players need normal internet access to those services.

## Play vs bots

Click **PLAY VS BOTS**. This is local solo mode and does not need PeerJS or an online room. The bot capsule mesh is generated with Three.js core geometry.

## Play online with friends

1. The host enters a city label if desired (for example, Mumbai) and clicks **CREATE ROOM**.
2. Wait for **ROOM READY**. The host should keep this browser tab open.
3. Click **COPY INVITE LINK** and send it to friends. The copied link includes the host's room ID and optional city label. Friends can also paste the full room ID into the join field.
4. Friends open the link or paste the ID and click **JOIN ROOM**.
5. Once friends are connected, the host clicks **START MATCH**.

The game sends gameplay data directly between connected browsers using WebRTC. PeerJS is used for room signalling/connection setup, not as the game simulation server. A city label is only an optional label; it is not GPS tracking or automatic city matchmaking. Players in the same city can play together by sharing the room invite. Players in other cities can also join if they have the link.

## Controls

- PC: WASD, Shift sprint, Ctrl slide/crouch, Space jump, mouse aim, left click fire, R reload, right click ADS, 1–6 weapon select.
- Mobile: virtual movement pad, touch drag to aim, and Fire/Jump/Slide/Reload/ADS buttons.

## Important limitations

- No internet P2P implementation can honestly be guaranteed to work on every network. Some strict NATs, corporate/school firewalls, VPNs, or carrier networks block direct WebRTC connections; a TURN relay would be needed for those cases, and this static-only build does not provide a dedicated TURN relay.
- The host must keep the room tab open. If the host closes the page or loses connectivity, the room ends.
- This is a peer-hosted prototype, not an authoritative or cheat-resistant competitive server. Players can potentially modify their local game state.
- Same-city discovery is not automatic: use the invite link/room ID. Adding an always-on directory for automatic city matchmaking would require a separate signalling/directory service.
- Bot AI, weapon animation, collision and mobile performance remain prototype-level and vary by browser/device.
