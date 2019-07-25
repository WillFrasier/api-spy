console.log("[ApiSpy.panel.js] Init");
const requestStore = [];
const panelDevToolsHost = window.host || window.chrome || window.browser;
const maxNumberOfRequestsToRender = 100;

/**
 * Occurs when a message is received. REsponsible for adding the response to the internal storage
 */
function onMessageReceivedHandler(message, sender, sendResponse) {
    let existingRequest = requestStore.find(r => r.incomingApiSpyHeader === message.request.incomingApiSpyHeader);

    if (!existingRequest) {
        existingRequest = message.request;
        requestStore.push(existingRequest)
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
        renderDetailsPanel(requestFromStore.apiSpyRequestDetails);
    } else {
        $.getJSON(apiSpyUri, function (data) {
            if (data) {
                requestFromStore.apiSpyRequestDetails = data;
                renderDetailsPanel(requestFromStore.apiSpyRequestDetails);
            }
        });
    }
}

function renderDetailsPanel(apiSpyResponseData) {

    const loadingContainer = $('#api-spy-panel #details-container #loading-container');
    const detailsPanel = $('#api-spy-panel #details-container #details-panel');
    const ganttChartContainer = $('#api-spy-panel #details-container #gantt-chart-container');
    ganttChartContainer.empty();

    const overallDuration = apiSpyResponseData.timing.durationInMilliseconds;
    const momentOverallStart = moment(apiSpyResponseData.timing.startTime);

    if (apiSpyResponseData.queries && apiSpyResponseData.queries.length > 0) {
        apiSpyResponseData.queries.forEach((query, index) => {
            const gridRow = index + 1; // because grid rows are 1 based
            ganttChartContainer.append($(`<div class='name' style='grid-row: ${gridRow};'>${query.name}</div>`));
            ganttChartContainer.append($(`<div class='cache' style='grid-row: ${gridRow};'>${query.resultFromCache}</div>`));
            ganttChartContainer.append($(`<div class='duration' style='grid-row: ${gridRow};'>${query.queryDuration}ms</div>`));

            // calculate the timing bar
            const momentQueryStart = moment(query.queryStart);

            const durationBetweenOverallStartAndApiStart = momentQueryStart.diff(momentOverallStart);
            const queryStartAsPercentageOfTotal = Math.round(
                Math.ceil((durationBetweenOverallStartAndApiStart / overallDuration) * 100),
                0
            );
            const queryEndAsPercentageOfTotal = Math.round(
                Math.ceil(((durationBetweenOverallStartAndApiStart + query.queryDuration) /overallDuration) * 100),
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

    loadingContainer.hide();
    detailsPanel.show();
    ganttChartContainer.show();
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
            .filter(r => r.tabId === currentTab.id)
            .slice(0, maxNumberOfRequestsToRender);

        if (requestStoreClone && requestStoreClone.length > 0) {
            tbody.empty();

            requestStoreClone.forEach(request => {
                const requestUri = new URL(request.url);
                const formattedUri = requestUri.pathname + requestUri.search;

                const requestUriCell = $(`<td class='request-uri link-button'>${formattedUri}</td>`);
                requestUriCell.data('request', request);
                requestUriCell.click((e) => {
                    const request = $(e.target).data('request');
                    handleRequestClick(request);
                });

                tbody.append($('<tr>')
                    .append(requestUriCell)
                    .append($(`<td>${request.status}</td>`))
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

