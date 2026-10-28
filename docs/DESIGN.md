# Takes — design system

The tokens and primitives live in `apps/web/src/styles/tokens.css`. Use them; don't add new colours, fonts or one-off shadows in components.

## Direction
The app should feel like a quiet tournament hall: warm charcoal surfaces, ivory text, and one vermilion accent.
- The accent means "takes". Use it for captures, the single primary action on a screen, active navigation and focus. Never use it as decoration.
- Hierarchy comes from type first, then spacing, then (rarely) a surface.
- Most things are not boxed. Use `.panel` only for a genuinely separate object: the board frame, a side inspector, a dialog.
- Fraunces is for display: page titles and piece names. Hanken Grotesk is for all UI. JetBrains Mono is for notation only: setup strings, UCI moves, Betza, invite codes.
- Motion is functional (state change, piece moves) and stays short. It respects `prefers-reduced-motion`.
- No emoji, gradients, glassmorphism (except the sticky bars), icon-topper cards, accent rails on cards, or fake stats.

## Surfaces (commit to one per screen)
| Screen | Surface | Composition |
| --- | --- | --- |
| Play (Lobby) | Configure | One column. Choose your army, then one clear primary action per mode (vs CPU, invite, join). |
| Game | Operate | Board dominant; side rail with status, move list, captured pieces and actions. The rail stacks below on phones. |
| Builder | Configure/Operate | Board zone with a palette rail. A budget meter plus live issues; save is the single primary action. |
| Armies (Profiles) | Operate | Dense list: mini setup preview, cost and validity; row actions on hover/focus. |
| Library | Explore | Grid of piece tiles by tier, with an inspector (preview board and moves/attacks toggle). |
| Lab (Candidates) | Explore + Inspect | Filter bar, results list and an inspector pane. Verdicts are quick keys. |

## Primitives
- Buttons: `.btn`, plus `.primary`, `.ghost`, `.danger` and `.sm`. Use at most one `.primary` per view.
- Segmented control: `.segmented` containing buttons, with `aria-pressed` on the active one.
- Form fields: `.field` wrapping a label and an `.input`, `.select` or `.textarea`.
- `.chip`, with `.good`, `.warn`, `.bad` or `.accent`, for status.
- `.kv` (a `dl` grid) for key/value metrics.
- Small-caps labels use `.eyebrow`.
- Layout: `.page`, `.page-head`, `.stack`, `.row`, `.divider`, `.panel`.
- Spacing comes from the `--s-*` scale; radii from `--r-*`.

## Board
- Squares are `--sq-light` and `--sq-dark`.
- Quiet destinations are a small dot (`--mark-move`); captures are a ring (`--mark-capture`).
- Selected square and last move are tinted. Check is a red radial glow on the king.
- Coordinates sit inside the edge squares, in small type.
- Hit targets are at least 44px on touch devices.

## Phone
Below 720px the main nav becomes a bottom tab bar. Every screen must work at 390×844 with no horizontal scroll, and the board fills the width.
