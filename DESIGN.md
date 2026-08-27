# INSTRUMENT — CMVNG design system (design law)

Instrument-grade editorial: severe, typographic, precise (Mercury, Bloomberg
Terminal, Braun, Swiss financial annual report). The data IS the decoration.

**The one rule: when in doubt, delete it.** Decorative ≠ informational → it
does not ship. Slightly too empty is correct; "designed" is wrong.

## Banned everywhere
Gradients. Drop shadows / glows / blurs / neon (only depth cue: hairline
border). Pill chips/badges/tag bubbles (single exception below). Card-in-card
nesting (max ONE border between page and any datum). Coin illustrations,
mascots, 3D, isometric, flags, clipart, **emoji**, decorative icons. Colored
backgrounds on large surfaces. Font weights above 500 (only 400 and 500
exist). Title Case / ALL CAPS prose (sentence case; mono labels are the
lowercase exception). Decorative animation (incl. anything looping, pulsing,
bouncing, shimmering).

## Color tokens (the entire palette — never add a hue)
```
--ink       #0A1526   primary text, hero numerals, the black action bar
--ink-2     #5C6E8A   secondary text, row labels
--ink-3     #8A94A6   tertiary, captions, staleness
--paper     #FCFDFE   page + surface background
--paper-2   #EFF5FC   faint fill under chart area ONLY (+ the one pill bg)
--line      #E2E8F1   default hairline border
--line-2    #EFF3F8   faint inner divider between table rows
--blue      #185FA5   single accent: target point, one link, logo dot
--blue-deep #0C447C   target numeral, chart price line, pill text
--blue-soft #85B7EB   avg-entry dashed rule, minor ticks
--gain      #0E7A4F   gain figures only (never decoration)
--loss      #B3362B   loss figures only
--loss-deep #8A2A22   the −50% severe marker
```

## Typography — the numeral is the interface
- Sans: existing system/Inter stack. Mono: ui-monospace stack.
- Hero result numeral: 56–64px, weight 500, letter-spacing -0.045em,
  line-height 1, tabular-nums, --ink. Loudest thing on the screen by far.
- Secondary figures (spec rows): mono 13px --ink, right-aligned, tabular.
  EVERY displayed number uses tabular figures.
- Section labels: mono 11px, letter-spacing 0.05em, lowercase, --ink-3
  (e.g. `price path · 90d sample`, `outcome ruler`). They whisper.
- Body/helper: sans 13px weight 400 --ink-2, line-height 1.6.
- Round every displayed number; no float artifacts.

## Layout & structure
- Hairline system only: sections separated by 0.5px solid --line, never boxes.
  Table rows divide with 0.5px solid --line-2.
- Corners 0–2px. Data never sits in rounded cards. No pills except the one.
- 16–22px section padding; whitespace does the work borders used to.
- Mobile-first single column (~352px content baseline). Label-left /
  mono-figure-right tables. No horizontal scroll ever.
- Primary action: single full-width flat black bar (--ink bg, white 500 text,
  square). Secondary beside it on --paper with hairline. One primary/screen.

## Signature components
1. **Hero numeral block** — mono caption ("if bitcoin reaches $156,000") →
   giant tabular ink numeral → one line `+$5,000 · +50% · a scenario, not a
   forecast` with the gain figure in --gain. Nothing else.
2. **Outcome ruler (`ScenarioRuler`)** — replaces all scenario cards. One
   horizontal hairline axis worst→best. Each scenario = small diamond marker
   (outline non-target; solid --ink target; downside --loss, upside --gain).
   Label + $value stacked at each marker, 11px. Pure hairline + markers.
3. **Buy barcode (`BuyBarcode`)** — DCA schedule as evenly spaced vertical
   ticks on a baseline under the price path. Filled --blue ticks = buys made,
   one taller --ink tick = "you are here", --ink-3 ticks = remaining.
4. **Price path** — one --blue-deep line, faint --paper-2 area fill, dashed
   --blue-soft avg-entry rule. No dots except active tooltip. --line gridlines.
5. **Spec sheet** — label-left / mono-value-right list divided by --line-2
   hairlines. Like a component datasheet.

## The one permitted flourish
Reality Check verdict label (`modest`/`moderate`/`ambitious`/`extreme`): a
single understated pill — --paper-2 bg, --blue-deep text, 12px. The ONLY pill.

## Motion — functional only
Allowed: value cross-fade on scenario switch; tooltip on hover/tap; ONE
count-up on results reveal (≤400ms ease-out); hairline focus ring. Banned:
loops, bounces, pulses, shimmer. Honor prefers-reduced-motion (disable
count-up and cross-fades).

## Share cards (1200×675, 1080×1080, 1080×1920)
--paper ground, one giant --ink result numeral, the outcome ruler OR price
path + barcode as the single graphic, mono technical footer
(`scenario simulation · not financial advice · cmvng`). Preserve working card
mechanics (coin logo via proxy, PFP clip, profit-sign color). No
illustrations, no gradients.

## Accessibility (part of the design)
Never encode meaning by color alone (ruler markers labeled in text; gain/loss
carry +/− signs). Visible hairline focus ring. Semantic buttons, real labels,
aria. Charts get aria-label summary + text fallback (spec-sheet numbers).

## The taste test (before every UI commit)
1. Could this be a generic AI/crypto template? → strip more.
2. Any decorative element? → delete it.
3. Is the biggest thing on screen a number? It must be.
4. More than the allowed colors? → remove the hue.
5. Instrument or poster? Must be an instrument.
