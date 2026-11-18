# Peer Arena FPS — Advanced
Static Three.js browser FPS designed for Git + Vercel.

## Deploy
1. Push the contents of this folder to GitHub.
2. Import the repo in Vercel.
3. Framework preset: Other; build/install commands blank; output directory `.`.
4. Deploy.

## Controls
PC: WASD, Shift sprint, Ctrl slide/crouch, Space jump, mouse aim, left click fire, R reload, right click ADS, 1/2 weapon select.
Mobile: virtual move pad, touch drag to aim, Fire/Jump/Slide/Reload/ADS buttons.

## Features in this build
- Procedural first-person arm/hand silhouette and staged reload movement
- Reload timing, ammo and reserve management
- Synthesized shot/footstep/reload sounds (browser audio unlocks on interaction)
- Hit marker and kill feed
- Simple bot opponents in solo mode
- Basic peer room functionality
- Included map and weapon assets

## Limitations
This remains a prototype. Bot AI is intentionally simple, peer-hosted networking is not authoritative or anti-cheat, and weapon models/arms are not rigged skeletal animation assets. Browser 3D performance depends on device.
