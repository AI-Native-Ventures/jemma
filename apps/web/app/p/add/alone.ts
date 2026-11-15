// The one way in to "My child's school doesn't use Jemma" (P99b), for every screen that offers it: the same words and the same path. The parent's start
// page and the add-a-child page both used these; a link that went to /p/add from /p/add did nothing. The flag opens the form at once and the anchor is
// the form's own box, so the page is already at it.

/** What the parent reads, on the button of the form and on the link that leads to it. */
export const ALONE_LABEL = "My child's school doesn't use Jemma"

/** The line under the label on the start page. */
export const ALONE_HINT = 'Add your child yourself. No class code needed.'

/** The page that has the form open: the add-a-child page with the flag, scrolled to the form. */
export const ALONE_HREF = '/p/add?alone=1#alone'

/** The id of the form's box: the anchor of `ALONE_HREF`. */
export const ALONE_ID = 'alone'
