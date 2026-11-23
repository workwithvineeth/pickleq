# Set up OBS with the RallyQ score overlay (one laptop per court)

Before you start: the organiser opens RallyQ → the tournament → **Live streams**, and taps **Copy overlay link** for your
court. It looks like `https://rallyq.in/#/overlay/<event>/1` (the last number is the court).

1. **Add the overlay.** In OBS, in *Sources*, click **+** → **Browser**. Name it "RallyQ score". Paste the overlay link
   into **URL**. Set **Width 1920** and **Height 1080** (use 1280 × 720 if your OBS canvas is 720p). Tick
   **"Refresh browser when scene becomes active"**. Leave Custom CSS as it is. Click OK.
2. **Put it on top.** Drag "RallyQ score" to the **top** of the Sources list (above both cameras), then right-click it →
   **Transform → Fit to screen**. The picture behind it must still show: only the score bar, the LIVE chip and
   "EVERY COURT LIVE · RALLYQ.IN" appear.
3. **Check it moves.** Ask the court's referee to tap one point. The number on the bar should change within about
   1 second. If the bar is in the way, add `?bar=top` to the end of the link; to make it smaller or bigger add
   `?scale=0.9` (0.75 to 1.25), e.g. `…/overlay/<event>/1?bar=top&scale=0.9`.
4. **Stream to YouTube.** *Settings → Stream*: YouTube. In YouTube Studio for this court's stream choose
   **Ultra-low latency** and keep **Allow embedding** on. Start streaming.
5. **Show it on RallyQ.** Copy the YouTube live link (Share button) and send it to the organiser, who pastes it into
   **Live streams** for your court and taps **Show to fans** (after putting up the filming notice at the venue).

If the bar shows only the small Q: no match is on this court yet (it shows "Next: A v B" when one is scheduled).
If the score stops moving: right-click the source → **Refresh**; scores keep coming from RallyQ even if the camera drops.
