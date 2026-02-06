import type {
  Agent,
  BrainProvider,
  Proposal,
  VoteChoice,
  WorldState,
} from "../types"

const PROPOSAL_TEMPLATES = [
  { title: "Build a watchtower", cost: 30, impacts: [{ metric: "fireStability", direction: "up" as const, amount: 10 }] },
  { title: "Expand the farm", cost: 25, impacts: [{ metric: "foodDays", direction: "up" as const, amount: 15 }] },
  { title: "Dig a new well", cost: 20, impacts: [{ metric: "waterDays", direction: "up" as const, amount: 12 }] },
  { title: "Organize a festival", cost: 15, impacts: [{ metric: "morale", direction: "up" as const, amount: 20 }] },
  { title: "Reinforce the wall", cost: 35, impacts: [{ metric: "healthRisk", direction: "down" as const, amount: 8 }] },
  { title: "Build a storehouse", cost: 28, impacts: [{ metric: "foodDays", direction: "up" as const, amount: 10 }] },
  { title: "Train night watch", cost: 18, impacts: [{ metric: "unrest", direction: "down" as const, amount: 12 }] },
  { title: "Medical herb garden", cost: 22, impacts: [{ metric: "healthRisk", direction: "down" as const, amount: 15 }] },
]

const DIALOGUE_TEMPLATES = [
  "We must consider the long-term consequences.",
  "I disagree - the people need action now.",
  "If we don't act, we risk losing everything.",
  "This is a sound plan. I support it.",
  "The cost is too high for what we gain.",
  "Let the record show my dissent.",
  "I've seen worse odds. Let's proceed.",
  "Has anyone considered the water situation?",
  "The forest won't protect us forever.",
  "My scouts report movement to the north.",
  "We should fortify before the storm season.",
  "The children are growing restless. We need hope.",
]

const ACTION_TEMPLATES = [
  "Gathered resources from the forest",
  "Patrolled the perimeter",
  "Tended the crops",
  "Reinforced shelter walls",
  "Scouted the eastern ridge",
  "Organized food supplies",
  "Trained with the militia",
  "Tended to the sick",
  "Explored the riverbank",
  "Repaired the watchtower",
]

function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

export class MockBrain implements BrainProvider {
  private seed = 0

  private rand(): number {
    this.seed++
    return seededRandom(this.seed + Date.now())
  }

  generateProposal(agent: Agent, _state: WorldState): Proposal {
    const template = PROPOSAL_TEMPLATES[Math.floor(this.rand() * PROPOSAL_TEMPLATES.length)]
    const personalityCostMod = agent.personality.caution > 60 ? 0.8 : 1.2
    return {
      id: `prop-${Date.now()}-${Math.floor(this.rand() * 1000)}`,
      title: template.title,
      description: `${agent.name} proposes: ${template.title}`,
      proposedBy: agent.id,
      cost: Math.round(template.cost * personalityCostMod),
      expectedImpact: template.impacts.map((i) => ({ ...i })),
      votes: {},
      status: "pending",
    }
  }

  generateVote(agent: Agent, proposal: Proposal, _state: WorldState): VoteChoice {
    const { personality } = agent
    let yesWeight = 50

    if (proposal.proposedBy === agent.id) yesWeight += 30
    if (agent.allies.includes(proposal.proposedBy)) yesWeight += 20
    if (agent.rivals.includes(proposal.proposedBy)) yesWeight -= 25

    yesWeight += (personality.cooperation - 50) * 0.3
    yesWeight -= (personality.caution - 50) * 0.2

    if (proposal.cost > 30) yesWeight -= 10
    if (proposal.expectedImpact.some((i) => i.direction === "up" && i.amount > 12))
      yesWeight += 10

    const roll = this.rand() * 100
    if (roll < yesWeight) return "yes"
    if (roll < yesWeight + 10) return "abstain"
    return "no"
  }

  generateDialogue(agent: Agent, _context: string, _state: WorldState): string {
    const idx = Math.floor(this.rand() * DIALOGUE_TEMPLATES.length)
    return DIALOGUE_TEMPLATES[idx]
  }

  decideAction(agent: Agent, _state: WorldState): string {
    const idx = Math.floor(this.rand() * ACTION_TEMPLATES.length)
    return ACTION_TEMPLATES[idx]
  }
}
