console.log("[ApiSpy.panel.js] Init");
const requestStore = [];
const panelDevToolsHost = window.host || window.chrome || window.browser;

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
    const tbody = $('#requests-container #requests-table tbody');
    const requestStoreClone = requestStore.slice();
    tbody.empty();

    requestStoreClone.forEach(request => {
        tbody.append($('<tr>')
            .append($(`<td>${request.incomingApiSpyHeader}</td>`))
            .append($(`<td>${request.url}</td>`))
            .append($(`<td>${request.status}</td>`))
            .append($(`<td>${request.requestDuration}</td>`))
        );
    });
}

// wire up event handler
if (panelDevToolsHost && panelDevToolsHost.runtime) {
    panelDevToolsHost.runtime.onMessage.addListener(onMessageReceivedHandler);
}

