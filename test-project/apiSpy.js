var createNamespace = require('continuation-local-storage').createNamespace
var session = createNamespace('ApiSpy')
const uuidv5 = require('uuid/v5')
const requestLocalStorage = require('request-local-storage')
const RLS = require('request-local-storage').getNamespace()
const async_hooks = require('async_hooks')

// config
const namespace = '0e016a24-c738-4a33-8b5d-4d8ec0aeee25'
const responseHeaderName = 'X-ApiSpy-RequestId'
const requestStorage = {}

function generateUuid () {
  const seed = new Date().valueOf().toString()
  return uuidv5(seed, namespace)
}
function getRequestIdUsingRequestLocalStorage () {
  if (!RLS().requestId) {
    const requestId = generateUuid()
    RLS().requestId = requestId
  }
  return RLS().requestId
}

function getRequestIdUsingContinuationLocalStorage () {
  const requestId = generateUuid()
  session.set('requestId', requestId)
  return requestId
}

module.exports.initApiSpy = function (req, res, next) {
  const { requestId } = session.run(getRequestIdUsingContinuationLocalStorage)
  res.setHeader(responseHeaderName, requestId)
  next()
}

module.exports.trackStartRequest = function () {
  const requestId = session.get('requestId')
  console.log(requestId)
}
