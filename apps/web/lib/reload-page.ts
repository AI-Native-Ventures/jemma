/** Loads the page again from the server. Its own file so a test can stand in for it (a test page cannot be reloaded). */
export function reloadPage(): void {
  window.location.reload()
}
