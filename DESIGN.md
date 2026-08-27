# CMVNG — Design System ("CLEAR BLUE")

> Design law for the app. Every screen, component, and share card must
> conform. This replaces any earlier design direction (the pale "instrument"
> look and the dark terminal look are both retired).

## The reference
The visual model is the fomo crypto app's *cleanliness*, rebuilt light +
shades-of-blue. Taken from fomo: one thing per glance (usually one large
number); enormous whitespace; soft rounded cards floating on a tinted
background with gentle shadows; big friendly sans-serif in medium/bold
weights; one vivid accent used with discipline; real app furniture (nav bars,
coin rows, sticky actions, pills) that feels like a polished consumer product.
NOT taken: its darkness. CMVNG is light.

## Palette — light, shades of blue (locked)
```
--bg        #EEF3FA  app backdrop (soft blue-grey, never pure white)
--card      #FFFFFF  cards float white on the bg
--card-2    #F4F8FD  inset fills, secondary panels, chart areas
--line      #E4ECF6  soft hairline borders
--ink       #0E1B33  primary text + big numerals (never pure black)
--ink-2     #5A6B87  secondary text
--ink-3     #93A2BC  captions, tertiary, muted labels
--blue      #2E6BF0  primary actions, key highlights, target marker
--blue-press#2559D0  pressed/active
--blue-soft #DBE7FE  accent-tint backgrounds (pills, chips, delta badge)
--blue-ring rgba(46,107,240,0.16) focus ring
--up        #12B76A  gain figures only
--down      #F0442E  loss figures only
```
Amber #F7A23B may appear ONLY as a mid-scenario bar color between loss-red
and target-blue — nowhere else. Any other hue = the design is wrong.

## Typography
Plus Jakarta Sans everywhere (400/500/600/700). No other family, no
monospace. Hero numeral: 56–60px w700, tabular-nums, letter-spacing -0.02em,
--ink — the loudest thing on any screen. Card stat values: 22–24px w700
tabular. Section labels: 12px w600 --ink-3 (may be UPPERCASE eyebrow with
letter-spacing 0.06em). Body: 13–14px w400–500 --ink-2, lh ~1.55. Every
figure tabular; round everything.

## Shape, depth & spacing
Cards: radius 20–26px, white, 1px solid #fff top edge, shadow
`0 10px 30px -20px rgba(30,60,120,.3)` — gently floating. Pills/chips fully
rounded (100px): --blue filled (white text) or --blue-soft tint (blue text) —
pills are welcome here. Buttons: radius 16–18px, w700 15px; primary --blue
filled with glow `0 12px 26px -8px var(--blue)`, presses down 2px; secondary
white + --line border + --blue text. 18–26px card padding, 14–16px gaps.
Slightly empty is correct. Backdrop always clean --bg.

## Signature moments
1. **Hero number block** — caption ("If Bitcoin reaches $156,000") → one
   giant tabular numeral → rounded --blue-soft delta badge ("↑ +$5,000 ·
   +50%") → one plain-language line. Massive air. Counts up once ≤600ms
   ease-out; respect prefers-reduced-motion.
2. **Scenario bars** — the stress test as clean horizontal bars: label left,
   soft track, colored fill (loss-red → warm → neutral → --blue target →
   --up upside), value right. Spacious rows.
3. **Three-cell reality check** — worst / median / best as three soft
   --card-2 cells with big colored numerals under one --blue verdict pill.
4. **Two-up stat cards** — paired big stats (avg entry · vs lump sum) in
   white rounded cards.

## Brand assets
**Logo**: blue offset-bars mark + lowercase "cmvng" wordmark. Header: mark
(bars) small top-left, dark-ink wordmark on bg/white. Clear space = bar
height. Never stretched/recolored outside the blue family, never on busy
backgrounds.
**Green character (mascot)**: brand personality — GREEN in a BLUE UI, so
deliberate use only. ALLOWED: default share-card avatar; about/intro moment;
loading and empty states (e.g. "no saved plans yet"); small mascot corner on
the share card's plan format. NOT ALLOWED: full-screen backgrounds; behind
any text or data; recolored or stretched. It appears where it can be admired,
never where it competes with information.

## Motion — gentle and functional only
Allowed: hero count-up (once ≤600ms); value cross-fade on scenario switch;
button press (translateY 2px); soft card entrance (fade + 12px rise); subtle
logo-bar accent. Banned: looping/bouncing/floating/shimmering/parallax.
Honor prefers-reduced-motion (disable count-up + entrances).

## Share cards — 1200×675 / 1080×1080 / 1080×1920
Soft --bg or white ground, one giant --ink tabular hero numeral, --blue-soft
delta badge, coin logo, optional green character as avatar/mascot corner,
--ink-3 footer "scenario simulation · not financial advice · cmvng".
Preserve all working card mechanics (proxied logo loading, circular PFP
clip, profit-sign color rule, exact dimensions). Clean and friendly.

## Accessibility
Never meaning by color alone (bars carry labels + values; gain/loss carry
+/− signs). Focus = --blue-ring outline. Semantic buttons, real labels,
aria; charts get aria-label + stat-number text fallback. --ink on bg/white
and white on --blue pass AA.

## The taste test (before shipping any screen)
1. ONE clear focus with real whitespace? 2. Biggest thing a number?
3. Only the one blue accent (+ semantic P/L)? 4. Cards soft, floating,
friendly — not severe or dense? 5. Green character OUT of backgrounds and
off data? 6. Could it be a generic AI/crypto template? Then simplify: fewer
elements, more air, one accent.
