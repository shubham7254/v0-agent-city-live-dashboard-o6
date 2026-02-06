import type { HumanWorldEvent } from "../types"

const SAMPLE_EVENTS: HumanWorldEvent[][] = [
  [
    {
      headline: "UN reports global food prices surge 12% this quarter",
      source: "Reuters",
      simEffect: { variable: "foodDays", modifier: -3, description: "Supply chain pressures reduce food security" },
    },
    {
      headline: "Major wildfire season predicted for Northern Hemisphere",
      source: "National Geographic",
      simEffect: { variable: "fireStability", modifier: -8, description: "Rising fire risk in surrounding regions" },
    },
    {
      headline: "WHO launches new pandemic preparedness framework",
      source: "BBC",
      simEffect: { variable: "healthRisk", modifier: -4, description: "Better health protocols adopted" },
    },
  ],
  [
    {
      headline: "Breakthrough in solar desalination technology",
      source: "MIT Tech Review",
      simEffect: { variable: "waterDays", modifier: 5, description: "Water purification improvements" },
    },
    {
      headline: "Political unrest spreads across three regions",
      source: "Al Jazeera",
      simEffect: { variable: "unrest", modifier: 6, description: "Global instability raises tensions" },
    },
    {
      headline: "Record crop yields reported in Southeast Asia",
      source: "FAO Report",
      simEffect: { variable: "foodDays", modifier: 4, description: "Agricultural innovations bear fruit" },
    },
  ],
  [
    {
      headline: "Climate summit reaches historic water accord",
      source: "The Guardian",
      simEffect: { variable: "waterDays", modifier: 6, description: "Global water conservation efforts" },
    },
    {
      headline: "Earthquake damages infrastructure in coastal cities",
      source: "CNN",
      simEffect: { variable: "healthRisk", modifier: 5, description: "Natural disaster effects ripple outward" },
    },
    {
      headline: "New community resilience programs show promise",
      source: "NPR",
      simEffect: { variable: "morale", modifier: 4, description: "Community-building efforts inspire cooperation" },
    },
  ],
]

export function humanNewsGateway(day: number): HumanWorldEvent[] {
  const idx = day % SAMPLE_EVENTS.length
  return SAMPLE_EVENTS[idx]
}
