// POBT's motion tokens (DESIGN.md "Motion"): every transition in the build screens takes its duration and easing from
// here, as class fragments, so one change retimes them all. `motion-reduce:` turns them off for reduced motion.

/** Durations in ms. */
export const DURATION = { instant: 120, fast: 180, base: 240, slow: 360, slower: 500 } as const;

/** A press: controls scale to this while held. */
export const PRESS_SCALE = 0.97;

/** Colour washes (hover, pressed, selected backgrounds and text). */
export const WASH = "transition-colors duration-120 ease-out motion-reduce:transition-none";
/** A press that sinks the control a little. */
export const PRESS = "transition duration-120 ease-out active:scale-97 motion-reduce:transition-none motion-reduce:active:scale-100";
/** Opacity: content that fades in as it arrives. */
export const FADE = "transition-opacity duration-240 ease-out motion-reduce:transition-none";
/** Width: bars that fill. */
export const GROW = "transition-all duration-360 ease-out motion-reduce:transition-none";
/** Popups: they grow from their trigger. */
export const POPUP_START = "opacity-0 scale-95";
export const POPUP_END = "opacity-0 scale-95";
export const POPUP = "transition duration-180 ease-out motion-reduce:transition-none";
