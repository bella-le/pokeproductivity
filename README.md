# PokéProductivity

A transparent, frameless Electron desktop pet with a built-in task manager and Pomodoro timer. Your Pokémon walks across the screen while you work, reacts to your progress, and keeps track of what needs doing.

Sprites are from the [PMDCollab](https://github.com/PMDCollab/SpriteCollab) sprite repository.

## Features

- **Walking sprite** — your Pokémon wanders left and right, idles, and reacts to interactions using sprites
- **Portraits** — character portraits pop up on hover, on task completion, and during Pomodoro sessions
- **Task panel** — a floating task list with support for recurring tasks, start dates, and progress tracking
- **Pomodoro timer** — built-in focus timer overlay with a progress bar
- **Settings** — configure your Pokémon, nickname, sprite scale, colors, and layout from a settings window

## Setup

```bash
npm install
npm start
```

On first launch the app downloads sprites and portraits for your configured Pokémon from PMDCollab's GitHub repo and caches them locally in your system's app-data folder. After that it's fully offline.

## Usage

**Right-click** the pet to open the context menu:

| Option | Description |
|--------|-------------|
| Tasks | Open / close the floating task panel |
| Pomodoro | Open the focus timer overlay |
| Settings | Open the settings window |
| Quit | Exit the app |

**Drag** the sprite to reposition it anywhere on screen.

### Task panel

- **Add Task** — click the button at the top to expand the form
- **Right-click a task** — Edit, Duplicate, or Delete
- **Check the tick** — marks the task complete; recurring tasks automatically reappear on their next due date
- **Start date** — optionally set a future date so the task stays hidden until then

**Task types and recurrence:**

| Type | Recurs |
|------|--------|
| Habit | Daily (next day) |
| Daily | Daily (next day) |
| Weekly | Weekly (+7 days) |
| Monthly | Monthly (same day next month) |
| One-time | No recurrence — disappears when completed |

### Pomodoro timer

1. Right-click → Pomodoro
2. Enter a duration (e.g. `25:00`) and press **▶ Start**
3. The progress bar fills as the session runs; pause or stop at any time
4. When the timer ends the Pokémon plays a celebration animation

### Settings

Open via right-click → Settings. Changes take effect immediately (the pet window reloads).

| Setting | Description |
|---------|-------------|
| Pokémon | National Pokédex number (e.g. `0025` for Pikachu) |
| Nickname | Display name shown in portraits |
| Scale | Sprite size multiplier |
| Task panel side | Left or right edge of the screen |
| Task panel color | Background color of the panel and cards |
| Rounded corners | Toggle rounded corners on the task panel |

You can browse Pokédex numbers at [sprites.pmdcollab.org](https://sprites.pmdcollab.org/).

Do note they HAVE to be 4-digits.

## Building (macOS)

```bash
npm run build
```

This runs `build/pack.js` using `@electron/packager` and produces:

```
dist-pkg/PokéProductivity-darwin-arm64/PokéProductivity.app
```

The build targets **arm64** (Apple Silicon). No code-signing certificate is required — the app is ad-hoc signed automatically.

> **Note:** The project uses `@electron/packager` instead of `electron-builder`. electron-builder v24 writes an incorrect `ElectronAsarIntegrity` hash that causes Electron 32 to silently abort before `app.ready`.

## Project structure

```
pokeproductivity/
├── main.js              # Electron main process: IPC handlers, window factories, sprite protocol
├── preload.js           # contextBridge — exposes electronAPI to renderer windows
├── lib/
│   ├── storage.js       # Read/write settings, progress, and tasks (userData)
│   └── cache.js         # Download and cache sprites/portraits from PMDCollab
├── src/
│   ├── pet/             # Pet window (walking sprite, Pomodoro overlay)
│   │   ├── index.html
│   │   ├── style.css
│   │   ├── pet.js       # Animation state machine, walk AI, drag, celebrations
│   │   ├── animator.js  # Spritesheet frame stepper
│   │   ├── loader.js    # Sprite/portrait fetch + AnimData.xml parser
│   │   ├── config.js    # Runtime settings access
│   │   └── pomodoro.js  # Pomodoro overlay logic
│   ├── tasks/           # Tasks panel window
│   │   ├── tasks.html
│   │   └── tasks.js     # Task list, add/edit/delete/duplicate, recurrence
│   └── settings/        # Settings window
│       ├── settings.html
│       └── settings.js
├── build/
│   └── pack.js          # Packaging script (@electron/packager)
├── assets/              # App icons
└── settings.json        # Default settings template
```

## Credits

Sprites and portraits from [PMDCollab/SpriteCollab](https://github.com/PMDCollab/SpriteCollab), licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).
