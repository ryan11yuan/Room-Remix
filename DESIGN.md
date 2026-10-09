---
name: Hearify
description: Film a place once. Someone who can't see it can explore it by sound.
colors:
  walnut: "#100904"
  bark: "#382416"
  cork: "#40372e"
  driftwood: "#6c5f51"
  cream: "#ffedd7"
  ember: "#dc5000"
  data-target: "#5fd4c4"
typography:
  wordmark:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(64px, min(13.5vw, 21svh), 208px)"
    fontWeight: 500
    lineHeight: 0.9
    letterSpacing: "normal"
    fontFeature: "\"ss01\" on, \"cv11\" on"
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "51px"
    fontWeight: 500
    lineHeight: 0.9
    letterSpacing: "normal"
    fontFeature: "\"ss01\" on, \"cv11\" on, \"tnum\" on"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "41px"
    fontWeight: 500
    lineHeight: 0.9
    letterSpacing: "normal"
    fontFeature: "\"ss01\" on, \"cv11\" on"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1.09
    letterSpacing: "normal"
    fontFeature: "\"ss01\" on, \"cv11\" on"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "29px"
    fontWeight: 400
    lineHeight: 1.26
    letterSpacing: "normal"
    fontFeature: "\"ss01\" on, \"cv11\" on"
  voice:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
    fontFeature: "\"ss01\" on, \"cv11\" on"
  ui:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "normal"
    fontFeature: "\"ss01\" on, \"cv11\" on"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
    fontFeature: "\"ss01\" on, \"cv11\" on"
  micro:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
    fontFeature: "\"ss01\" on, \"cv11\" on"
rounded:
  card: "12px"
  ghost: "22.5px"
  pill: "36px"
  full: "9999px"
spacing:
  stack: "12px"
  page-x: "16px"
  page-x-wide: "24px"
  gutter: "18px"
  card: "20px"
  rail: "56px"
  section-top: "112px"
components:
  button-primary:
    backgroundColor: "{colors.bark}"
    textColor: "{colors.cream}"
    typography: "{typography.ui}"
    rounded: "{rounded.pill}"
    padding: "14px 24px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.walnut}"
  button-ghost:
    textColor: "{colors.cream}"
    typography: "{typography.label}"
    rounded: "{rounded.ghost}"
    padding: "7.5px 18px"
    height: "44px"
  button-ghost-hover:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.walnut}"
  button-ghost-pressed:
    backgroundColor: "{colors.cream}"
    textColor: "{colors.walnut}"
  card:
    backgroundColor: "{colors.walnut}"
    textColor: "{colors.cream}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  option:
    textColor: "{colors.cream}"
    typography: "{typography.ui}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
    height: "44px"
  option-checked:
    backgroundColor: "{colors.bark}"
    textColor: "{colors.cream}"
  nav-link:
    textColor: "{colors.cream}"
    typography: "{typography.label}"
    height: "44px"
  room-row:
    textColor: "{colors.cream}"
    typography: "{typography.title}"
    padding: "20px 8px"
  room-row-hover:
    backgroundColor: "{colors.bark}"
  progress-track:
    backgroundColor: "{colors.cork}"
    height: "2px"
  progress-fill:
    backgroundColor: "{colors.cream}"
    height: "2px"
  keycap:
    textColor: "{colors.cream}"
    typography: "{typography.micro}"
    rounded: "{rounded.full}"
    padding: "6px 10px"
  credit-line:
    textColor: "{colors.ember}"
    typography: "{typography.label}"
  data-chip:
    backgroundColor: "{colors.walnut}"
    typography: "{typography.micro}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
---

# Design System: Hearify

## Overview

**Creative North Star: "The Darkroom Plinth"**

The room the maker filmed is the object on display, and the interface is the gallery around it: a warm walnut void, cream museum labels, nothing lit but the room. Pages are tall and sparse, one idea per viewport, with type set large and uppercase like captions on a gallery wall. On the home page the newest room's live Gaussian splat sits on a sticky plinth behind the first two sections. It is graded so its whites print as cream, and a vignette closes in on it as the visitor scrolls, until the room sits alone in the dark.

The world is the ORYZO darkroom product-editorial reference the user pinned, adapted for a live 3D subject and a free-tools-only rule. Inter (self-hosted variable) stands in for the paid Halyard Display. A mixed-case "voice" at 18px carries instructions alongside the 29px description. Walnut scrims and the vignette keep cream type legible over a moving, sometimes bright room. Secondary text is cream at 70%, because driftwood fails contrast for text. Depth is tonal and never shadowed, and all motion follows one metaphor: things develop out of the dark like a print in the tray.

Scope: the system covers every surface under the darkroom root, meaning the home page sections, the full-screen viewer, its explore panel and its captions.

**Key Characteristics:**
- Warm near-monochrome: walnut canvas, cream ink, bark for the one filled action, ember rationed to credit lines.
- Uppercase weight-500 labels with no tracking; mixed-case weight 400 only for sentences meant to be read.
- One filled pill per section or panel; every other action is a 1px cream ghost or an underlined text link.
- Dashed cork hairlines as the only divider; 1px strokes throughout.
- No shadows: depth comes from the walnut-to-bark step and translucent walnut scrims.
- Rooms develop on arrival: from 18px blur and 60% brightness to sharp, on the develop ease.

## Colors

A restrained warm monochrome: a ladder of browns from walnut to cream, one filled bark, and an ember kept for credits.

### Primary
- **Bark** (#382416): the only filled surface above walnut. It fills the one primary pill of a section, the checked quality option, a hovered room row (at 50%), inline code chips, and the text selection. Cream on bark is 12.8:1.

### Secondary
- **Ember Credit** (#dc5000): credit lines only. That means the pipeline tool names in the reveal (ffmpeg, COLMAP, OpenSplat, Spark) and the "Built with ... after Memento" line in the rooms footer and on the builder-not-running page. At 4.9:1 on walnut it is only ever set at label size as a short credit.

### Neutral
- **Walnut Void** (#100904): the page canvas, the clear color of both 3D scenes (hero and viewer), the browser theme color, and every scrim. Over the live room it is translucent: 75% for hero cards, 80% for the explore panel and 3D chips, 90% for the drop target, and 40 to 88% in the gradients.
- **Darkroom Cream** (#ffedd7): all type (17.3:1 on walnut), the ghost button line, the current and checked borders, the progress fill, the focus ring, and the hover fill of both button kinds. It is also the warm grade laid over the 3D room in multiply.
- **Cream at 70%** (renders near #b7a998, 8.6:1 on walnut): the secondary text tone for dates, serial numbers, quality names, counts, help lines and the viewer's room title. A single 60% step (6.5:1) marks upcoming build steps.
- **Cork Hairline** (#40372e): dashed rules, card and option borders, the progress track and the scrollbar thumb. Structure only (1.7:1).
- **Driftwood** (#6c5f51): structure only: the walls of the room sketch and the hover border of an unchecked quality option.

### Data (viewer labels only)
- **Target Teal** (#5fd4c4): the one highlighted 3D chip: the row the helper points at in check mode, or the explorer's current target.

### Named Rules
**The Ember Credit Rule.** Ember is the color of a name being credited. If the text is not crediting a tool or a source, it is not ember: never an action, a state, a heading or a paragraph.

**The Driftwood Is Structure Rule.** Driftwood draws lines and never sets type; at 3.2:1 on walnut it fails text contrast. Secondary text is cream at 70%.

**The Data-Only Hue Rule.** Teal marks the highlighted object in the viewer. It never colors chrome, buttons or headings, and never appears on the home page.

## Typography

**Display Font:** Inter Variable, self-hosted (standing in for Halyard Display), with ui-sans-serif, system-ui, sans-serif
**Body Font:** Inter Variable, the same face
**Label/Mono Font:** none; labels use the same face

**Character:** one neo-grotesque at a single weight carries everything, with stylistic set 1 (open digits) and cv11 (single-storey a) switched on. Hierarchy comes from size and case alone, never from a second family or a bold.

### Hierarchy
- **Wordmark** (500, clamp(64px, min(13.5vw, 21svh), 208px), 0.9): the stacked ROOM / REMIX in the hero. The one size off the scale; there is only one of it.
- **Display** (500, 51px, 0.9, tabular): the upload and build percentage. From lg it grows to 96px, an off-scale value used only for that counter.
- **Headline** (500, 41px, 0.9): section headings ("Import a video.", "Your rooms.", "It isn't just a video."), the drop target, the builder-not-running heading.
- **Title** (500, 24px, 1.09): card headings, build status lines, room times in the list, the viewer's loading message, the explore panel's headings.
- **Body** (400, 29px, 1.26, mixed case): the one description per section, held to 11em in the hero and 24ch in the import.
- **Voice** (400, 18px, 1.3, mixed case): instructions people follow: the filming tips, the quality details, the fix and retry hints, the empty-state line.
- **UI** (500, 14px, 1.1, uppercase): pill text, the brand mark in the nav and viewer, small sub-headings ("How to film"), loading lines.
- **Label** (500, 12px, 1.2, uppercase): nav items, ghost buttons, metadata, day headers, credits, key hints, the explore panel's section names and readouts.
- **Micro** (500, 10px, 1.2, uppercase): the vertical serial on the right edge, keycaps, the "Done" mark on a build step, the 3D chips.

### Named Rules
**The Museum Label Rule.** Every darkroom string is uppercase at weight 500 with no tracking (letter-spacing normal). Buttons, inputs and selects inherit the case instead of resetting it.

**The Voice Rule.** Mixed case at weight 400 is reserved for sentences a person reads rather than scans: one description per section at 29px, and instructions at 18px. The explore panel's terse help lines drop it to 12px; the explore captions use it at body size. Labels, buttons and headings never use it.

**The Tabular Numbers Rule.** Serials, times and percentages use tabular figures so lists and counters do not jitter. Serials are two digits, zero-padded (01, 02), and the oldest room is 01.

## Layout

The home page is one long scroll of full-height sections (each at least the small viewport height): the hero and the reveal share the plinth, then the import and the rooms list sit on solid walnut. From lg, content sits on a 12-column grid with an 18px gutter; below lg it is a single column. The hero and the reveal put the heading on the left and the description on the right, leaving the middle for the room (the reveal uses three columns at each edge). The import puts its heading, description and controls in the left six columns and the filming tips in five on the right.

Page gutters are 16px, 24px from sm. From md every section keeps a 56px right rail, which clears the vertical serial (micro type, vertical writing mode, fixed 12px from the right edge, centred, hidden below md). Sections open 112px from the top to clear the fixed nav (the hero 96px). Inside components the rhythm runs on a 4px base, mostly 12px stacks, 16 to 24px between groups, and 40px between a heading and its controls. Density is low: a viewport carries one heading, one description and at most one card or list.

The top nav is fixed and pointer-transparent except for its links: the brand at UI size on the left, three section links at label size on the right (20px apart, 32px from sm), over a walnut gradient that fades from 80% to clear. The viewer is a fixed full-screen layer with chrome pinned to its corners: the Back ghost and room title top left, key hints bottom left (capped at 62% width from lg), the 300px explore panel top right, and the captions bottom centre while exploring. Every control keeps a 44px minimum target. The portrait breakpoint (aspect ratio 1:1 or narrower) reshapes the vignette, the drop hint appears only with a fine pointer, and below lg the page keeps a 12rem bottom scroll padding.

## Elevation & Depth

The system is flat: nothing casts a shadow. Depth comes from a two-step surface stack (walnut, then bark), from translucent walnut over the live room, and from light itself: the room is graded and vignetted so it reads as the only lit object in the void.

### Depth Vocabulary
- **Panel over the room** (walnut at 75 to 80%, 1px cork border): the hero's cards, the explore panel, the 3D chips.
- **Nav scrim** (walnut 80% to clear, top down): under the fixed nav.
- **Viewer shades** (walnut 85% to clear, a 144px band at the top and a 160px band at the bottom): where the viewer's labels sit.
- **Hero side scrim** (from md: walnut 85% at the right edge, 40% at 28%, clear by 45%): under the hero description.
- **Reveal scrim** (from lg: walnut 88% at both edges, 35% at a third in, clear across the centre; below lg a flat 55% wash): under the reveal's heading and line. The credit row sits on a further 40%.
- **Vignette**: a radial ellipse that is clear at the centre and walnut at the edges. It tightens as the scroll progress (0 to 1) moves from hero to reveal, and its edge darkens from 60 to 90%. Top and bottom linear bands add 70% and 85%. Portrait screens get a wider, flatter ellipse.
- **Print grade**: a full cream layer in multiply over the hero room, then walnut at 15%, so the brightest wall stays under cream type.

### Named Rules
**The No-Shadow Rule.** No box-shadow, drop-shadow or glow, anywhere. A surface that needs to rise steps from walnut to bark, or gains a cork line.

**The Scrim Is Where Type Sits Rule.** A walnut gradient is added only under type that sits over the live room. It is legibility, not decoration, and the centre where the room stands stays clear.

**The Print Grade Rule.** A room shown behind type is graded in cream multiply plus a 15% walnut step-down. In the viewer the room is the content, so it shows ungraded with only the corner shades.

## Shapes

Corners come in four steps: gently rounded cards (12px) for every container, option, drop target and inline code chip, and fully round ends (9999px) for keycaps, 3D chips, the build-step dots (8px) and the quality radio dot (12px). Buttons carry their own radii, 36px for the pill and 22.5px for the ghost. At the 44px minimum height both render as full stadiums, so for now the two values differ in name only.

Every line is 1px. Solid lines are borders of things: cork around cards and options, cream around ghosts and checked or hovered surfaces. Dashed lines are dividers and drawn paths: the cork rule between items, the cream underline under the current nav section, the cream border of the full-screen drop target, and the lap drawn on the floor of the room sketch (a 3/5 dash at 70% cream). The room sketch is the one illustration: an open isometric box in 1px driftwood with a window and a door, the camera's lap dashed on the floor and the camera as a cream dot.

### Named Rules
**The Dashed Hairline Rule.** The only divider is a 1px dashed cork rule above the item it separates. Never a solid divider, a filled band or a gap pretending to be a line.

**The One Icon Rule.** The only icon is the hairline arrow: 14px, 1.25 stroke, square caps, pointing left, right or down. Status uses small circles. No icon library, no glyph icons.

## Components

### Buttons
Quiet until touched; touch develops them to cream.
- **Shape:** stadium (36px pill, 22.5px ghost), 44px minimum height.
- **Primary (pill):** bark fill, cream UI-size type, 14px by 24px padding, 10px gap to a trailing arrow. One per section or panel: the hero card's "Enter the room", the import's "Import a video", "Try again" after a failure. The explore panel's single pill is Start exploring.
- **Hover / Focus:** both kinds fill with cream and turn their type walnut over 240ms on the develop ease. Focus is a 1px cream outline 3px out, on every control; a file input or radio wrapped in a label shows the ring on the label.
- **Secondary (ghost):** a 1px cream line, no fill, label-size type, 7.5px by 18px padding: Cancel, Close, Back, Add an object, Remove, Stop exploring.
- **Disabled:** 40% opacity, no hover change.
- **Text link:** cream, underlined 1px at a 4px offset, for an inline action inside a sentence.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** walnut at 75% over the room (80% for the explore panel); none on a solid walnut section.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px cork. A card that is itself a link turns its border cream on hover over 200ms.
- **Internal Padding:** 20px; state panels (failure, builder not ready) use 24px and the hero's import link card 16px.
- **Anatomy:** a title-size heading, a dashed rule, a label line in cream 70%, then the one pill. The import link card in the hero carries the room sketch above its label and arrow.

### Inputs / Fields
- **Quality options:** a pair of radio cards (one column, two from sm). Each is a 12px card with a 1px cork border and 20px padding: the name at UI size with a 12px cream ring on the right, the detail in the 18px voice in cream 70%. Hover turns the border driftwood; checked turns it cream, fills the card bark and fills the ring.
- **File input:** hidden inside the "Import a video" pill. A file dragged anywhere over the window raises a full-screen drop target: inset 16px (24px from sm), walnut at 90%, a dashed cream 1px border on a 12px radius, and "Drop to import" at headline size.
- **Focus:** the global cream ring, carried to the wrapping label.

### Navigation
- **Style:** fixed top bar, brand at UI size on the left, section links (Intro, Import, Rooms) at label size on the right, each a 44px-tall target.
- **Current section:** marked by a 1px dashed cream underline 4px below the word, tracked from the section at the middle of the screen. Other links keep a transparent underline so nothing shifts.
- **Behavior:** in-page links scroll without writing to the URL, because the hash belongs to the viewer; scrolling is instant under reduced motion.

### Room List
- **Grouping:** newest first, grouped by day under a label-size header in cream 70%.
- **Row:** a full-width button on a dashed cork rule, with 20px of vertical padding, on a grid of serial, time, quality and Enter (from sm the quality gets its own 8rem column). The serial is label size in cream 70%, the time is title size, tabular.
- **Hover:** the row fills bark at 50% over 200ms and the arrow slides 4px right over 300ms, both on the develop ease.

### Build Progress
- **Bar:** a 2px cork track with a cream fill whose width eases over 500ms. With no measurement yet, a third-width cream bar slides across in a 1.6s loop (still under reduced motion). The viewer's loading bar is the same at 1px.
- **Counter:** the percentage at display size, tabular, above a title-size status line.
- **Steps:** a list on dashed rules at label size, each with an 8px circle: outlined for upcoming (cream 60%), filled for done (cream 70%, with "Done" in micro), cream and pulsing for the current step.

### Viewer Chrome
- **Corners:** the Back ghost with a left arrow and the brand plus room title top left; key hints bottom left.
- **Key hints:** each a keycap (fully round ends, 1px cream at 60%, micro type, 6px by 10px padding) followed by what it does at label size.
- **Explore panel:** a 300px card at walnut 80% pinned top right, scrolling within the screen height. In check mode: Room, Objects (one row per object: its number, a name select, Remove) and the Start exploring pill, separated by dashed rules. In explore mode: the heading, a one-line key reminder in cream 70%, and Stop exploring. Key hints bottom left hide while exploring.
- **Captions:** while exploring, what the narrator says (or the scan's names as they play) bottom centre in the voice style at body size, in a polite live region.
- **3D chips:** labels pinned in the room: fully round ends, walnut at 80%, a 1px cream border at 60% with cream text, or teal when highlighted, micro type, 4px by 10px padding, on one line.

### The Plinth (signature)
The newest room, live, pinned behind the hero and the reveal while they scroll over it. The room sketch holds the centre at up to 560px wide until the splat is ready, then fades out over 1.4s while the room develops in over 2.4s, from 18px blur and 60% brightness to sharp. The viewer develops its room over 1.8s. The camera sways 4.5 degrees either side over 24 seconds like an object on a slow turntable; scrolling to the reveal turns it a further 26 degrees and steps it back, and the pointer adds up to 2.5 degrees of turn and 1.5 degrees of tilt. Camera moves ease toward their target rather than snapping. Under reduced motion the room holds the video's first view and appears without developing. The scene stops drawing while it is off screen.

## Do's and Don'ts

### Do:
- **Do** set every new surface inside the darkroom root: Inter with ss01 and cv11, uppercase at weight 500, cream on walnut.
- **Do** use cream at 70% (8.6:1) for every secondary line: dates, counts, serials, help.
- **Do** give each section or panel exactly one bark pill; make every other action a 1px cream ghost or an underlined text link.
- **Do** separate list items and panel sections with the 1px dashed cork rule.
- **Do** lay a walnut scrim under any type that sits over the live room, and keep the centre clear for the room.
- **Do** grade a room shown behind type with a cream multiply layer and a 15% walnut step-down.
- **Do** keep every control at least 44px tall with the 1px cream focus ring 3px out.
- **Do** bring a room in with the develop motion (blur and dim to sharp on cubic-bezier(0.16, 1, 0.3, 1)), and drop it under reduced motion.
- **Do** use tabular, zero-padded figures for serials, times and percentages.

### Don't:
- **Don't** use box-shadow, drop-shadow or glow anywhere; step to bark or add a cork line instead.
- **Don't** use ember for anything but a credit line.
- **Don't** set text in driftwood (3.2:1 on walnut) or cork; they are structure only.
- **Don't** bring the viewer's one teal highlight into chrome or onto the home page.
- **Don't** track uppercase labels or bold them; the system has one weight for labels and one for the voice.
- **Don't** add icons beyond the hairline arrow, and don't pull in an icon library.
- **Don't** set type below the 10px micro step or in a system face; Inter is the only face on darkroom surfaces. The one exception is the footer's 8px Arial legal line, the brief's compliance voice: "this is not design, this is compliance."
- **Don't** use Tailwind's grey or neutral palette on darkroom surfaces; every tone is a walnut-to-cream token or one of them at reduced opacity.
