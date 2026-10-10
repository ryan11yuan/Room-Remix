# Hearify demo script

A 3-minute demo with one blindfolded judge, in the office room (the room built on Oct 10, 2:45 AM, Best). **Say** lines are spoken aloud. **Do** lines are actions.

## Before the judges arrive

1. **Restart the server with `npm run demo`, not `demo:serve`.** This rebuilds the app, so walking into the door says "door" (commit `b16b554`).
2. **Open the room.** Go to `http://localhost:8080` and open the office room. The list should read: 1 door, 2 tables, 2 TVs, 2 whiteboards. Leave it as it is; the route below was worked out with this list.
3. **Plug the headphones in before the first Start exploring.** The sound stays on the device that was plugged in when you first started. Put the L side on the left ear, or every direction comes out mirrored.
4. **Do one dry run yourself, blindfolded, along the whole route below.** The lines below come from a simulation. The real numbers may differ by half a metre or a step or two, so note what the narrator actually says.
5. **Have ready:** a blindfold (a sleep mask or scarf works), the headphones, and a chair at the laptop.
6. **Know where the room came from.** Its source is named `eyefultower-office1a`, which looks like Meta's public Eyeful Tower capture. If so, say "this office was captured once" rather than "we filmed it".

**Roles:** you narrate and coach. A teammate at the laptop, if you have one, clicks Start exploring and resets between judges.

## The demo

### 0:00 The problem (20 s)

**Say:** "Think about walking into a room you've never been in, without being able to see it. Where's the door? Where's the table? Most blind people learn a new place by having someone walk them through it, on the day, often with people watching. Hearify lets them learn it the night before, at home, by sound."

### 0:20 The helper's side (25 s)

**Do:** the room is open with its labels showing. Hover over a row or two in the list so their labels light up.

**Say:** "A friend films the place once on a phone. The laptop turns the video into this 3D room and finds what matters for getting around: the door, tables, TVs, whiteboards. The friend checks the list, fixes anything wrong, and adds anything it missed, like a door."

### 0:45 Blindfold on (15 s)

**Do:**
1. The judge sits at the laptop and puts on the blindfold, then the headphones.
2. Guide their left hand onto W, A, S and D, with their thumb on Space.
3. Let them feel where Tab and Enter are.

**Say** (to the audience): "You can't hear what they hear, so the captions at the bottom show it."

**Do:** press **Start exploring**. They hear:

> "A room about 5 by 6 metres, with 1 door, 2 tables, 2 TVs and 2 whiteboards. You're at the starting point. The nearest door is at 8 o'clock, less than a metre. Press H for help."

### 1:00 Explore (70 s)

**1. Hear the room.**
- **Say** (to the judge): "Press Space, then wait for it to finish."
- They hear, clockwise from straight ahead: *TV · TV · Tables · Whiteboard · Door · Whiteboard*.
- **Say** (to the audience): "Each name comes from where that thing really is in the room."

**2. Walk to the TV.**
- **Say** (to the judge): "Press Tab until you hear 'TV'."
  - It takes four presses: Door, Whiteboard, Table, then "TV, 12 o'clock, about 5 metres."
- **Say:** "Press Enter, then hold W."
  - A pulse plays from the TV and speeds up as they get closer.
  - After about 8 steps: a chime, then "You're at the TV."

**3. Find the way back to the door.**
- **Say:** "Press Tab until you hear 'Door'." They hear "Door, 6 o'clock, about 4 metres."
- **Say:** "Press Enter. It's behind you, so press D six times to turn round. Each press is one hour on the clock. Then hold W."
  - After about 7 steps: "You're at the door."

**4. Touch it (if there's time).**
- Coach from the screen: "D once." Keep going until the door label is roughly straight ahead.
- **Say:** "Now W." They hear a thud, then "door".

### 2:10 The reveal (25 s)

**Say** (the judge is still blindfolded): "Without peeking, point to the TVs."
- The right answer is behind them, back the way they came.

**Say:** "Take the blindfold off."

**Do:** press **Stop exploring** and drag the view round to the TVs, so the judge can see they're where they pointed.

**Say:** "You've never seen this room. Two minutes ago you didn't know it existed, and you just found the door on your own, by ear."

### 2:35 How it works, and what's next (25 s)

**Say:**
- "It all runs on this laptop, with free, open-source tools. COLMAP and OpenSplat turn the video into the 3D room. OWL-ViT finds the objects. The browser's 3D audio puts each voice where the thing is."
- "There's research behind the idea. Blind people who learned a building's layout from an audio game could then find their way through the real building."
- "We haven't tested Hearify with blind users yet. That's our next step, with an orientation and mobility instructor. After that, whole buildings: a school, a clinic, a first day at work."
- "Hearify: film a place once, so someone who can't see it knows it before they arrive."

## If something goes wrong

| What happens | What to do |
|---|---|
| No sound, but the captions move | The headphones went in after the first Start exploring. Reload the page, open the room and press Start exploring again. |
| "Couldn't load the voices." | Check that the `npm run demo` terminal is still running, then reload. |
| The voice clips play but the narrator is silent | Read the captions aloud for them. |
| The judge keeps bumping into things | "Press Escape." Then Tab to the target again and press Enter. You can also press the keys for them. |
| The judge walks away from the pulse | "It's behind you. Press D to turn, one clock hour at a time." |
| Next judge | Press Stop exploring, then Start exploring. It always starts again from the beginning. |

## A 2-minute version

- Cut the helper's side down to one sentence.
- Skip step 4 (touch it).
- Shorten "how it works" to the last two lines.

## Questions judges may ask

- **"Why not just describe the room to them?"** A description helps too. Hearify makes one from a video without anyone writing it, and walking around a room builds a better mental map than hearing it read out.
- **"Does it actually help blind people?"** We don't know yet, because nobody blind has tried it. The audio-game research suggests learning a layout by sound carries over to the real place, and testing with blind users is the next step.
- **"How accurate is it?"** The distances are approximate, because the scale assumes the phone was held about 1.5 m up. Anything moved after filming, like chairs, is out of date.
- **"Is it for finding your way on the day?"** No. It's for rehearsing beforehand. It doesn't replace a cane or a guide.
- **"Why headphones?"** The sense of direction comes from 3D audio, which needs one sound for each ear.
- **"What if it misses the door?"** The helper adds it by hand. A missed door is safer than a wrong one.
- **"How long does a room take?"** A Quick build of a 43-second video took under 5 minutes on this laptop.
- **"Does anything go to the cloud?"** No. Everything runs on this laptop, and every tool is free and open source.
