# Playing it over MIDI

Three ways in, in order of how much hardware they need: a controller you plug in, a virtual cable
with the sender page at the other end, or a MIDI file playing while your hands stay on the knobs.

The instrument reads notes, pitch bend and the modulation wheel, and nothing else. Velocity is read
only to tell a note on from a note off: a Model D keyboard is not velocity sensitive, so how hard a
key is struck is not information it has anywhere to put.

## First, the part everyone trips on

**The permission is asked for when you play the first key, not when the page loads.** Click a key on
screen, or press `z`, and only then does the browser ask whether the page may use your MIDI devices.
Until you do, an untouched page looks like it is ignoring your keyboard.

This is on purpose — a browser wants a gesture behind the request, and a prompt that greets you
before you have touched anything is one you have no reason to grant — but it does surprise people.

You need **Chrome, Edge, Arc or Brave**. Safari has no Web MIDI at all and will silently do nothing.
Firefox has it, but gates it harder. `localhost` counts as a secure context, so there is no need for
HTTPS while developing.

## 1. A controller you plug in

1. Plug it in. Before or after opening the page, either way: the app watches for ports appearing.
2. Open the app, `bun run dev`, and play one key on screen.
3. Allow the permission.
4. Play. Notes from F1 to C5 sound. Anything outside those 44 keys is dropped rather than folded
   into range, so the far ends of an 88-key controller are silent by design.

Your bend wheel moves the PITCH wheel on the panel and your mod wheel moves MOD. Watch them move.

**The mod wheel is part of a patch**, so moving it marks the draft unsaved, exactly as dragging it
on screen does. The pitch wheel is sprung and is never stored, so it cannot.

## 2. No hardware: a virtual cable

macOS has one built in. It carries MIDI between two apps, or in this case between two browser tabs.

1. Open **Audio MIDI Setup** (in Applications ▸ Utilities).
2. **Window ▸ Show MIDI Studio**.
3. Double-click **IAC Driver**.
4. Tick **Device is online**. Leave the single port named "Bus 1". Apply.

That is the cable. Now something has to send down it:

5. Open `http://localhost:5173/tools/midi-send.html` — the sender.
6. Open the app in another tab, and play one key on screen to grant it MIDI.
7. In the sender, pick the IAC port, then click its keys. The instrument plays in the other tab.

The sender also has bend and modulation sliders, and a button to let the pitch wheel go, since a
slider has no spring and the real wheel does.

If the port list is empty, the IAC Driver is not online — step 4.

## 3. A file, so your hands are free

This is the one worth knowing about if you want to judge a patch rather than demonstrate it: put a
loop on and both hands are free for the panel.

1. Set up the cable and the two tabs, as above.
2. Drop a `.mid` file onto the sender page, or pick one with the file button.
3. **Play**, with **loop** left ticked.
4. Go to the other tab and turn things. Cutoff and Emphasis first — that is where most of the
   character is — then the contours, then the mixer.

The file drives the keyboard and nothing else. It cannot move a knob, which is the point: what you
hear change is what you changed.

Format 0 and 1 are read, with tempo changes honoured. A file timed in SMPTE rather than ticks is
refused with a message saying so, as is a file that is not a MIDI file. Program changes, instrument
names and lyrics are dropped: this instrument has one sound and one voice, and cannot be asked to be
another.

Nothing about this is part of the instrument. A Model D has no sequencer and no MIDI socket — it
predates the standard by thirteen years. The file player lives in the tools for that reason, and the
app has no sequencer of its own.

## When it does not work

`http://localhost:5173/tools/midi-check.html` lists every input it can see and prints each message
as it arrives, beside how the instrument read it. That separates the three failures that look
identical from the keyboard:

| What you see | What it means |
|---|---|
| "This browser does not offer Web MIDI" | Safari, or Firefox with it disabled |
| "refused or unavailable" | the permission was declined; reload and allow it |
| "granted, but no input is connected" | the browser is listening and your device is not there |
| messages printed, but `null` beside them | it is arriving and the instrument ignores it — likely a controller other than the mod wheel |

If notes arrive and nothing sounds, the problem is audio rather than MIDI: check Main Output is on,
that Volume is up, and that at least one oscillator is switched into the mixer with its volume up.
