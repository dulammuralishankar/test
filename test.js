/* JS to mask specified fields in payload */
function JsonMaskingUtility() {
    this.isMaskable = function (key) {
        var keyParts = key.split(".");
        var maskElement = keyParts[keyParts.length - 1];
        // Ensure exact match with maskElementKeys
        if (this.MASK_ELEMENT_KEYS.indexOf(maskElement) >= 0) {
            return true;
        } else {
            return false;
        }
    };

    this.isArray = function (what) {
        return Object.prototype.toString.call(what) === '[object Array]';
    };

    this.traverseAndMask = function (o, parentKey) {
        for (var i in o) {
            var currentKey = "";
            if (o[i] !== null && typeof o[i] === "object") {
                handleForObject(o, parentKey, i, this);
            } else {
                if (parentKey.endsWith("]")) {
                    currentKey = parentKey + " + " + i;
                } else if (reference.isArray(o[i])) {
                    currentKey = parentKey + " " + i + " + " + i;
                } else {
                    currentKey = parentKey + "." + i;
                }
                if (this.isMaskable(currentKey)) {
                    if (this.mask_all_chars === "TRUE") {
                        o[i] = "####";
                    } else {
                        o[i] = "####" + lengthBasedTrim(o[i]);
                    }
                }
            }
        }
    };

    this.mask = function (jsonObject, maskElementKeys, mask_all_chars) {
        this.MASK_ELEMENT_KEYS = maskElementKeys;
        this.mask_all_chars = mask_all_chars;
        // To avoid modification on original JSON, performing deep copy
        if (this.isArray(jsonObject)) {
            for (var j in jsonObject) {
                this.traverseAndMask(jsonObject[j], "$");
            }
        } else {
            this.traverseAndMask(jsonObject, "$");
        }
        return jsonObject;
    };
}

function handleForObject(o, parentKey, i, reference) {
    var currentKey = "";
    // Going one step down in the object tree
    if (parentKey.endsWith("]")) {
        currentKey = parentKey + " + " + i;
    } else if (reference.isArray(o[i])) {
        currentKey = parentKey + " + " + i + "+ " + i;
    } else {
        currentKey = parentKey + "." + i;
    }
    reference.traverseAndMask(o[i], currentKey);
}

function lengthBasedTrim(plain) {
    /* Calculate the number of characters from the end of string to show unmasked.
     * By default do not extract any chars to show unmasked.
     * If the string is long show more chars and if the string is short show less chars.
     */
    var offset_chars_to_extract = 0;
    if (plain.length > 6) {
        offset_chars_to_extract = 5;
    } else if (plain.length == 5) {
        offset_chars_to_extract = 4;
    } else if (plain.length == 4) {
        offset_chars_to_extract = 3;
    } else if (plain.length == 3) {
        offset_chars_to_extract = 2;
    } else if (plain.length == 2) {
        offset_chars_to_extract = 1;
    }

    if (!(plain instanceof String)) {
        plain = String(plain);
    }

    return plain.substring(plain.length - offset_chars_to_extract, plain.length);
}

// Fetch mask settings from headers
var mask_all_chars = context.getVariable("request.header.mask_all_chars");
var maskElementKeys = context.getVariable("request.header.json_mask_elements");

// Ensure maskElementKeys is split into an array
if (maskElementKeys) {
    maskElementKeys = maskElementKeys.split(" ");
}

// Masking
var isPayloadAvailable = true;
var jsonObject = context.getVariable("request.content");
var contentType = context.getVariable("request.header.content-type") || '';
var jsonMaskingUtility = new JsonMaskingUtility();

function parseUrlEncoded(str) {
    var obj = {};
    str.split('&').forEach(function (pair) {
        var parts = pair.split('=');
        var key = decodeURIComponent(parts[0]);
        var value = decodeURIComponent(parts[1] || '');
        obj[key] = value;
    });
    return obj;
}
function stringifyUrlEncoded(obj) {
    return Object.keys(obj).map(function (key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(obj[key]);
    }).join('&');
}

var isJson = false;
var isUrlEncoded = false;
var parseJsonObj;
var parseUrlObj;

try {
    if (typeof jsonObject === "string" && (contentType.indexOf('application/json') > -1 || jsonObject.trim().startsWith('{'))) {
        parseJsonObj = JSON.parse(jsonObject);
        isJson = true;
    } else if (typeof jsonObject === "object" && contentType.indexOf('application/json') > -1) {
        parseJsonObj = jsonObject;
        isJson = true;
    } else if (typeof jsonObject === "string" && contentType.indexOf('application/x-www-form-urlencoded') > -1) {
        parseUrlObj = parseUrlEncoded(jsonObject);
        isUrlEncoded = true;
    }
} catch (error) {
    isPayloadAvailable = false;
}

if (isJson && (context.getVariable("message.content").indexOf("{") > -1 && maskElementKeys.length > 0)) {
    context.setVariable("api_mask_payload", jsonMaskingUtility.mask(parseJsonObj, maskElementKeys, mask_all_chars));
} else if (isUrlEncoded && maskElementKeys.length > 0) {
    var maskedUrlObj = jsonMaskingUtility.mask(parseUrlObj, maskElementKeys, mask_all_chars);
    context.setVariable("api_mask_payload", stringifyUrlEncoded(maskedUrlObj));
} else {
    context.setVariable("api_mask_payload", jsonObject);
}

if (!isPayloadAvailable && (context.getVariable("message.content").indexOf("{") == -1)) {
    context.setVariable("api_mask_payload", null);
}
