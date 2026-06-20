const requestLocalStorage = require('request-local-storage')
const localStorageNamespace = require('request-local-storage').getNamespace()
const requestRegister = {}
const config = {
  headerName: 'X-ApiSpy-RequestId',
  cache: null
}

/**
 * Returns the request id currently associated with the current telemetry context. This requires application insights to be enabled.
 */
exports.getRequestId = function () {
  if (!RLS().instance) {
    RLS().instance = new Instance()
  }
}

/**
 * Initializes the api-spy defaults
 *
 * @param {string} [defaults.cache] Required parameter to

 *
 * Refer to the [Api Documentation](https://github.com/willfrasier/api-spy#readme) for details
 */
exports.init = function (defaults) {
  const { cache } = defaults

  if (!cache) {
    console.error('[api-spy] cache is a required parameter')
  } else {
    config.cache = cache
  }
}

/**
 * Tracks when the api request starts.
 *
 * Refer to the [Api Documentation](https://github.com/willfrasier/api-spy#readme) for details
 */
exports.trackRequestStart = function (request, response, next) {
  const requestId = ''
  requestLocalStorage.startRequest(() => {

  })

  if (requestRegister[request.id]) {
    console.warn(`Request Id has already been registered: ${request.id}`)
    return next()
  }

  // write request id to header
  response.setHeader(config.headerName, request.id)

  // track start request
  trackRequestStarted()

  // set end request event handler
  response.on('finish', function () {
    trackRequestCompleted()
  })
}
