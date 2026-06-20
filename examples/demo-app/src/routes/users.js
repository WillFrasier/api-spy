// T037+T038 — /api/v1/users/:id route.
// Instruments three fake calls (DB, HTTP, LLM) with realistic timing.

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
    const user = await apiSpy.track('db.users.findById',
      () => findUser(id),
      { metadata: { table: 'users', id } }
    )

    // Stage 2: parallel HTTP fetch (the profile service)
    const profile = await apiSpy.track('http.upstream.profile',
      () => fetchProfile(user.id),
      { metadata: { url: `https://profile.example.com/${user.id}` } }
    )

    // Stage 3: LLM summary
    const summary = await apiSpy.track('llm.gpt-4o-mini.summarize',
      () => summarize({ ...user, theme: profile.theme }),
      {
        metadata: {
          model: 'gpt-4o-mini',
          tokensIn: profile.text.length,
          tokensOut: 24,
          costUsd: 0.000123,
          provider: 'openai'
        }
      }
    )

    res.json({ id, name: user.name, theme: profile.theme, summary })
  } catch (err) {
    next(err)
  }
})

export default router