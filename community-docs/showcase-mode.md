# Showcase / Dynamic Idle Mode

*[Leia em português](pt-BR/showcase-mode.md)*

A self-cycling "demo mode" for your Home screen — while you're idle, it
automatically pans across your shelves and their games, on your real Home
screen, instead of taking over with a separate overlay. Nice for showing
your setup off, or just as ambient motion in a room where the Deck sits
docked.

## How it's different from the idle screensaver

Deck Shelves also has a [separate full-screen idle screensaver](idle-screensaver.md)
— that one replaces your screen entirely with a slideshow. Showcase Mode is
the opposite: it stays on your actual Home screen and moves focus between
shelves and cards, the same way you would with a controller, using the same
navigation mechanism the built-in Side Nav uses. Nothing is faked or
synthetic — it's genuinely browsing your Home the way you would.

You can run either, both, or neither — they're independent toggles.

## How to enable it

1. Open Deck Shelves' settings and find **Showcase Mode**.
2. Turn it on.
3. Configure how long to wait before it starts, and how long it dwells on
   each shelf — both adjustable.

By default, every visible shelf participates — there's no shelf picker yet
(see Known limitations).

## Fine-tuning

- **Start after / dwell time** — same idea as the screensaver's timing
  controls, independent settings.
- **Randomize order** — cycle shelves randomly instead of in your normal
  shelf order.
- **Stop on interaction** — whether touching a button/stick immediately
  stops the showcase (on by default) or lets it keep running.
- **Pan across cards within a shelf** — on by default. Instead of just
  jumping shelf to shelf, it also pans across a shelf's own cards before
  moving on, so a shelf with many games actually gets shown, not just its
  first few entries. You can control how many cards it shows per shelf
  before advancing, and how long it lingers on each card.

Any real input (button, stick, touch) stops it instantly and hands control
back to you.

## Known limitations

- **No per-shelf picker yet.** It's all-or-nothing across your visible
  shelves right now — you can't currently exclude a specific shelf from
  the rotation while keeping others in. Planned, not built yet.
- No pan/crossfade transition polish or a dedicated TV/demo-mode preset
  yet — the core cycling works, the presentation is still functional
  rather than fancy.

## Troubleshooting

- **It didn't start.** Check "Start after" — it only kicks in after that
  much idle time, same as the screensaver. Also check nothing else is
  intercepting the idle timer (the idle screensaver, if also on, takes
  priority since it's a full-screen takeover).
- **It stopped and won't restart.** Any real input stops it (by design) and
  re-arms the idle timer — it'll pick back up once you're idle again for
  the configured wait time.

Off by default.
