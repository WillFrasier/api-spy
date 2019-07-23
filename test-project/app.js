const { initApiSpy, trackStartRequest } = require('./apiSpy')
const express = require('express')
const app = express()

app.use(initApiSpy)

app.get('/apispy/:id', function (req, res) {
  const { id } = req.params
  const fakeData = {
    requestId: id,
    timing: {
      startTime: '2019-07-23T17:11:37.682Z',
      endTime: '2019-07-23T17:11:37.714Z',
      durationInMilliseconds: 32 },
    queries: [
      { cacheResultId: '5c78e8cdab9d46439a4f6727c1230d0c',
        name: 'getUsageByAppVersion',
        cacheKey: 'https://Anaheim.kusto.windows.net:AnaheimPortal:getUsageByAppVersion:381f925279a2a1a1ee05b812cc9c4ea6::appVersions:77.0.218.4,hoursBack:672,platform:Windows 10+',
        dataDriver: 1,
        ttl: 600,
        evaluatedQuery: 'let hoursBack = 672;\nlet platform = "Windows 10+";\nlet appVersions = dynamic(["77.0.218.4"]);\ngetUsageByAppVersion(hoursBack, platform, appVersions);',
        requestId: id,
        datasetQueryDuration: 3576,
        datasetQueryStart: '2019-07-23T17:05:43.731Z',
        queryStart: '2019-07-23T17:11:37.682Z',
        resultFromCache: true,
        queryDuration: 32,
        queryStatistics: {
          cache: {
            memory: {
              hits: 569102,
              misses: 53,
              total: 569155
            },
            disk: { hits: 18, misses: 27, total: 45 },
            shards: { hitbytes: 0, missbytes: 0, bypassbytes: 0 }
          },
          cpu: { user: '00:00:26.4062500', kernel: '00:00:00.3750000', 'total cpu': '00:00:26.7812500' },
          memory: { peak_per_node: 555392640 }
        }
      }
    ]
  }
  res.send(fakeData)
})

// app.get('/', function (req, res) {
//   trackStartRequest()
// })
app.listen(3001, function () {
  console.log('Example app listening on port 3001!')
})

// app.on('listening', function () {
//   console.log('ok, server is running')
// })
