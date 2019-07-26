console.log("[ApiSpy.panel.js] Init");
const requestStore = [];
const panelDevToolsHost = window.host || window.chrome || window.browser;
const maxNumberOfRequestsToRender = 50;

/**
 * Occurs when a message is received. REsponsible for adding the response to the internal storage
 */
function onMessageReceivedHandler(message, sender, sendResponse) {
    let existingRequest = requestStore.find(r => r.incomingApiSpyHeader === message.request.incomingApiSpyHeader);

    if (!existingRequest) {
        existingRequest = message.request;
        console.log(`[ApiSpy.panel.onMessageReceivedHandler] Received request (startTime: ${existingRequest.startTime}; endTime: ${existingRequest.endTime}; requestDuration: ${existingRequest.requestDuration})`);
        requestStore.push(existingRequest)
    } else {
        // update case - i.e. status updated
        // TODO....
    }
    // return true here signals that this should be async
    // according to the [documentation](https://developer.chrome.com/apps/messaging#simple)
    sendResponse({ received: true });

    renderTable();
}


/**
 * Occurs when the user clicks an individual request
 * Responsible for rendering the details table
 */
function handleRequestClick(request) {

    if (!request) {
        console.log(`[ApiSpy.panel.handleRequestClick] Received a null request. Bailing...`);
        return;
    }

    const requestUri = new URL(request.url);
    const serverDomain = requestUri.protocol + '//' + requestUri.hostname + (requestUri.port ? ':' + requestUri.port : '');
    const apiSpyUri = `${serverDomain}/api/v1/apiDebugger/${request.incomingApiSpyHeader}`;

    const requestFromStore = requestStore.find(r => r.incomingApiSpyHeader === request.incomingApiSpyHeader);

    if (requestFromStore && requestFromStore.apiSpyRequestDetails) {
        renderDetailsPanel(requestFromStore);
    } else {
        $.getJSON(apiSpyUri, function (data) {
            if (data) {

                // const HARDCODE = {
                //     "requestId": "20174bac-2668-48bb-8766-6c076ca37f9a",
                //     "timing": {
                //         "startTime": "2019-01-01T12:00:00.000Z",
                //         "endTime": "2019-01-01T12:00:10.000Z",
                //         "durationInMilliseconds": 108
                //     },
                //     "queries": [
                //         {
                //             "cacheResultId": "3f1646b4b2f241918fc7b25bb24c663e",
                //             "name": "0 - 2",
                //             "cacheKey": "undefined:undefined:view_Metrics:f37b452e36ac80f4e6685efa185cc2e7::id:3813803928195232275",
                //             "dataDriver": 0,
                //             "ttl": 30,
                //             "queryStart": "2019-01-01T12:00:00.000Z",
                //             "queryDuration": 47,
                //             "evaluatedQuery": "",
                //             "resultFromCache": false,
                //             "requestId": "20174bac-2668-48bb-8766-6c076ca37f9a",
                //             "datasetQueryDuration": 47,
                //             "datasetQueryStart": "2019-01-01T12:00:02.000Z",
                //             "queryStatistics": null
                //         },
                //         {
                //             "cacheResultId": "3f1646b4b2f241918fc7b25bb24c663e",
                //             "name": "4 - 6",
                //             "cacheKey": "undefined:undefined:view_Metrics:f37b452e36ac80f4e6685efa185cc2e7::id:3813803928195232275",
                //             "dataDriver": 0,
                //             "ttl": 30,
                //             "queryStart": "2019-01-01T12:00:04.000Z",
                //             "queryDuration": 47,
                //             "evaluatedQuery": "",
                //             "resultFromCache": false,
                //             "requestId": "20174bac-2668-48bb-8766-6c076ca37f9a",
                //             "datasetQueryDuration": 47,
                //             "datasetQueryStart": "2019-01-01T12:00:06.000Z",
                //             "queryStatistics": null
                //         }
                //     ]
                // };
                // requestFromStore.apiSpyRequestDetails = HARDCODE;


                requestFromStore.apiSpyRequestDetails = data;

                // ensure timestamps are aligned between client and server
                ensureTimestampIntegrity(requestFromStore);

                // render!
                renderDetailsPanel(requestFromStore);
            }
        });
    }
}

/**
 * The client time (as recorded in the browser) can different from the server time (as recorded on the server).
 * If the earliest server time starts before the client start time this is cleanly wrong.
 * to combat this situation all we can do is to move the start times back where the 
 * earliest server start time becomes the client start time 
 */
function ensureTimestampIntegrity(requestFromStore) {

    if (!requestFromStore || !requestFromStore.apiSpyRequestDetails || !requestFromStore.apiSpyRequestDetails.queries) {
        return;
    }

    const clientStartTime = new Date(requestFromStore.startTime);

    let earliestServerStartTime = null;

    // find the earliest time
    requestFromStore.apiSpyRequestDetails.queries.forEach(query => {
        const queryStart = new Date(query.queryStart);
        if (!earliestServerStartTime ||
            earliestServerStartTime > queryStart) {
            earliestServerStartTime = queryStart;
        }
    })

    // if the earliest server start time is > than the client start time
    // then get the delta and bump all the server times up by that amount
    if (earliestServerStartTime < clientStartTime) {
        const delta = clientStartTime - earliestServerStartTime;
        requestFromStore.apiSpyRequestDetails.queries.forEach(query => {
            query.startTime = moment(query.startTime).add(delta, 'milliseconds').toDate();
        });
    }

}

function renderDetailsPanel(apiSpyResponseData) {

    const loadingContainer = $('#api-spy-panel #details-container #loading-container');
    const detailsPanel = $('#api-spy-panel #details-container #details-panel');
    const ganttChartContainer = $('#api-spy-panel #details-container #gantt-chart-container');
    const queryDetails = $('#api-spy-panel #details-container #details-panel #query-details-container');

    const apiDuration = apiSpyResponseData.apiSpyRequestDetails.timing.durationInMilliseconds;
    const overallStart = new Date(apiSpyResponseData.startTime);
    const overallDuration = apiSpyResponseData.requestDuration;
    const apiDurationAsPercentageOfTotal = Math.round((apiDuration / overallDuration) * 100, 2);

    let queriesTotal, queriesCached, queriesNotCached = 0;

    if (apiSpyResponseData.apiSpyRequestDetails && apiSpyResponseData.apiSpyRequestDetails.queries && apiSpyResponseData.apiSpyRequestDetails.queries.length > 0) {
        queriesTotal = apiSpyResponseData.apiSpyRequestDetails.queries.length;
        queriesCached = apiSpyResponseData.apiSpyRequestDetails.queries.filter(q => q.resultFromCache).length;
        queriesNotCached = apiSpyResponseData.apiSpyRequestDetails.queries.filter(q => !q.resultFromCache).length;
    }

    // summary
    detailsPanel.find('.property.request-id > div').text(apiSpyResponseData.incomingApiSpyHeader);
    detailsPanel.find('.property.uri > div').text(apiSpyResponseData.uri);
    detailsPanel.find('.property.overall-time > div').text(overallDuration + 'ms');
    detailsPanel.find('.property.api-time > div').text(`${apiDuration}ms (${apiDurationAsPercentageOfTotal}% of total)`);
    detailsPanel.find('.property.queries-total > div').text(queriesTotal);
    detailsPanel.find('.property.queries-cached > div').text(queriesCached);
    detailsPanel.find('.property.queries-not-cached > div').text(queriesNotCached);

    // debug
    detailsPanel.find('#debug-panel').text(JSON.stringify(apiSpyResponseData.apiSpyRequestDetails, null, '\t'));

    // request timing
    ganttChartContainer.empty();

    if (apiSpyResponseData.apiSpyRequestDetails.queries && apiSpyResponseData.apiSpyRequestDetails.queries.length > 0) {

        const queriesSortedByStartTime = apiSpyResponseData.apiSpyRequestDetails.queries.sort(function (a, b) {
            return new Date(a.queryStart) > new Date(b.queryStart);
        });

        queriesSortedByStartTime.forEach((query, index) => {
            const gridRow = index + 1; // because grid rows are 1 based

            if (query.queryDuration < 1) {
                // nothing takes no time
                query.queryDuration = 1;
            }

            const cssClassCache = query.resultFromCache ? 'font-color-good' : 'font-color-bad';
            const queryStart = new Date(query.queryStart);
            const durationBetweenOverallStartAndApiStart = queryStart - overallStart;
            const queryStartAsPercentageOfTotal = Math.round(
                Math.ceil((durationBetweenOverallStartAndApiStart / overallDuration) * 100),
                0
            );
            const queryDurationAsPercentageOfTotal = Math.round(
                Math.ceil((query.queryDuration / overallDuration) * 100),
                2
            );
            const requestQueryUriCell = $(`<td class='name link-button'>${query.name}</td>`);
            requestQueryUriCell.data('request', apiSpyResponseData);
            requestQueryUriCell.data('query', query);
            requestQueryUriCell.click((e) => {
                const request = $(e.target).data('request');
                const query = $(e.target).data('query');
                renderQueryDetails(request, query);
            });
            ganttChartContainer.append(requestQueryUriCell);

            // ganttChartContainer.append($(`<div class='name' style='grid-row: ${gridRow};'>${query.name}</div>`));
            ganttChartContainer.append($(`<div class='cache ${cssClassCache}' style='grid-row: ${gridRow};'>${query.resultFromCache}</div>`));
            ganttChartContainer.append($(`<div class='duration' style='grid-row: ${gridRow};'>${query.queryDuration}ms (${queryDurationAsPercentageOfTotal} % of total)</div>`));

            const queryEndAsPercentageOfTotal = Math.round(
                Math.ceil(((durationBetweenOverallStartAndApiStart + query.queryDuration) / overallDuration) * 100),
                0
            );
            let queryOverallPercentageOfRequestTime = Math.round((query.queryDuration / overallDuration) * 100, 2);

            if (queryOverallPercentageOfRequestTime < 1) {
                // nothing takes zero time. push this to 1 ms to 1% so show something on the page
                queryOverallPercentageOfRequestTime = 1;
            }

            // gantt bar - spans the entire background
            ganttChartContainer.append($(`<div class='gantt-background' style='grid-row: ${gridRow};'></div>`));

            // add 4 here because we start at column 4
            ganttChartContainer.append($(`<div class='gantt-bar' style='grid-row: ${gridRow}; grid-column-start: ${queryStartAsPercentageOfTotal + 4}; grid-column-end: ${queryEndAsPercentageOfTotal + 4};'>&nbsp;</div>`));

        })
    }

    // hide query details as we haven't selected anything yet
    queryDetails.hide();

    loadingContainer.hide();
    ganttChartContainer.show();
    detailsPanel.show();

}

/**
 * Renders request query table
 */
function renderQueryDetails(request, query) {

    const queryDetails = $('#api-spy-panel #details-container #details-panel #query-details-container');
    const overallStart = new Date(request.startTime);
    const overallDuration = request.requestDuration;
    const queryStart = new Date(query.queryStart);
    const durationBetweenOverallStartAndApiStart = overallStart - queryStart;
    const queryStartAsPercentageOfTotal = Math.round(
        Math.ceil((durationBetweenOverallStartAndApiStart / overallDuration) * 100),
        0
    );
    const cacheCssClass = query.resultFromCache ? 'font-color-good' : 'font-color-bad';
    const codeFormatted = query.evaluatedQuery.replace(/(?:\r\n|\r|\n)/g, '<br>');

    // summary
    queryDetails.find('.property.query-name > div').text(query.name);
    queryDetails.find('.property.query-start > div').text(query.queryStart);
    queryDetails.find('.property.query-duration > div').text(`${query.queryDuration}ms (${queryStartAsPercentageOfTotal}% of total)`);
    queryDetails.find('.property.query-from-cache > div')
        .attr('class', cacheCssClass)
        .text(query.resultFromCache);
    queryDetails.find('.property.query-code > pre').html(codeFormatted);

    if (query.queryStatistics) {
        queryDetails.find('.property.query-stats > pre').text(JSON.stringify(query.queryStatistics, null, '\t'));
        queryDetails.find('.property.query-stats').show();
    } else {
        queryDetails.find('.property.query-stats').hide();
    }

    queryDetails.show();
}

/**
 * Renders the current table
 */
function renderTable() {

    // query for the active tab so that we only render the requests for the currently selected tab
    panelDevToolsHost.tabs.query({
        active: true,
        currentWindow: true
    }, (tabs) => {
        const currentTab = tabs[0];
        if (!currentTab) {
            console.log(`[ApiSpy.panel.renderTable] Unable to acquire current tab. Can't determine which api spy requests to render. Bailing...`);
            return;
        }
        const table = $('#api-spy-panel #requests-container #requests-table');
        const tbody = $('#api-spy-panel #requests-container #requests-table tbody');
        const requestStoreClone = requestStore
            //.filter(r => r.tabId === currentTab.id)
            .slice(0, maxNumberOfRequestsToRender);

        if (requestStoreClone && requestStoreClone.length > 0) {
            tbody.empty();

            requestStoreClone.forEach(request => {
                const requestUri = new URL(request.url);
                const formattedUri = requestUri.pathname + requestUri.search;

                const requestUriCell = $(`<td class='request-uri link-button'>${request.method} ${formattedUri}</td>`);
                requestUriCell.data('request', request);
                requestUriCell.click((e) => {
                    const request = $(e.target).data('request');
                    handleRequestClick(request);
                });

                const cssStatusClass = request.statusCode === 200 ? 'font-color-good' : 'font-color-bad';
                tbody.append($('<tr>')
                    .append(requestUriCell)
                    .append($(`<td class='${cssStatusClass}'>${request.status} (${request.statusCode})</td>`))
                    .append($(`<td>${request.requestDuration}</td>`))
                );
            });
            table.show();
        } else {
            // hide table
            table.hide();
        }

    });
}

// wire up event handler
if (panelDevToolsHost && panelDevToolsHost.runtime) {
    panelDevToolsHost.runtime.onMessage.addListener(onMessageReceivedHandler);
}

