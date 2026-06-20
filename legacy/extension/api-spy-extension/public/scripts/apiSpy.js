(function () {
    // TODO: change this header name once the backend has been updated
    const apiSpyHeaderName = 'apirequestid';

    window.tabStorage = {};
    const tabStorage = window.tabStorage;
    const host = window.chrome || window.browser;
    const networkFilters = {
        urls: [
            "*://*.edgeteam.ms/*"
        ]
    };

    if (!host) {
        console.warn('[ApiSpy] could not acquire reference to the browser host')
        return;
    }

    /**
     * Generates a GUID that is compliant with https://www.ietf.org/rfc/rfc4122.txt
     */
    function generateGuid() {
        let format = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
        return format.replace(/[xy]/g, function (c) {
            let r = (Math.random() * 16) | 0,
                v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    /**
     * Returns the current request for the specified details
     * Will return null if it doesn't exist
     */
    function getRequest(details) {
        const { tabId, requestId } = details;
        if (tabStorage[tabId] && tabStorage[tabId].requests[requestId]) {
            return tabStorage[tabId].requests[requestId];
        } else {
            return null;
        }
    }

    /**
     * Saves the current request to tab storage and returns the object
     */
    function registerRequest(details) {
        const { tabId, requestId } = details;
        if (!details || !tabId || !requestId) {
            return;
        }
        const startTime = new Date().getTime();
        if (!tabStorage[tabId]) {
            tabStorage[tabId] = {
                id: tabId,
                requests: {},
                registerTime: startTime
            };
        }
        tabStorage[tabId].requests[requestId] = {
            tabId: tabId,
            requestId: requestId,
            url: details.url,
            startTime: startTime,
            status: 'pending'
        };
    }
    /**
     * Sends the specified request to the dev tools panel via [extension messaging](https://developers.chrome.com/extensions/messaging)
     */
    function invokeSendMessage(requestToSend, reason) {
        const message = {
            reason: reason,
            request: requestToSend
        };
        console.log(`[ApiSpy.invokeSendMessage] Sending request (startTime: ${requestToSend.startTime}; endTime: ${requestToSend.endTime}; requestDuration: ${requestToSend.requestDuration})`);

        // send message
        host.runtime.sendMessage(
            message,
            (response) => {
                console.log(`[ApiSpy.invokeSendMessage] Message received: ${JSON.stringify(response)}`);
            }
        );
    }

    host.webRequest.onBeforeRequest.addListener(
        function (details) {
            registerRequest(details);
        },
        { urls: ["<all_urls>"] },
        []);

    /**
     * Occurs before sending request headers, adds the Api Spy request
     * header if it doesn't already exist
     */
    host.webRequest.onBeforeSendHeaders.addListener(
        function (details) {
            const { tabId, requestId } = details;
            const requestGuid = generateGuid();
            const request = getRequest(details);
            if (request) {
                tabStorage[tabId].requests[requestId].requestGuid = requestGuid;
                const apiSpyHeader = details.requestHeaders.find(header => {
                    return header.name === apiSpyHeaderName;
                });
                if (!apiSpyHeader) {
                    details.requestHeaders.push({
                        name: apiSpyHeaderName,
                        value: requestGuid
                    })
                }
                return { requestHeaders: details.requestHeaders };
            }
        },
        { urls: ["<all_urls>"] },
        ["blocking", "requestHeaders"]);

    /**
     * Occurs when we first received the status line and the headers. 
     * Parses out the api spy request id header, if not found deletes the 
     * entry from the central store  
     */
    host.webRequest.onResponseStarted.addListener(
        function (details) {
            const { tabId, requestId } = details;

            if (!details.responseHeaders) {
                console.log(`[ApiSpy.onResponseStarted] No response headers returned for: ${details.url}`);
                return;
            }
            const incomingApiSpyHeader = details.responseHeaders.find(header => {
                return header.name === apiSpyHeaderName;
            });

            if (!incomingApiSpyHeader) {
                // this request does not have an api spy header
                // remove it from the list and move on
                delete tabStorage[tabId].requests[requestId];
                return;
            }
            const request = getRequest(details);
            if (request) {
                tabStorage[tabId].requests[requestId].incomingApiSpyHeader = incomingApiSpyHeader.value;
                console.log(`[ApiSpy] Api Response Acquired: ${details.url}`);
            }
        },
        { urls: ["<all_urls>"] },
        ["extraHeaders", "responseHeaders"]);

    /**
     * Occurs at the start of a request. Registers the request with the central store
     */
    host.webRequest.onCompleted.addListener((details) => {
        const { tabId, requestId } = details;
        const request = getRequest(details);
        if (request) {
            // we will only have a registry if we have received
            // the proper header. Otherwise the entry will be deleted
            // to save memory in function onResponseStarted
            const endTime = new Date().getTime();
            const requestDuration = moment(endTime).diff(moment(request.startTime))
            if (request.incomingApiSpyHeader) {
                Object.assign(request, {
                    endTime: endTime,
                    requestDuration: requestDuration,
                    method: details.method,
                    statusCode: details.statusCode,
                    status: 'complete'
                });
                tabStorage[tabId].requests[requestId] = request;
                invokeSendMessage(request, 'complete');
            }
        }
    }, networkFilters);

    /**
     * Is fired when a request error occurs.
     */
    host.webRequest.onErrorOccurred.addListener((details) => {
        const { tabId, requestId } = details;
        const request = getRequest(details);
        if (request) {
            const endTime = new Date().getTime();
            Object.assign(request, {
                endTime: endTime,
                requestDuration: endTime - request.startTime,
                status: 'error',
            });
            tabStorage[tabId].requests[requestId] = request;
        }
    }, networkFilters);

    /**
     * Occurs when new tab is activated
     */
    host.tabs.onActivated.addListener((tab) => {
        const tabId = tab ? tab.tabId : host.tabs.TAB_ID_NONE;
        if (!tabStorage.hasOwnProperty(tabId)) {
            tabStorage[tabId] = {
                id: tabId,
                requests: {},
                registerTime: new Date().getTime()
            };
        }
    });
    /**
     * Occurs when tab is removed
     */
    host.tabs.onRemoved.addListener((tab) => {
        const tabId = tab.tabId;
        if (!tabStorage.hasOwnProperty(tabId)) {
            return;
        }
        tabStorage[tabId] = null;
    });
}());