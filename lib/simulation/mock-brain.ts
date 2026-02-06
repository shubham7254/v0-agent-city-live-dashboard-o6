import type {
  Agent,
  BrainProvider,
  CouncilDialogue,
  HumanWorldEvent,
  Proposal,
  VoteChoice,
  WorldState,
} from "../types"

const PROPOSAL_TEMPLATES = [
  { title: "Build a watchtower on the hill", cost: 30, impacts: [{ metric: "fireStability", direction: "up" as const, amount: 10 }] },
  { title: "Expand the southern farm", cost: 25, impacts: [{ metric: "foodDays", direction: "up" as const, amount: 15 }] },
  { title: "Dig a new well near the river", cost: 20, impacts: [{ metric: "waterDays", direction: "up" as const, amount: 12 }] },
  { title: "Organize a harvest festival", cost: 15, impacts: [{ metric: "morale", direction: "up" as const, amount: 20 }] },
  { title: "Reinforce the northern wall", cost: 35, impacts: [{ metric: "healthRisk", direction: "down" as const, amount: 8 }] },
  { title: "Build a storehouse for winter", cost: 28, impacts: [{ metric: "foodDays", direction: "up" as const, amount: 10 }] },
  { title: "Train a night watch militia", cost: 18, impacts: [{ metric: "unrest", direction: "down" as const, amount: 12 }] },
  { title: "Establish a medical herb garden", cost: 22, impacts: [{ metric: "healthRisk", direction: "down" as const, amount: 15 }] },
  { title: "Scout the eastern mountains", cost: 12, impacts: [{ metric: "morale", direction: "up" as const, amount: 5 }] },
  { title: "Build a fishing dock", cost: 20, impacts: [{ metric: "foodDays", direction: "up" as const, amount: 8 }] },
  { title: "Expand the hospital ward", cost: 40, impacts: [{ metric: "healthRisk", direction: "down" as const, amount: 20 }] },
  { title: "Build a new residential block", cost: 45, impacts: [{ metric: "morale", direction: "up" as const, amount: 10 }] },
  { title: "Open a public library", cost: 30, impacts: [{ metric: "morale", direction: "up" as const, amount: 15 }] },
  { title: "Pave the main roads with stone", cost: 35, impacts: [{ metric: "morale", direction: "up" as const, amount: 8 }] },
  { title: "Build a playground for children", cost: 15, impacts: [{ metric: "morale", direction: "up" as const, amount: 12 }] },
  { title: "Hire more teachers for the school", cost: 20, impacts: [{ metric: "morale", direction: "up" as const, amount: 8 }] },
  { title: "Establish a town bakery co-op", cost: 18, impacts: [{ metric: "foodDays", direction: "up" as const, amount: 6 }] },
  { title: "Create a town square market", cost: 25, impacts: [{ metric: "morale", direction: "up" as const, amount: 10 }] },
  { title: "Build a sewage system", cost: 50, impacts: [{ metric: "healthRisk", direction: "down" as const, amount: 25 }] },
  { title: "Establish a fire brigade", cost: 20, impacts: [{ metric: "fireStability", direction: "up" as const, amount: 15 }] },
]

function dialogueForAgent(agent: Agent, context: string, state: WorldState): string {
  const archTemplates: Record<string, string[]> = {
    Farmer: [
      `The soil tells me we need more hands in the fields. ${context} could help or hurt our harvest.`,
      `I've been watching the crops. If we don't secure more water soon, we'll face famine by next season.`,
      `My grandfather farmed this land for decades. Trust me when I say - we need to act on food supplies now.`,
      `The yields this season are ${state.metrics.foodDays > 30 ? "promising" : "dangerously low"}. We must plan ahead.`,
      `Every decision we make echoes in the harvest. I say we focus on what feeds our people.`,
    ],
    Warrior: [
      `Defense must come first. Without safety, all your farms and wells mean nothing.`,
      `I've seen the signs. Something stirs beyond the mountains. We need to be ready.`,
      `${context}? Fine. But I want double patrols tonight. Non-negotiable.`,
      `The walls won't hold forever. We strengthen them now, or we pay in blood later.`,
      `Morale among the guards is ${state.metrics.unrest > 40 ? "shaky" : "strong"}. Keep that in mind.`,
    ],
    Scout: [
      `I mapped the eastern ridge yesterday. There's opportunity there - and danger.`,
      `My scouts report movement. Whether friend or threat, we should know before they know us.`,
      `${context} reminds me of what I saw beyond the forest. The outside world is changing fast.`,
      `Knowledge is our greatest weapon. Fund exploration, and I'll bring back answers.`,
      `The terrain around us is shifting. New paths opening, old ones closing. We must adapt.`,
    ],
    Healer: [
      `Three settlers came to me with fevers this week. Health risk is ${state.metrics.healthRisk > 30 ? "climbing" : "manageable"}, but we can't be complacent.`,
      `Medicine and morale go hand in hand. Sick people can't work, and workers can't thrive in fear.`,
      `${context}? I support it if it keeps our people healthy. That's all I care about.`,
      `We need herbs, clean water, and rest. Simple things, but they save lives.`,
      `I've seen communities crumble from disease alone. Prevention is everything.`,
    ],
    Builder: [
      `Give me materials and time, and I'll make this settlement a fortress.`,
      `The council hall itself needs repair. How can we govern from a crumbling building?`,
      `${context} will require resources. I can build it, but not from nothing.`,
      `Every structure I raise gives our people shelter and hope. That matters.`,
      `Infrastructure is the skeleton of civilization. Without it, we're just wanderers.`,
    ],
    Hunter: [
      `The forest provides, but we take too much and it will stop giving.`,
      `I tracked deer three miles east today. The herds are ${state.metrics.foodDays > 25 ? "healthy" : "thinning"}.`,
      `${context} - interesting. But will it keep bellies full tonight? That's my question.`,
      `Nature doesn't negotiate. We adapt to her rules, or we starve.`,
      `My traps are set. But we need more than traps. We need a strategy for the long winter.`,
    ],
    Scholar: [
      `History teaches us that civilizations rise and fall on decisions exactly like this one.`,
      `I've been studying the patterns. ${context} aligns with what I've read about successful settlements.`,
      `Knowledge without action is useless. But action without knowledge is dangerous.`,
      `The archives mention a similar crisis 200 years ago. They survived by cooperating.`,
      `Let me consult the records. Every answer we need may already have been discovered.`,
    ],
    Diplomat: [
      `We must consider how this appears to outsiders. Our reputation precedes us.`,
      `Cooperation is not weakness - it's strategy. ${context} could unite or divide us.`,
      `I've spoken with every faction here. The mood is ${state.metrics.morale > 60 ? "cautiously optimistic" : "tense and worried"}.`,
      `Compromise isn't defeat. It's the art of everyone losing a little to gain a lot.`,
      `The people need a voice they trust. Let's make sure our decisions reflect their will.`,
    ],
    Elder: [
      `I've seen many seasons pass. This settlement has survived worse, but only through unity.`,
      `The young are restless, the old are tired. We need a decision that serves both.`,
      `${context}... I recall something similar, years ago. We chose poorly then. Let us choose wisely now.`,
      `Patience and wisdom, friends. The greatest danger is acting from fear alone.`,
      `Our legacy is not the walls we build, but the choices we make in moments like these.`,
    ],
    Artisan: [
      `Beauty and function must coexist. A settlement without art is just a prison.`,
      `I can craft what we need, but I need raw materials and fair conditions.`,
      `${context} speaks to the creative spirit of our community. I'm in favor.`,
      `Morale isn't just food and shelter. People need purpose, beauty, and pride.`,
      `Let me design something that serves our needs and lifts our spirits.`,
    ],
    Doctor: [
      `The hospital needs more supplies. ${context} could help us save lives.`,
      `I've treated ${state.metrics.healthRisk > 30 ? "too many patients this week" : "the usual cases"}. Prevention is key.`,
      `Public health must be our priority. Sick workers can't build or farm.`,
      `I support anything that reduces disease and improves sanitation.`,
    ],
    Nurse: [
      `The patients need our attention. ${context} affects everyone's wellbeing.`,
      `I see the effects of poor health daily. We need better infrastructure.`,
      `Our hospital is ${state.metrics.healthRisk > 40 ? "overwhelmed" : "managing"}, but we can always do better.`,
    ],
    Teacher: [
      `The children are our future. ${context} will shape what kind of citizens they become.`,
      `Education requires investment. A school without resources is just a room.`,
      `I teach 8 children daily. They're bright, but they need books and tools.`,
    ],
    Professor: [
      `Higher education distinguishes a village from a true civilization. ${context} is worth debating.`,
      `My students at the college show great promise. We must nurture that.`,
      `Research and knowledge drive progress. I support intellectual investment.`,
    ],
    Shopkeeper: [
      `Trade is the lifeblood of any town. ${context} will affect commerce.`,
      `My shop sees ${state.metrics.morale > 60 ? "good foot traffic" : "fewer customers lately"}. We need economic stability.`,
      `The market district needs attention. Better roads mean more trade.`,
    ],
    Baker: [
      `I feed this town, one loaf at a time. ${context} matters to every belly here.`,
      `Grain supplies are ${state.metrics.foodDays > 30 ? "steady" : "worrying me"}. We need the farmers' support.`,
    ],
    Blacksmith: [
      `I forge the tools that build this town. ${context} - will it need iron or steel?`,
      `The forge runs hot. Give me materials, and I'll give you results.`,
    ],
    "Retired Doctor": [
      `In my years of practice, I've learned that prevention saves more lives than cure.`,
      `The young doctors are capable, but they lack experience. ${context} reminds me of harder times.`,
    ],
    "Village Historian": [
      `Our town's history teaches us much. ${context} echoes events from 20 years ago.`,
      `I've recorded every council decision for decades. Let us choose wisely.`,
    ],
    "Master Craftsman": [
      `Quality takes time. ${context} should be done right, not fast.`,
      `I've trained apprentices for 40 years. This town is built on craftsmanship.`,
    ],
    Councilmember: [
      `As a long-serving council member, I've seen many proposals. ${context} has merit.`,
      `The people trust us to make wise decisions. Let's not disappoint them.`,
    ],
  }

  const templates = archTemplates[agent.archetype] ?? archTemplates.Farmer
  const idx = Math.floor(((Math.sin(Date.now() + agent.id.charCodeAt(0)) + 1) / 2) * templates.length)
  return templates[idx % templates.length]
}

function humanNewsReaction(agent: Agent, event: HumanWorldEvent, state: WorldState): string {
  const reactions: Record<string, string[]> = {
    Farmer: [
      `"${event.headline}" - This could change everything for our crops. We should prepare.`,
      `The outside world's food situation affects us too. If ${event.headline.toLowerCase()}, we need contingency plans.`,
    ],
    Warrior: [
      `I heard about "${event.headline}". If this instability reaches us, we must be fortified.`,
      `The human world is in chaos. "${event.headline}" - this is exactly why we train.`,
    ],
    Scout: [
      `My contacts beyond the ridge mentioned this: "${event.headline}". The implications for us are clear.`,
      `"${event.headline}" - I've seen firsthand what happens when settlements ignore global shifts.`,
    ],
    Healer: [
      `"${event.headline}" concerns me deeply. Health crises spread, and we're not immune.`,
      `The world beyond matters. "${event.headline}" will affect the herbs and medicines we can access.`,
    ],
    Scholar: [
      `Fascinating. "${event.headline}" mirrors patterns from the historical records I've been studying.`,
      `"${event.headline}" - history shows us exactly what follows. We should heed the warning.`,
    ],
    Diplomat: [
      `"${event.headline}" will reshape the political landscape. We should position ourselves wisely.`,
      `The global situation ("${event.headline}") means we need stronger alliances, not isolation.`,
    ],
    Elder: [
      `In my time, I've seen how events like "${event.headline}" ripple through even remote settlements like ours.`,
      `"${event.headline}" - the young may not understand, but this will touch us all eventually.`,
    ],
  }

  const templates = reactions[agent.archetype] ?? [
    `"${event.headline}" - we should discuss what this means for our settlement.`,
    `Has everyone heard? "${event.headline}". This affects our ${event.simEffect.variable} directly.`,
  ]

  const idx = Math.floor(((Math.sin(Date.now() * 0.001 + agent.id.charCodeAt(0)) + 1) / 2) * templates.length)
  return templates[idx % templates.length]
}

const ACTION_TEMPLATES: Record<string, string[]> = {
  Farmer: ["Tended the southern fields", "Harvested root vegetables", "Repaired irrigation channels", "Planted new crop rows"],
  Warrior: ["Patrolled the perimeter", "Trained with the militia", "Inspected the walls", "Sharpened weapons at the forge"],
  Guard: ["Patrolled the perimeter walls", "Manned the north watchtower", "Checked the gate locks", "Trained new recruits"],
  Scout: ["Scouted the eastern ridge", "Mapped new terrain", "Tracked animal movements", "Set trail markers"],
  Healer: ["Tended to the sick", "Gathered medicinal herbs", "Brewed healing tonics", "Checked water purity"],
  Builder: ["Reinforced shelter walls", "Repaired the watchtower", "Cut timber for construction", "Laid foundation stones"],
  Hunter: ["Set traps in the forest", "Tracked deer herds", "Smoked fish by the river", "Prepared hunting gear"],
  Scholar: ["Studied the archives", "Recorded the day's events", "Taught the young settlers", "Analyzed weather patterns"],
  Diplomat: ["Mediated a dispute", "Organized a community gathering", "Visited each household", "Drafted new settlement rules"],
  Elder: ["Counseled the young workers", "Shared stories at the fire", "Blessed the new buildings", "Walked the settlement grounds"],
  Artisan: ["Crafted tools at the workshop", "Decorated the council hall", "Repaired pottery and utensils", "Wove fabric for shelters"],
  Doctor: ["Performed morning rounds", "Treated a patient with fever", "Updated medical records", "Consulted with nurses"],
  Nurse: ["Administered medicine", "Changed bandages", "Monitored patient vitals", "Prepared medical supplies"],
  Teacher: ["Taught a reading lesson", "Graded student work", "Prepared tomorrow's lesson plan", "Held parent-teacher meeting"],
  Professor: ["Gave a lecture on engineering", "Supervised student research", "Graded term papers", "Met with college administration"],
  Shopkeeper: ["Opened shop for business", "Restocked shelves", "Served customers all day", "Counted the day's earnings"],
  Baker: ["Baked bread before dawn", "Made pastries for the market", "Restocked flour supplies", "Experimented with new recipes"],
  Blacksmith: ["Forged new tools", "Repaired farming equipment", "Hammered horseshoes", "Sharpened knives and axes"],
  Merchant: ["Traded goods at market", "Negotiated with suppliers", "Balanced the ledger", "Sourced new merchandise"],
  Carpenter: ["Built new shelving", "Repaired a broken door", "Carved furniture pieces", "Installed window frames"],
  Librarian: ["Organized the book collection", "Helped students research", "Cataloged new arrivals", "Read stories to children"],
  Cook: ["Prepared meals for the inn", "Sourced fresh ingredients", "Tried a new recipe", "Fed the workers at noon"],
  Tailor: ["Sewed new garments", "Mended torn clothing", "Measured a customer for a suit", "Dyed fabric at the workshop"],
  Herbalist: ["Gathered wild herbs", "Prepared tinctures", "Dried flowers for medicine", "Advised patients on remedies"],
  Fisher: ["Cast nets in the river", "Cleaned the day's catch", "Repaired fishing nets", "Smoked fish for preservation"],
  Mason: ["Laid bricks for the new wall", "Mixed mortar", "Repaired the market floor", "Carved stone blocks"],
  Schoolchild: ["Attended class", "Played with friends at recess", "Did homework", "Helped the teacher clean up"],
  Student: ["Attended lectures", "Studied in the library", "Worked on a group project", "Practiced writing an essay"],
  Apprentice: ["Assisted the master craftsman", "Practiced basic skills", "Ran errands for the workshop", "Studied trade manuals"],
  "Retired Doctor": ["Advised the hospital staff", "Took a gentle walk", "Read medical journals", "Mentored a young nurse"],
  "Village Historian": ["Updated the town chronicle", "Interviewed an elder", "Organized historical records", "Gave a public talk"],
  "Master Craftsman": ["Supervised apprentice work", "Crafted a fine piece", "Inspected workshop standards", "Taught advanced techniques"],
  Councilmember: ["Reviewed town proposals", "Met with concerned citizens", "Inspected public buildings", "Drafted new town policies"],
}

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

  generateDialogue(agent: Agent, context: string, state: WorldState): string {
    return dialogueForAgent(agent, context, state)
  }

  generateHumanNewsReaction(agent: Agent, event: HumanWorldEvent, state: WorldState): string {
    return humanNewsReaction(agent, event, state)
  }

  generateVoteStatement(agent: Agent, proposal: Proposal, vote: VoteChoice, _state: WorldState): string {
    const stmts: Record<VoteChoice, string[]> = {
      yes: [
        `I vote YES on "${proposal.title}". This is what our people need.`,
        `Aye. "${proposal.title}" has my full support. The cost is worth the gain.`,
        `I cast my vote in favor. Let's move forward with "${proposal.title}".`,
      ],
      no: [
        `I vote NO. "${proposal.title}" is too risky at this cost.`,
        `Nay. I cannot support "${proposal.title}" given our current situation.`,
        `I oppose this. We have more pressing concerns than "${proposal.title}".`,
      ],
      abstain: [
        `I abstain. I need more information before committing on "${proposal.title}".`,
        `I will not vote on this one. My conscience is divided on "${proposal.title}".`,
      ],
    }
    const opts = stmts[vote]
    return opts[Math.floor(this.rand() * opts.length)]
  }

  decideAction(agent: Agent, _state: WorldState): string {
    const templates = ACTION_TEMPLATES[agent.archetype] ?? ACTION_TEMPLATES.Farmer
    const idx = Math.floor(this.rand() * templates.length)
    return templates[idx]
  }
}
