import type { WorldState, StoryEvent, Agent } from "../types"

export interface NewspaperEdition {
  day: number
  masthead: string
  date: string
  headline: string
  headlineBody: string
  articles: { headline: string; body: string; category: string }[]
  weatherReport: string
  populationNote: string
  quoteOfTheDay: { quote: string; agent: string }
  timestamp: number
}

export function generateNewspaper(state: WorldState): NewspaperEdition {
  const day = state.day
  const date = new Date().toLocaleDateString("en-US", {
    timeZone: "America/Detroit",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  // Collect yesterday's stories
  const todayStories = (state.storyLog ?? []).filter((s) => s.day === day || s.day === day - 1).slice(0, 20)
  const sortedByImportance = [...todayStories].sort((a, b) => {
    const weight: Record<string, number> = {
      rivalry: 8, conflict: 8, romance: 7, misfortune: 7,
      achievement: 6, business: 5, celebration: 5,
      friendship: 4, discovery: 6,
    }
    return (weight[b.category] ?? 3) - (weight[a.category] ?? 3)
  })

  // Main headline from top story
  const topStory = sortedByImportance[0]
  const headline = topStory ? topStory.title : `Day ${day}: Life Goes On in Agent City`
  const headlineBody = topStory
    ? topStory.description + (topStory.consequence ? ` ${topStory.consequence}` : "")
    : "Another peaceful day in the settlement. Citizens go about their daily routines as the community continues to grow."

  // Generate articles from remaining stories
  const articles = sortedByImportance.slice(1, 5).map((story) => ({
    headline: story.title,
    body: story.description + (story.consequence ? ` ${story.consequence}` : ""),
    category: story.category,
  }))

  // Add metrics-based articles
  const m = state.metrics
  if (m.morale < 40) {
    articles.push({
      headline: "Morale Crisis Deepens",
      body: `Community morale has fallen to ${m.morale}. Citizens express growing dissatisfaction with current conditions. Local leaders are urged to take action.`,
      category: "crisis",
    })
  } else if (m.morale > 80) {
    articles.push({
      headline: "Spirits Soar Across the Settlement",
      body: `Morale reaches an impressive ${m.morale}. Citizens report high satisfaction with life in Agent City.`,
      category: "celebration",
    })
  }

  if (m.foodDays < 30) {
    articles.push({
      headline: "Food Supplies Running Low",
      body: `Food reserves have dropped to ${m.foodDays} days. Farmers are working overtime to replenish stocks before the situation becomes critical.`,
      category: "crisis",
    })
  }

  if (m.unrest > 30) {
    articles.push({
      headline: "Rising Tensions in the Streets",
      body: `Unrest levels have climbed to ${m.unrest}. Watch patrols have been increased in response to growing discontent.`,
      category: "conflict",
    })
  }

  // Council recap
  if (state.council.dialogue.length > 0 && state.council.day === day) {
    const approved = state.council.proposals.filter((p) => p.status === "approved")
    const rejected = state.council.proposals.filter((p) => p.status === "rejected")
    if (approved.length > 0 || rejected.length > 0) {
      articles.push({
        headline: "Council Session Recap",
        body: `The council met today. ${approved.map((p) => `"${p.title}" was approved`).join(". ")}${rejected.length > 0 ? `. ${rejected.map((p) => `"${p.title}" was rejected`).join(". ")}` : ""}.`,
        category: "politics",
      })
    }
  }

  // Weather report
  const weatherMap: Record<string, string> = {
    clear: "Clear skies expected throughout the day. Perfect conditions for outdoor work.",
    rain: "Rain continues to fall over the settlement. Farmers welcome the moisture.",
    storm: "Severe storms are forecast. Citizens advised to secure their homes and stay indoors.",
    fog: "Dense fog blankets the area this morning. Visibility is limited.",
    heat: "A heat wave grips the region. Residents are advised to stay hydrated.",
  }
  const weatherReport = weatherMap[state.weather] ?? "Weather conditions are normal."

  // Quote of the day
  const quotableAgents = state.agents.filter((a) => a.recentQuotes.length > 0)
  const randomAgent = quotableAgents[Math.floor(Math.random() * quotableAgents.length)]
  const quoteOfTheDay = randomAgent
    ? { quote: randomAgent.recentQuotes[randomAgent.recentQuotes.length - 1], agent: randomAgent.name }
    : { quote: "Together we build something greater than ourselves.", agent: "Unknown" }

  return {
    day,
    masthead: "THE AGENT CITY CHRONICLE",
    date,
    headline,
    headlineBody,
    articles: articles.slice(0, 6),
    weatherReport,
    populationNote: `Population: ${m.population} | Food: ${m.foodDays} days | Morale: ${m.morale}`,
    quoteOfTheDay,
    timestamp: Date.now(),
  }
}
