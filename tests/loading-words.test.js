/**
 * Regression coverage for quiet-state loading word behavior.
 */

import { describe, expect, test } from "bun:test"
import {
  LOADING_WORD_DELAY_MS,
  LOADING_WORDS,
  getRandomLoadingWordIndex,
} from "@/lib/loading-words"

describe("loading word rotation", () => {
  test("uses a five second delay between quiet-state words", () => {
    expect(LOADING_WORD_DELAY_MS).toBe(5_000)
  })

  test("selects a random word index instead of the next sequential index", () => {
    const currentIndex = 0
    const randomIndex = getRandomLoadingWordIndex(currentIndex, () => 0.75)

    expect(randomIndex).toBe(Math.floor(LOADING_WORDS.length * 0.75))
    expect(randomIndex).not.toBe(currentIndex + 1)
  })

  test("does not repeat the current word when there is another choice", () => {
    const currentIndex = 0
    const randomIndex = getRandomLoadingWordIndex(currentIndex, () => 0)

    expect(randomIndex).not.toBe(currentIndex)
  })
})
