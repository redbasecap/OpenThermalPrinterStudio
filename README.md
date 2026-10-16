# OpenThermalPrinterStudio

Design banners, labels and pictures and print them on cheap Bluetooth thermal printers of
the **LX-D02** family (the 58 mm pocket printers sold with the Dolewa / Funny Print apps).
No vendor app, no account. Printing goes straight from your device to the printer; the studio only fetches its fonts from Google Fonts.

Two ways to print:

- **Studio**: a web page that talks to the printer over Web Bluetooth. Live 1-bit preview
  on a paper strip with a centimetre ruler, darkness control, PNG export.
- **`otps` CLI**: a Python package for scripts and terminals.

## Studio

**Try it: <https://redbasecap.github.io/OpenThermalPrinterStudio/>**

Or open `web/index.html` over `https://` or `localhost`, in **Chrome or Edge** (desktop or
Android). Safari and Firefox do not support Web Bluetooth.

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/web/>, click **Connect printer**, pick the `LX-D02`, and
click **Print**. The studio is a static site, so it also runs on GitHub Pages.

Before connecting:

- Disconnect the printer in the phone app. It accepts only one connection.
- On macOS, allow Chrome to use Bluetooth when asked
  (System Settings → Privacy & Security → Bluetooth).

| Mode | For |
|---|---|
| Banner | Text running along the strip, letter size adjustable up to the paper width |
| Label | Horizontal text lines, shrunk to fit the width |
| Picture | Any image, scaled to 384 dots, with dithering for photos |

## CLI

```bash
pip install ./python
otps banner "ACHTUNG LEBENSMITTEL" --size 200
otps label "Frisch\n16.10.2026" --size 72
otps image photo.jpg --dither --density 4
otps banner "TEST" --preview out.png   # render only, no printer needed
```

On macOS, run `otps` from Terminal or iTerm. The terminal app must have Bluetooth
permission; tools launched from apps without a Bluetooth usage description are killed by
the system on the first scan.

## Layout

```
web/       static studio (protocol.js, printer.js, render.js, app.js)
python/    openthermal package and otps CLI
vectors/   shared test vectors, so the Python and JS implementations stay byte-identical
PROTOCOL.md
```

## Tests

```bash
pip install pytest
python -m pytest python/tests               # Python
python python/tests/make_vectors.py         # regenerate vectors after protocol changes
```

For JavaScript, serve the repo and open `web/test.html`. The page title turns `PASS` or `FAIL`.

## Compatibility

Tested on an LX-D02. Other models from the same family (LX-D01, LX-D03…D09, DL-P01) are
expected to work but are untested. Reports welcome.

## Credits

Protocol knowledge comes from [rusq/thermoprint](https://github.com/rusq/thermoprint)
(MIT) and [antoniosolismz/Pocketprint](https://github.com/antoniosolismz/Pocketprint)
(MIT). The code here is an independent implementation. See [PROTOCOL.md](PROTOCOL.md).

Not affiliated with the printer makers or app vendors. Product names are used only to
describe compatibility.

## License

MIT
