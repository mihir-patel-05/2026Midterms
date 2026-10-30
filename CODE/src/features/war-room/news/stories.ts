import type { NewsTopic, TopStory } from "@/features/news/topStories";

export interface StoryFilter {
  state: string | null;
  topic: NewsTopic | null;
}

/**
 * Stories for a state, then national ones (no state tag) when a state has few of its own. The national ones are
 * kept apart so the screen can say which is which. Order stays the picker's rank.
 */
export function storiesFor(stories: TopStory[], { state, topic }: StoryFilter) {
  const byTopic = topic ? stories.filter((story) => story.topic === topic) : stories;
  if (!state) return { local: byTopic, national: [] as TopStory[] };
  return {
    local: byTopic.filter((story) => story.stateCode === state),
    national: byTopic.filter((story) => story.stateCode === null),
  };
}

/** Topics present in the list, most stories first, for the filter buttons. */
export function topicsIn(stories: TopStory[]) {
  const counts = new Map<NewsTopic, number>();
  for (const story of stories) counts.set(story.topic, (counts.get(story.topic) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([topic, count]) => ({ topic, count }));
}

/** States that have at least one story, for the state filter. */
export function statesIn(stories: TopStory[]) {
  return [...new Set(stories.flatMap((story) => (story.stateCode ? [story.stateCode] : [])))].sort();
}
