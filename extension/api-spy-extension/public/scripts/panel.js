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
 * Renders the current table
 */
function renderTable() {

    // query for the active tab so that we only render the requests for the currently selected tab
    panelDevToolsHost.tabs.query({
        active: true,
        currentWindow: true
    }, (tabs) => {
        const currentTab = tabs[0];
        if(!currentTab) {
            console.log(`[ApiSpy] Unable to acquire current tab. Can't determine which api spy requests to render. Bailing...`);
            return;
        }

        const tbody = $('#requests-container #requests-table tbody');
        const requestStoreClone = requestStore
            .filter(r => r.tabId === currentTab.id)
            .slice(0, maxNumberOfRequestsToRender);

        if (requestStoreClone && requestStoreClone.length > 0) {
            tbody.empty();
            
            requestStoreClone.forEach(request => {
                const requestUri = new URL(request.url);
                const formattedUri = requestUri.pathname + requestUri.search;
                tbody.append($('<tr>')
                    .append($(`<td>${request.incomingApiSpyHeader}</td>`))
                    .append($(`<td>${formattedUri}</td>`))
                    .append($(`<td>${request.status}</td>`))
                    .append($(`<td>${request.requestDuration}</td>`))
                );
            });
        }

    });

    panelDevToolsHost.tabs.getCurrent((tab) => {
        

    })
}

// wire up event handler
if (panelDevToolsHost && panelDevToolsHost.runtime) {
    panelDevToolsHost.runtime.onMessage.addListener(onMessageReceivedHandler);
}

