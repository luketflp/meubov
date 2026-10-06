/**
 * Text of the desktop rail: hidden while it is folded to its icons, fading in
 * once it has widened, and gone at once when it folds back. `rail-open` is the
 * custom variant in globals.css.
 */
export const railLabelClass =
  "whitespace-nowrap opacity-0 transition-opacity duration-150 motion-reduce:transition-none rail-open:opacity-100 rail-open:delay-150";
