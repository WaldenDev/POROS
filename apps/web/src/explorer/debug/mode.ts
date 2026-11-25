// Demo distributions stay offline; ordinary production builds retain the live entry.
export const STATIC_PREVIEW_ENABLED = true;

export function isStaticPreview(development: boolean, search: string, demo = false) {
  return demo || (development && STATIC_PREVIEW_ENABLED &&
    new URLSearchParams(search).get("mode") !== "live");
}
