/**
 * §10 refuses drop shadows, blur and radius, so the "floating" toolbar stops
 * floating: it becomes a hairline-ruled footer bar pinned under the record it
 * acts on. Sticky rather than absolute, so it no longer requires its parent to
 * be a positioned, fixed-height box.
 */
export const floatingToolbarClassName =
	'border-rule bg-ground sticky bottom-0 z-10 mt-8 flex flex-wrap items-center justify-end gap-3 border-t py-3'
