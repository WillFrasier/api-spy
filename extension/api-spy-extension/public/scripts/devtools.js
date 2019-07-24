console.log("[ApiSpy.devtools.js] Init");
const host = window.chrome || window.browser;
if (host && host.devtools) {
    host.devtools.panels.create(
        "Api Spy", // name
        "favicon.ico", // icon
        "panel.html", // source
        function(panel) { // callback
            console.log("[ApiSpy.devtools.js] hello from inside devtools.js callback"); 
        });
} else {
    console.log('[ApiSpy.devtools.js] could not acquire reference to the browser host')
}
