import { expect, test } from 'bun:test'

import {
  INITIAL_STATE,
  parseMultipleKeypresses,
} from '../parse-keypress.ts'
import { InputEvent } from './input-event.ts'

/**
 * Helper to simulate terminal input and convert it into InputEvent instances.
 *
 * Since the input parser is streaming, single ESC sequences might be buffered.
 * Set `flush: true` to force the parser to emit any buffered sequences.
 */
function parseInputEvents(sequence: string, flush = false): InputEvent[] {
  const [items, state] = parseMultipleKeypresses(INITIAL_STATE, sequence)
  let allItems = items
  if (flush) {
    const [flushedItems] = parseMultipleKeypresses(state, null)
    allItems = [...items, ...flushedItems]
  }

  const events: InputEvent[] = []
  for (const item of allItems) {
    if (item.kind === 'key') {
      events.push(new InputEvent(item))
    }
  }

  return events
}

test('meta key no longer falls back for meta + up arrow', () => {
  const events = parseInputEvents('\u001b\u001b[A', true)
  expect(events).toHaveLength(2)

  const escapeEvent = events[0]!
  expect(escapeEvent.key.escape).toBe(true)
  // New behavior: meta is false for a plain Escape
  expect(escapeEvent.key.meta).toBe(false)

  const upEvent = events[1]!
  expect(upEvent.key.upArrow).toBe(true)
  expect(upEvent.key.meta).toBe(false)
})

test('meta key no longer falls back for escape', () => {
  const events = parseInputEvents('\u001b', true)
  expect(events).toHaveLength(1)
  const event = events[0]!

  expect(event.key.escape).toBe(true)
  // New behavior: meta is false for Escape
  expect(event.key.meta).toBe(false)
})

test('still strips leading ESC from input', () => {
  // \u001ba is Meta+a.
  const events = parseInputEvents('\u001ba')
  expect(events).toHaveLength(1)
  const event = events[0]!

  expect(event.key.meta).toBe(true)
  // We decided to keep this behavior to avoid regressions in input parsing
  expect(event.input).toBe('a')
})
