/** True when PICKLEQ runs as an installed home-screen app rather than a browser tab. */
export function isInstalled(win: Window = window): boolean {
  const modes = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'];
  const byDisplayMode = modes.some((m) => win.matchMedia?.(`(display-mode: ${m})`).matches);
  // iPhone home-screen apps also report this older flag.
  const byIosFlag = (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return byDisplayMode || byIosFlag;
}
