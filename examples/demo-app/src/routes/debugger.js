// T030 — /api/v1/apiDebugger/:id route.
// Validates the id and returns the recorded request tree, or 404 / 400.

import { Router } from 'express'
import * as apiSpy from 'api-spy'

const router = Router()

// Permissive UUID-ish regex: 8-4-4-4-12 hex chars. Matches the SDK's
// randomUUID() output and accepts most variants.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ID_LEN = 128

router.get('/:id', (req, res) => {
  const { id } = req.params

  // Validate (FR-010)
  if (typeof id !== 'string' || id.length === 0 || id.length > MAX_ID_LEN || !UUID_RE.test(id)) {
    return res.status(400).json({
      error: 'bad_request',
      requestId: id,
      reason: 'id must be a UUID-shaped string of length ≤ 128'
    })
  }

  // Look up (FR-008)
  const record = apiSpy._store().get(id)
  if (!record) {
    return res.status(404).json({ error: 'not_found', requestId: id })
  }

  // Shape the wire response per contracts/api-debugger-response.schema.json
  res.json({
    requestId: record.id,
    timing: {
      startTime: record.startTime,
      endTime: record.endTime,
      durationInMilliseconds: record.durationInMilliseconds
    },
    queries: record.queries,
    error: record.error
  })
})

export default router