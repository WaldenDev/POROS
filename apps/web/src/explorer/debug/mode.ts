// Normal startup is live. Recorded data requires an explicit development opt-in.
export function isStaticPreview(development: boolean, search: string, demo = false) {
  return demo || (development && new URLSearchParams(search).get("mode") === "static");
}
