# Pokémon Desktop Pet

A transparent, frameless Electron desktop pet using PMDCollab sprites.

## Setup

```bash
npm install
npm start
```

On first launch it will download sprites for the configured Pokémon from the
PMDCollab GitHub repo and cache them locally in your system's app data folder.
After that it's fully offline.

## Changing the Pokémon

Open `src/pet.js` and change the `DEX` constant at the top:

```js
const DEX = '0025'  // Pikachu
```

Use the zero-padded National Pokédex number (e.g. `'0001'` for Bulbasaur,
`'0006'` for Charizard, `'0133'` for Eevee`).

You can look up numbers at https://sprites.pmdcollab.org/

## Controls

- **Drag** the sprite to reposition it anywhere on screen.
- Clicks on transparent pixels pass through to whatever's underneath — the pet
  won't get in your way.
- The pet walks left and right on its own, occasionally pausing to idle.

## Project structure

```
pokemon-desktop-pet/
├── main.js          # Electron main process — window, IPC, sprite caching
├── preload.js       # Secure bridge between main and renderer
├── src/
│   ├── index.html   # Renderer shell
│   ├── style.css    # Transparent/pixelated canvas styles
│   └── pet.js       # Sprite loader, animation engine, walking AI
└── package.json
```

## Sprite format notes (PMDCollab)

Spritesheets are laid out with:
- **Columns** = animation frames (left to right)
- **Rows** = directions:
  - Row 0: South (facing viewer)
  - Row 2: East  (facing right)
  - Row 6: West  (facing left — we mirror row 2 instead)

Timing comes from `AnimData.xml` — each `<Duration>` value is in 1/60 s units.

## Credits

Sprites from [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab),
licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).
Credit individual contributors via the tracker on the repo.
