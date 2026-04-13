// 1. Get the list of fields to mask
var maskVar = context.getVariable("api_mask_elements");
var maskArray = (typeof maskVar === 'string') ? maskVar.split(" ") : (maskVar || []);

// 2. Get the RAW query string from the specific header
// HIGHLIGHT: Instead of request.queryparams.names, we use the header value
var rawQueryString = context.getVariable("request.header.request_querystring") || "";

if (rawQueryString !== "") {
    // HIGHLIGHT: Manually split the string into "key=value" pairs
    var pairs = rawQueryString.split("&");
    var processedPairs = [];

    for (var i = 0; i < pairs.length; i++) {
        var pair = pairs[i].split("=");
        var key = pair[0];
        var value = pair[1] || "";

        // Check if the key needs masking
        if (maskArray.indexOf(key) !== -1) {
            value = applyMask(value);
        }

        // Reconstruct the pair
        processedPairs.push(key + "=" + value);
    }

    // 3. Join them back together and save back to a variable
    var finalQueryString = processedPairs.join("&");
    context.setVariable("request.header.request_querystring", finalQueryString);
}

function applyMask(val) {
    if (!val) return "#####";
    var str = String(val);
    var prefix = (str.length > 4) ? str.substring(0, 4) : 
                 ((str.length === 4) ? str.substring(0, 2) : 
                 ((str.length === 3) ? str.substring(0, 1) : ""));
    return prefix + "#####";
}
