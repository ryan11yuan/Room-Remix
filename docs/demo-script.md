# Hearify demo video script

A video of about 3 minutes, recorded in OBS: your screen, with a face cam of you in the corner. You talk to the camera, then put on a blindfold and explore the office room by sound alone. It's the room built on Oct 10, 2:45 AM, Best. **Say** lines are spoken to the camera. **Do** lines are actions.

## Set up the recording

1. **Two OBS scenes** (OBS Studio is already installed):
   - **Camera:** the webcam, full frame, for the opening and closing.
   - **Screen:** a Display Capture of the screen, with the webcam in the top-left corner. Keep the captions (bottom centre) and the panel (top right) uncovered.
2. **Audio:** record Desktop Audio (the app's sounds and the narrator) and your mic. If Desktop Audio comes out silent, set its device to the headphones.
3. **Test it.** Make a 10-second recording and play it back on headphones. The narrator and your voice should both be clear, and the names should come from the left and right.
4. **Frame the webcam to show your head and hands,** so viewers see you point.
5. **Wear closed headphones, L on the left,** at a volume your mic doesn't pick up.
6. **Put the browser in full screen (F11),** so the room fills the frame.

If you record the screen and the face cam separately instead, clap once on camera at the start of both, so they line up in editing.

## Before you record

1. **Restart the server with `npm run demo`, not `demo:serve`.** This rebuilds the app, so walking into the door says "door" (commit `b16b554`).
2. **Open the room.** Go to `http://localhost:8080` and open the office room. The list should read: 1 door, 2 tables, 2 TVs, 2 whiteboards. Leave it as it is; the route below was worked out with this list.
3. **Plug the headphones in before the first Start exploring.** The sound stays on the device that was plugged in when you first started.
4. **Do one blindfolded dry run of the whole route.** The lines below come from a simulation. The real numbers may differ by half a metre or a step or two, so note what the narrator actually says, and which turn works in step 4.
5. **Know where the room came from.** Its source is named `eyefultower-office1a`, which looks like Meta's public Eyeful Tower capture. If so, say "this office was captured once", not "I filmed it".

**Be upfront that you've seen this room.** You built and checked it, so viewers may think you're walking from memory. The script says so on camera. A stronger version is to record a friend who has never seen the room.

## The video

### 0:00 The problem (Camera scene, 20 s)

**Say:** "Think about walking into a room you've never been in, without being able to see it. Where's the door? Where's the table? Most blind people learn a new place by having someone walk them through it, on the day. Hearify lets them learn it the night before, at home, by sound."

### 0:20 The helper's side (Screen scene, 25 s)

**Do:** the room is open with its labels showing. Hover over a row or two in the list so their labels light up.

**Say:** "A friend films the place once on a phone. The laptop turns the video into this 3D room and finds what matters for getting around: the door, tables, TVs, whiteboards. The friend checks the list, fixes anything wrong, and adds anything it missed, like a door."

### 0:45 Blindfold on (Screen scene, 15 s)

**Say:** "Put headphones on if you can. The sound is 3D, so you'll hear exactly what I hear. I've seen this room while setting it up, so this shows what exploring it feels like. The real test is someone who's never seen it."

**Do:**
1. Put the headphones on.
2. Hover the mouse over **Start exploring**.
3. Put the blindfold on. Rest your left hand on W, A, S and D, with your thumb on Space.
4. Click.

You hear, and the captions show:

> "A room about 5 by 6 metres, with 1 door, 2 tables, 2 TVs and 2 whiteboards. You're at the starting point. The nearest door is at 8 o'clock, less than a metre. Press H for help."

### 1:00 Explore (Screen scene, 70 s)

Speak only in the gaps, so the narrator stays clear. Short remarks on what you hear make the video easy to follow.

**1. Hear the room.**
- **Do:** press Space and wait for it to finish.
- **You hear,** clockwise from straight ahead: *TV · TV · Tables · Whiteboard · Door · Whiteboard*.
- **Say:** "TVs in front of me, the table on my right, and the door behind me on the left."

**2. Walk to the TV.**
- **Do:** press Tab until you hear "TV".
  - It takes four presses: Door, Whiteboard, Table, then "TV, 12 o'clock, about 5 metres."
- **Do:** press Enter, then hold W.
  - A pulse plays from the TV and speeds up as you get closer.
  - After about 8 steps: a chime, then "You're at the TV."
- **Say:** "The pulse is getting faster… and I'm there."

**3. Find the way back to the door.**
- **Do:** press Tab until you hear "Door". You hear "Door, 6 o'clock, about 4 metres."
- **Do:** press Enter. Press D six times to turn round, one clock hour each, then hold W.
  - After about 7 steps: "You're at the door."
- **Say:** "Six o'clock means right behind me, so I turn round."

**4. Touch it.**
- **Do:** press D once, since the door is just to your right. Then hold W until you bump.
- **You hear:** a thud, then "door".
  - If you hear "wall", use the turn that worked in your dry run.

### 2:10 The reveal (Screen scene, 20 s)

**Say** (still blindfolded): "The TVs should be behind me, back the way I came." Point over your shoulder.

**Do:**
1. Take the blindfold off.
2. Click **Stop exploring**.
3. Drag the view round to the TVs.

**Say:** "Everything I just did, I did by ear."

### 2:30 How it works, and what's next (Camera scene, 30 s)

**Say:**
- "It all runs on this laptop, with free, open-source tools. COLMAP and OpenSplat turn the video into the 3D room. OWL-ViT finds the objects. The browser's 3D audio puts each voice where the thing is."
- "There's research behind the idea. Blind people who learned a building's layout from an audio game could then find their way through the real building."
- "We haven't tested Hearify with blind users yet. That's our next step, with an orientation and mobility instructor. After that, whole buildings: a school, a clinic, a first day at work."
- "Hearify: film a place once, so someone who can't see it knows it before they arrive."

## Editing

- **Add a title card** at the start: "Best with headphones".
- **Never speed up the app's audio.** Speeding it up changes the voices' pitch. You can cut part of the walking instead.
- **Retakes:** Stop exploring, then Start exploring, puts you back at the start.
- **For a 2-minute cut:**
  - cut the helper's side down to one sentence;
  - skip step 4 (touch it);
  - shorten the close to its last two lines.

## If something goes wrong

| What happens | What to do |
|---|---|
| No sound, but the captions move | The headphones went in after the first Start exploring. Reload the page, open the room and start again. |
| "Couldn't load the voices." | Check that the `npm run demo` terminal is still running, then reload. |
| The voice clips play but the narrator is silent | Reload the page and retake. |
| You get lost or keep bumping | Press Escape, Tab to the target again and press Enter. Or retake from the start. |
| Your voice covers the narrator | Retake that part, and speak only in the gaps. |
| The recording has no app sound | Set OBS's Desktop Audio device to the headphones. |

## Questions judges may ask

Keep these ready in case there's a Q&A after the video.

- **"Why not just describe the room to them?"** A description helps too. Hearify makes one from a video without anyone writing it, and walking around a room builds a better mental map than hearing it read out.
- **"Does it actually help blind people?"** We don't know yet, because nobody blind has tried it. The audio-game research suggests learning a layout by sound carries over to the real place, and testing with blind users is the next step.
- **"You'd already seen the room."** Yes, so the video shows what exploring by sound feels like, not proof that it works. That proof needs someone who has never seen the room.
- **"How accurate is it?"** The distances are approximate, because the scale assumes the phone was held about 1.5 m up. Anything moved after filming, like chairs, is out of date.
- **"Is it for finding your way on the day?"** No. It's for rehearsing beforehand. It doesn't replace a cane or a guide.
- **"What if it misses the door?"** The helper adds it by hand. A missed door is safer than a wrong one.
- **"How long does a room take?"** A Quick build of a 43-second video took under 5 minutes on this laptop.
- **"Does anything go to the cloud?"** No. Everything runs on this laptop, and every tool is free and open source.
