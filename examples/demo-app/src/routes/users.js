// T037+T038 — /api/v1/users/:id route.
// Instruments three fake calls (DB, HTTP, LLM) with realistic timing.
//
// Uses the imperative bracket API (`apiSpy.start()` / `apiSpy.end()`)
// instead of `apiSpy.track()` so the call shape mirrors the code —
// no closure wrapping, no second return-value dependency. The two
// APIs produce identical records on the wire.

import { Router } from 'express'
import * as apiSpy from 'api-spy'
import { findUser } from '../fakes/db.js'
import { fetchProfile } from '../fakes/http.js'
import { summarize } from '../fakes/llm.js'

const router = Router()

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params

    // Stage 1: DB read
    const userId = apiSpy.start('db.users.findById', { metadata: { table: 'users', id } })
    const user = await findUser(id)
    apiSpy.end(userId)

    // Stage 2: HTTP fetch (profile service)
    const profileId = apiSpy.start('http.upstream.profile', {
      metadata: { url: `https://profile.example.com/${user.id}` }
    })
    const profile = await fetchProfile(user.id)
    apiSpy.end(profileId)

    // Stage 3: LLM summary — post-call metadata (tokens / cost) attached at end().
    const summaryId = apiSpy.start('llm.gpt-4o-mini.summarize', {
      metadata: { model: 'gpt-4o-mini', provider: 'openai' }
    })
    const summary = await summarize({ ...user, theme: profile.theme })
    apiSpy.end(summaryId, {
      metadata: {
        tokensIn: profile.text.length,
        tokensOut: 24,
        costUsd: 0.000123
      }
    })

    res.json({ id, name: user.name, theme: profile.theme, summary })
  } catch (err) {
    next(err)
  }
})

export default router