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
        return format.replace(/[xy]/g, function(c) {
            let r = (Math.random() * 16) | 0,
                v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }
    /**
     * Saves the current request to tab storage and returns the object
     */
    function ensureRequestExists(details) {
        const { tabId, requestId } = details;
        if (!details || !tabId || !requestId) {
            return;
        }
        if (!tabStorage[tabId] ) {
            tabStorage[tabId] = {
                id: tabId,
                requests: {},
                registerTime: new Date().getTime()
            };
        }
        tabStorage[tabId].requests[requestId] = {
            requestId: requestId,
            url: details.url,
            startTime: details.timeStamp,
            status: 'pending'        
        };
    }

    /**
     * Occurs before sending request headers, adds the Api Spy request
     * header if it doesn't already exist
     */
    host.webRequest.onBeforeSendHeaders.addListener(
        function(details) {
            const { tabId, requestId } = details;
            ensureRequestExists(details);
            const requestGuid = generateGuid();
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
        },
        { urls: ["<all_urls>"] },
        [ "blocking", "requestHeaders"]);

    /**
     * Occurs when we first received the status line and the headers. 
     * Parses out the api spy request id header, if not found deletes the 
     * entry from the central store  
     */
    host.webRequest.onResponseStarted.addListener(
        function(details) {
            const { tabId, requestId } = details;
            ensureRequestExists(details);

            if(!details.responseHeaders) {
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

            tabStorage[tabId].requests[requestId].incomingApiSpyHeader = incomingApiSpyHeader.value;
            console.log(`[ApiSpy] Api Response Acquired: ${details.url}`);
        },
        { urls: ["<all_urls>"] },
        [ "extraHeaders", "responseHeaders" ]);

    /**
     * Occurs at the start of a request. Registers the request with the central store
     */
    host.webRequest.onBeforeSendHeaders.addListener((details) => {
        ensureRequestExists(details);
    }, networkFilters);

    host.webRequest.onCompleted.addListener((details) => {
        const { tabId, requestId } = details;
        ensureRequestExists(details);
        const request = tabStorage[tabId].requests[requestId];

        Object.assign(request, {
            endTime: details.timeStamp,
            requestDuration: details.timeStamp - request.startTime,
            status: 'complete'
        });
    }, networkFilters);

    /**
     * Is fired when a request error occurs.
     */
    host.webRequest.onErrorOccurred.addListener((details) => {
        const { tabId, requestId } = details;
        ensureRequestExists(details);

        const request = tabStorage[tabId].requests[requestId];
        Object.assign(request, {
            endTime: details.timeStamp,
            requestDuration: details.timeStamp - request.startTime,
            status: 'error',
        });
    }, networkFilters);

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
    host.tabs.onRemoved.addListener((tab) => {
        const tabId = tab.tabId;
        if (!tabStorage.hasOwnProperty(tabId)) {
            return;
        }
        tabStorage[tabId] = null;
    });
}());