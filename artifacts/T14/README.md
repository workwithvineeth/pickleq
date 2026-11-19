# T14 screenshot evidence

The robot attaches screenshots as successful CI artifacts instead of repository PNGs.

[Browse the latest phone-robot artifacts](https://gitlab.com/boomervineeth/paddleq/-/jobs/artifacts/feature%2Fui-shell/browse/e2e/test-results/?job=robot)

Inside shell-theme-shell-matrix… find T14-{width}-{state}.png:

| Width | Auto-light | Auto-dark | Light | Dark |
|---|---|---|---|---|
| 320 | T14-320-Auto-light.png | T14-320-Auto-dark.png | T14-320-Light.png | T14-320-Dark.png |
| 390 | T14-390-Auto-light.png | T14-390-Auto-dark.png | T14-390-Light.png | T14-390-Dark.png |
| 870 | T14-870-Auto-light.png | T14-870-Auto-dark.png | T14-870-Light.png | T14-870-Dark.png |
| 1100 | T14-1100-Auto-light.png | T14-1100-Auto-dark.png | T14-1100-Light.png | T14-1100-Dark.png |
| 1440 | T14-1440-Auto-light.png | T14-1440-Auto-dark.png | T14-1440-Light.png | T14-1440-Dark.png |

The 870px set shows the icon rail. The 1100/1440px sets show the expanded rail.
Forced Light uses a dark device; forced Dark uses a light device.
Separate live-chip tests attach T14-live-Light.png and T14-live-Dark.png.
Only fictional browser-local demo data is used; backend requests are intercepted.
Both phone projects generate their own captures. Artifacts are retained 30 days.
