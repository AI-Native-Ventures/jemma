/** Asks the web app, with the per-user MCP token, to retry a stopped job in the desktop queue or run it in the cloud. */
export async function settleJob(webUrl: string, token: string, eventId: string, action: 'retry' | 'cloud', doFetch: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await doFetch(`${webUrl.replace(/\/+$/, '')}/api/desktop/job`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ eventId, action }),
    })
    return res.ok
  } catch {
    return false
  }
}
