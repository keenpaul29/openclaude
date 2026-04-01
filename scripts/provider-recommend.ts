// @ts-nocheck
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  applyBenchmarkLatency,
  getGoalDefaultOpenAIModel,
  normalizeRecommendationGoal,
  rankOllamaModels,
  type BenchmarkedOllamaModel,
  type RecommendationGoal,
} from '../src/utils/providerRecommendation.ts'
import {
  benchmarkOllamaModel,
  getOllamaChatBaseUrl,
  hasLocalOllama,
  listOllamaModels,
} from './provider-discovery.ts'

type ProviderProfile = 'openai' | 'ollama'

type ProfileFile = {
  profile: ProviderProfile
  env: {
    OPENAI_BASE_URL?: string
    OPENAI_MODEL?: string
    OPENAI_API_KEY?: string
  }
  createdAt: string
}

type CliOptions = {
  apply: boolean
  benchmark: boolean
  goal: RecommendationGoal
  json: boolean
  provider: ProviderProfile | 'auto'
  baseUrl: string | null
}

function parseOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    benchmark: false,
    goal: normalizeRecommendationGoal(process.env.OPENCLAUDE_PROFILE_GOAL),
    json: false,
    provider: 'auto',
    baseUrl: null,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]?.toLowerCase()
    if (!arg) continue

    if (arg === '--apply') {
      options.apply = true
      continue
    }
    if (arg === '--benchmark') {
      options.benchmark = true
      continue
    }
    if (arg === '--json') {
      options.json = true
      continue
    }
    if (arg === '--goal') {
      options.goal = normalizeRecommendationGoal(argv[i + 1] ?? null)
      i++
      continue
    }
    if (arg === '--provider') {
      const provider = argv[i + 1]?.toLowerCase()
      if (
        provider === 'openai' ||
        provider === 'ollama' ||
        provider === 'auto'
      ) {
        options.provider = provider
      }
      i++
      continue
    }
    if (arg === '--base-url') {
      options.baseUrl = argv[i + 1] ?? null
      i++
    }
  }

  return options
}

function sanitizeApiKey(key: string | undefined): string | undefined {
  if (!key || key === 'SUA_CHAVE') return undefined
  return key
}

function printHumanSummary(payload: {
  goal: RecommendationGoal
  recommendedProfile: ProviderProfile
  recommendedModel: string
  rankedModels: BenchmarkedOllamaModel[]
  benchmarked: boolean
  applied: boolean
}): void {
  console.log(`Recommendation goal: ${payload.goal}`)
  console.log(`Recommended profile: ${payload.recommendedProfile}`)
  console.log(`Recommended model: ${payload.recommendedModel}`)

  if (payload.rankedModels.length > 0) {
    console.log('\nRanked Ollama models:')
    for (const [index, model] of payload.rankedModels.slice(0, 5).entries()) {
      const benchmarkPart =
        payload.benchmarked && model.benchmarkMs !== null
          ? ` | ${Math.round(model.benchmarkMs)}ms`
          : ''
      console.log(
        `${index + 1}. ${model.name} | score=${model.score}${benchmarkPart} | ${model.summary}`,
      )
    }
  }

  if (payload.applied) {
    console.log('\nSaved .openclaude-profile.json with the recommended profile.')
    console.log('Next: bun run dev:profile')
  } else {
    console.log(
      '\nTip: run `bun run profile:auto -- --goal ' +
        payload.goal +
        '` to apply this automatically.',
    )
  }
}

async function maybeApplyProfile(
  profile: ProviderProfile,
  model: string,
  goal: RecommendationGoal,
  baseUrl: string | null,
): Promise<boolean> {
  const env: ProfileFile['env'] = {}
  if (profile === 'ollama') {
    env.OPENAI_BASE_URL = getOllamaChatBaseUrl(baseUrl ?? undefined)
    env.OPENAI_MODEL = model
    const key = sanitizeApiKey(process.env.OPENAI_API_KEY)
    if (key) env.OPENAI_API_KEY = key
  } else {
    const key = sanitizeApiKey(process.env.OPENAI_API_KEY)
    if (!key) {
      console.error('Cannot apply an OpenAI profile without OPENAI_API_KEY.')
      return false
    }
    env.OPENAI_BASE_URL =
      process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    env.OPENAI_MODEL = model || getGoalDefaultOpenAIModel(goal)
    env.OPENAI_API_KEY = key
  }

  const profileFile: ProfileFile = {
    profile,
    env,
    createdAt: new Date().toISOString(),
  }

  writeFileSync(
    resolve(process.cwd(), '.openclaude-profile.json'),
    JSON.stringify(profileFile, null, 2),
    'utf8',
  )
  return true
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2))
  const ollamaAvailable =
    options.provider !== 'openai' &&
    (await hasLocalOllama(options.baseUrl ?? undefined))
  const ollamaModels = ollamaAvailable
    ? await listOllamaModels(options.baseUrl ?? undefined)
    : []

  const heuristicRanked = rankOllamaModels(ollamaModels, options.goal)
  const benchmarkInput = options.benchmark ? heuristicRanked.slice(0, 3) : []

  const benchmarkResults: Record<string, number | null> = {}
  for (const model of benchmarkInput) {
    benchmarkResults[model.name] = await benchmarkOllamaModel(
      model.name,
      options.baseUrl ?? undefined,
    )
  }

  const rankedModels: BenchmarkedOllamaModel[] = options.benchmark
    ? applyBenchmarkLatency(heuristicRanked, benchmarkResults, options.goal)
    : heuristicRanked.map(model => ({
        ...model,
        benchmarkMs: null,
      }))

  const recommendedOllama = rankedModels[0] ?? null
  const openAIConfigured = Boolean(sanitizeApiKey(process.env.OPENAI_API_KEY))

  let recommendedProfile: ProviderProfile
  let recommendedModel: string

  if (options.provider === 'openai') {
    recommendedProfile = 'openai'
    recommendedModel = getGoalDefaultOpenAIModel(options.goal)
  } else if (options.provider === 'ollama') {
    if (!recommendedOllama) {
      console.error(
        'No Ollama models were discovered. Pull a model first or switch to --provider openai.',
      )
      process.exit(1)
    }
    recommendedProfile = 'ollama'
    recommendedModel = recommendedOllama.name
  } else if (recommendedOllama) {
    recommendedProfile = 'ollama'
    recommendedModel = recommendedOllama.name
  } else {
    recommendedProfile = 'openai'
    recommendedModel = getGoalDefaultOpenAIModel(options.goal)
  }

  let applied = false
  if (options.apply) {
    applied = await maybeApplyProfile(
      recommendedProfile,
      recommendedModel,
      options.goal,
      options.baseUrl,
    )
    if (!applied) {
      process.exit(1)
    }
  }

  const payload = {
    goal: options.goal,
    provider: options.provider,
    ollamaAvailable,
    openAIConfigured,
    recommendedProfile,
    recommendedModel,
    benchmarked: options.benchmark,
    rankedModels,
    applied,
  }

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  printHumanSummary({
    goal: options.goal,
    recommendedProfile,
    recommendedModel,
    rankedModels,
    benchmarked: options.benchmark,
    applied,
  })

  if (!recommendedOllama && !openAIConfigured) {
    console.log(
      '\nNo local Ollama model was detected and OPENAI_API_KEY is unset.',
    )
    console.log(
      'Next steps: `ollama pull qwen2.5-coder:7b` or set OPENAI_API_KEY.',
    )
  }
}

await main()

export {}
