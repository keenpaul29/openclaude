import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyBenchmarkLatency,
  getGoalDefaultOpenAIModel,
  normalizeRecommendationGoal,
  rankOllamaModels,
  recommendOllamaModel,
  type OllamaModelDescriptor,
} from './providerRecommendation.ts'

function model(
  name: string,
  overrides: Partial<OllamaModelDescriptor> = {},
): OllamaModelDescriptor {
  return {
    name,
    sizeBytes: null,
    family: null,
    families: [],
    parameterSize: null,
    quantizationLevel: null,
    ...overrides,
  }
}

test('normalizes recommendation goals safely', () => {
  assert.equal(normalizeRecommendationGoal('coding'), 'coding')
  assert.equal(normalizeRecommendationGoal(' LATENCY '), 'latency')
  assert.equal(normalizeRecommendationGoal('weird'), 'balanced')
  assert.equal(normalizeRecommendationGoal(undefined), 'balanced')
})

test('coding goal prefers coding-oriented ollama models', () => {
  const recommended = recommendOllamaModel(
    [
      model('llama3.1:8b', {
        parameterSize: '8B',
        quantizationLevel: 'Q4_K_M',
      }),
      model('qwen2.5-coder:7b', {
        parameterSize: '7B',
        quantizationLevel: 'Q4_K_M',
      }),
    ],
    'coding',
  )

  assert.equal(recommended?.name, 'qwen2.5-coder:7b')
})

test('latency goal prefers smaller models', () => {
  const recommended = recommendOllamaModel(
    [
      model('llama3.1:70b', {
        parameterSize: '70B',
        quantizationLevel: 'Q4_K_M',
      }),
      model('llama3.2:3b', {
        parameterSize: '3B',
        quantizationLevel: 'Q4_K_M',
      }),
    ],
    'latency',
  )

  assert.equal(recommended?.name, 'llama3.2:3b')
})

test('non-chat embedding models are heavily demoted', () => {
  const ranked = rankOllamaModels(
    [
      model('nomic-embed-text', { parameterSize: '0.5B' }),
      model('mistral:7b-instruct', {
        parameterSize: '7B',
        quantizationLevel: 'Q4_K_M',
      }),
    ],
    'balanced',
  )

  assert.equal(ranked[0]?.name, 'mistral:7b-instruct')
})

test('benchmark latency can reorder close recommendations', () => {
  const ranked = rankOllamaModels(
    [
      model('llama3.1:8b', {
        parameterSize: '8B',
        quantizationLevel: 'Q4_K_M',
      }),
      model('mistral:7b-instruct', {
        parameterSize: '7B',
        quantizationLevel: 'Q4_K_M',
      }),
    ],
    'latency',
  )

  const benchmarked = applyBenchmarkLatency(
    ranked,
    {
      'llama3.1:8b': 2000,
      'mistral:7b-instruct': 350,
    },
    'latency',
  )

  assert.equal(benchmarked[0]?.name, 'mistral:7b-instruct')
  assert.equal(benchmarked[0]?.benchmarkMs, 350)
})

test('goal defaults choose sensible openai models', () => {
  assert.equal(getGoalDefaultOpenAIModel('latency'), 'gpt-4o-mini')
  assert.equal(getGoalDefaultOpenAIModel('balanced'), 'gpt-4o')
  assert.equal(getGoalDefaultOpenAIModel('coding'), 'gpt-4o')
})
