import { NextResponse } from "next/server"
import { getCurrentVote, castVote, setNewVote, type CommunityProposal } from "@/lib/redis"
import { getWorldState } from "@/lib/redis"

const VOTE_PROPOSALS = [
  {
    title: "Expand the Market District",
    description: "The council is debating whether to allocate resources to build new market stalls.",
    optionA: "Expand the market (boost economy, cost resources)",
    optionB: "Save resources (keep stockpile, slower growth)",
  },
  {
    title: "Raise the City Watch",
    description: "Unrest is rising. Should we invest in more watchtowers and patrols?",
    optionA: "Increase patrols (lower unrest, cost morale)",
    optionB: "Trust the citizens (save resources, risk unrest)",
  },
  {
    title: "Open the City Gates to Traders",
    description: "A caravan of traveling merchants has arrived. Allow them entry?",
    optionA: "Open the gates (new goods, risk of trouble)",
    optionB: "Keep gates closed (safety first, miss trade)",
  },
  {
    title: "Build a New School",
    description: "The children need education. But resources are tight.",
    optionA: "Build the school (long-term growth, short-term cost)",
    optionB: "Delay construction (save for emergencies)",
  },
  {
    title: "Host a Festival",
    description: "Morale is flagging. A festival could lift spirits but costs food.",
    optionA: "Celebrate! (boost morale, spend food)",
    optionB: "Stay focused (conserve food, morale stays low)",
  },
  {
    title: "Invest in the Hospital",
    description: "Health risks are rising. The hospital needs supplies.",
    optionA: "Fund the hospital (lower health risk, cost resources)",
    optionB: "Ration supplies (stretch reserves, higher risk)",
  },
  {
    title: "Explore the Eastern Wilderness",
    description: "Scouts report strange activity beyond the forest edge.",
    optionA: "Send scouts (discover new resources or danger)",
    optionB: "Fortify borders (stay safe, miss opportunities)",
  },
  {
    title: "Tax Reform",
    description: "Some agents are hoarding while others struggle. Redistribute?",
    optionA: "Redistribute wealth (equality, anger the wealthy)",
    optionB: "Free market (let agents compete, widen gap)",
  },
]

// GET: return current vote status
export async function GET() {
  try {
    const { proposal, results, totalVoters } = await getCurrentVote()
    return NextResponse.json({ proposal, results, totalVoters })
  } catch {
    return NextResponse.json({ proposal: null, results: { a: 0, b: 0 }, totalVoters: 0 })
  }
}

// POST: cast a vote or create new proposal
export async function POST(req: Request) {
  try {
    const body = await req.json()

    // Cast a vote
    if (body.action === "vote") {
      const { viewerId, choice } = body
      if (!viewerId || !choice || !["a", "b"].includes(choice)) {
        return NextResponse.json({ error: "Invalid vote" }, { status: 400 })
      }
      const result = await castVote(viewerId, choice)
      return NextResponse.json(result)
    }

    // Auto-generate a new proposal (called by tick or admin)
    if (body.action === "new_proposal") {
      const { proposal: current } = await getCurrentVote()
      if (current) {
        return NextResponse.json({ error: "Vote already active", proposal: current })
      }
      const state = await getWorldState()
      const day = state?.day ?? 1
      const template = VOTE_PROPOSALS[day % VOTE_PROPOSALS.length]
      const proposal: CommunityProposal = {
        id: `vote_day${day}_${Date.now()}`,
        title: template.title,
        description: template.description,
        optionA: template.optionA,
        optionB: template.optionB,
        expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
        createdAt: Date.now(),
      }
      await setNewVote(proposal)
      return NextResponse.json({ proposal })
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}
