"use client";

import { useEffect, useState } from "react";

// Rendered client-side only: the feed URL depends on how you're reaching
// this server (localhost, LAN IP, Tailscale hostname), which we can only
// know from the browser, not at server-render time.
export function FeedUrl() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    // window.location isn't available during SSR, so this has to be an
    // effect (not lazy initial state) to stay hydration-safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(`${window.location.origin}/feed.xml`);
  }, []);

  if (!url) return null;

  return (
    <p className="text-xs text-zinc-500">
      Podcast feed:{" "}
      <a href={url} className="underline" target="_blank" rel="noopener noreferrer">
        {url}
      </a>{" "}
      — paste this into any podcast app.
    </p>
  );
}
