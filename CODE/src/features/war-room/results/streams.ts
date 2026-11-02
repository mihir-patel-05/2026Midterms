/** A Live coverage outlet as GET /api/live-streams serves it. */
export interface Stream {
  key: string;
  name: string;
  embed: { videoId: string } | { channelId: string } | null;
  watchUrl: string;
}

/** The official player from youtube-nocookie.com: one video, or a channel's current live stream. Starts muted. */
export function embedUrl(embed: NonNullable<Stream["embed"]>, origin: string) {
  const params = new URLSearchParams({ autoplay: "1", mute: "1", playsinline: "1", enablejsapi: "1", rel: "0", origin });
  if ("videoId" in embed) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(embed.videoId)}?${params}`;
  params.set("channel", embed.channelId);
  return `https://www.youtube-nocookie.com/embed/live_stream?${params}`;
}

