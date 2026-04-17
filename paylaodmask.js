// ─── Fetch mask settings from headers ────────────────────────
var mask_all_chars       = context.getVariable("request.header.mask_all_chars");
var maskElementKeys      = context.getVariable("request.header.json_mask_elements");
var maskpreserveElements = context.getVariable("request.header.preserve_json_mask_elements");

// Ensure maskElementKeys is split into an array
if (maskElementKeys) {
  maskElementKeys = maskElementKeys.split(" ");
}

// Ensure maskpreserveElements is split into an array
var preserveMaskElementKeys = [];
if (maskpreserveElements) {
  preserveMaskElementKeys = maskpreserveElements.split(" ");
}

// ─── JsonMaskingUtility ───────────────────────────────────────
function JsonMaskingUtility() {

  this.isMaskable = function(key) {
    var keyParts    = key.split(".");
    var maskElement = keyParts[keyParts.length - 1];
    if (this.MASK_ELEMENT_KEYS.indexOf(maskElement) >= 0 && !this.isPreserveMaskable(key)) {
      return true;
    }
    return false;
  };

  this.isPreserveMaskable = function(key) {
    if (!this.PRESERVE_MASK_ELEMENT_KEYS || this.PRESERVE_MASK_ELEMENT_KEYS.length === 0) {
      return false;
    }
    var keyParts    = key.split(".");
    var maskElement = keyParts[keyParts.length - 1];
    return this.PRESERVE_MASK_ELEMENT_KEYS.indexOf(maskElement) >= 0;
  };

  this.isArray = function(what) {
    return Object.prototype.toString.call(what) === '[object Array]';
  };

  this.traverseAndMask = function(o, parentKey) {
    for (var i in o) {
      var currentKey = "";
      if (o[i] !== null && typeof o[i] === "object") {
        handleForObject(o, parentKey, i, this);
      } else {
        // FIX: endsWith replaced with charAt — Rhino ES5 safe
        if (parentKey.charAt(parentKey.length - 1) === '[') {
          currentKey = parentKey + "*" + "]";
        } else {
          currentKey = parentKey + "." + i;
        }
        if (this.isPreserveMaskable(currentKey)) {
          o[i] = preserveLengthMask(o[i], this.mask_all_chars);
        } else if (this.isMaskable(currentKey)) {
          if (this.mask_all_chars === "TRUE") {
            o[i] = "####";
          } else {
            o[i] = "####" + lengthBasedTrim(o[i]);
          }
        }
      }
    }
  };

  this.mask = function(jsonObject, maskElementKeys, mask_all_chars, preserveMaskElementKeys) {
    this.MASK_ELEMENT_KEYS          = maskElementKeys;
    this.mask_all_chars             = mask_all_chars;
    this.PRESERVE_MASK_ELEMENT_KEYS = preserveMaskElementKeys || [];

    // FIX: Array.isArray replaced — Rhino ES5 safe
    if (Object.prototype.toString.call(jsonObject) === '[object Array]') {
      for (var j = 0; j < jsonObject.length; j++) {
        this.traverseAndMask(jsonObject[j], "$");
      }
    } else {
      this.traverseAndMask(jsonObject, "$");
    }
    return jsonObject;
  };
}

// ─── handleForObject ─────────────────────────────────────────
function handleForObject(o, parentKey, i, reference) {
  var currentKey = "";
  // FIX: endsWith replaced with charAt — Rhino ES5 safe
  if (parentKey.charAt(parentKey.length - 1) === '[') {
    currentKey = parentKey + "*" + "]";
  } else if (reference.isArray(o[i])) {
    currentKey = parentKey + "." + i + "[";
  } else {
    currentKey = parentKey + "." + i;
  }
  reference.traverseAndMask(o[i], currentKey);
}

// ─── lengthBasedTrim ─────────────────────────────────────────
function lengthBasedTrim(plain) {
  var offset_chars_to_extract = 0;
  if (plain.length >= 6) {
    offset_chars_to_extract = 4;
  } else if (plain.length === 5 || plain.length === 4) {
    offset_chars_to_extract = 2;
  } else if (plain.length === 3) {
    offset_chars_to_extract = 1;
  }
  if (!(plain instanceof String)) { plain = String(plain); }
  return plain.substring(plain.length - offset_chars_to_extract, plain.length);
}

// ─── preserveLengthMask ──────────────────────────────────────
function preserveLengthMask(plain, mask_all_chars) {
  if (!(plain instanceof String)) { plain = String(plain); }
  var totalLength = plain.length;

  if (mask_all_chars === "TRUE") {
    var maskedPortion = "";
    for (var i = 0; i < totalLength; i++) { maskedPortion += "*"; }
    return maskedPortion;
  }

  var offset_chars_to_extract = 0;
  if (totalLength >= 6) {
    offset_chars_to_extract = 4;
  } else if (totalLength === 5 || totalLength === 4) {
    offset_chars_to_extract = 2;
  } else if (totalLength === 3) {
    offset_chars_to_extract = 1;
  }

  var charsToMask   = totalLength - offset_chars_to_extract;
  var maskedPortion = "";
  for (var i = 0; i < charsToMask; i++) { maskedPortion += "*"; }
  var unmaskedPortion = plain.substring(totalLength - offset_chars_to_extract, totalLength);
  return maskedPortion + unmaskedPortion;
}

// ─── Parse input ─────────────────────────────────────────────
var isPayloadAvailable = true;
var jsonInputObject    = context.getVariable("request.content");
var parseJsonArray     = [];

try {
  var parsed     = JSON.parse(jsonInputObject);
  // FIX: Array.isArray replaced — Rhino ES5 safe
  parseJsonArray = Object.prototype.toString.call(parsed) === '[object Array]'
                   ? parsed : [parsed];
} catch (error) {
  isPayloadAvailable = false;
}

// ─── Apply masking PER OBJECT — skip only error objects ──────
// FIX: was skipping ALL objects if ANY had errors
// Now: only skip masking for the specific object that has errors
var maskedArray = [];
var msgContent  = context.getVariable("message.content");

if (isPayloadAvailable &&
    msgContent &&
    msgContent.indexOf("}") > -1 &&
    ((maskElementKeys && maskElementKeys.length > 0) ||
     (preserveMaskElementKeys && preserveMaskElementKeys.length > 0))) {

  var jsonMaskingUtility   = new JsonMaskingUtility();
  var finalMaskElementKeys = maskElementKeys || [];

  for (var j = 0; j < parseJsonArray.length; j++) {
    if (parseJsonArray[j].errors) {
      // has errors — push as-is, do not mask
      maskedArray.push(parseJsonArray[j]);
    } else {
      // no errors — mask normally
      maskedArray.push(
        jsonMaskingUtility.mask(
          parseJsonArray[j],
          finalMaskElementKeys,
          mask_all_chars,
          preserveMaskElementKeys
        )
      );
    }
  }

  context.setVariable("api_mask_payload", JSON.stringify(maskedArray));

} else {
  context.setVariable("api_mask_payload", jsonInputObject);
}

// ─── Null fallback ────────────────────────────────────────────
if (!isPayloadAvailable &&
    msgContent &&
    msgContent.indexOf("}") <= -1) {
  context.setVariable("api_mask_payload", null);
}




// // ─── Fetch mask settings from headers ────────────────────────
// var mask_all_chars       = context.getVariable("request.header.mask_all_chars");
// var maskElementKeys      = context.getVariable("request.header.json_mask_elements");
// var maskpreserveElements = context.getVariable("request.header.preserve_json_mask_elements");

// // Ensure maskElementKeys is split into an array
// if (maskElementKeys) {
//   maskElementKeys = maskElementKeys.split(" ");
// }

// // Ensure maskpreserveElements is split into an array
// var preserveMaskElementKeys = [];
// if (maskpreserveElements) {
//   preserveMaskElementKeys = maskpreserveElements.split(" ");
// }

// // ─── JsonMaskingUtility ───────────────────────────────────────
// function JsonMaskingUtility() {

//   this.isMaskable = function(key) {
//     var keyParts    = key.split(".");
//     var maskElement = keyParts[keyParts.length - 1];
//     if (this.MASK_ELEMENT_KEYS.indexOf(maskElement) >= 0 && !this.isPreserveMaskable(key)) {
//       return true;
//     } else {
//       return false;
//     }
//   };

//   this.isPreserveMaskable = function(key) {
//     if (!this.PRESERVE_MASK_ELEMENT_KEYS || this.PRESERVE_MASK_ELEMENT_KEYS.length === 0) {
//       return false;
//     }
//     var keyParts    = key.split(".");
//     var maskElement = keyParts[keyParts.length - 1];
//     if (this.PRESERVE_MASK_ELEMENT_KEYS.indexOf(maskElement) >= 0) {
//       return true;
//     } else {
//       return false;
//     }
//   };

//   this.isArray = function(what) {
//     return Object.prototype.toString.call(what) === '[object Array]';
//   };

//   this.traverseAndMask = function(o, parentKey) {
//     for (var i in o) {
//       var currentKey = "";
//       if (o[i] !== null && typeof o[i] === "object") {
//         handleForObject(o, parentKey, i, this);
//       } else {
//         if (parentKey.endsWith("[")) {
//           currentKey = parentKey + "*" + "]";
//         } else {
//           currentKey = parentKey + "." + i;
//         }
//         if (this.isPreserveMaskable(currentKey)) {
//           o[i] = preserveLengthMask(o[i], this.mask_all_chars);
//         } else if (this.isMaskable(currentKey)) {
//           if (this.mask_all_chars === "TRUE") {
//             o[i] = "####";
//           } else {
//             o[i] = "####" + lengthBasedTrim(o[i]);
//           }
//         }
//       }
//     }
//   };

//   /*
//    * Invoke this method to mask data on jsonObject.
//    * jsonObject            => JSON data or JSON payload
//    * maskElementKeys       => Array of JSONPath expressions to mask
//    * mask_all_chars        => if TRUE masks all chars
//    * preserveMaskElementKeys => fields to mask while preserving original length
//    */
//   this.mask = function(jsonObject, maskElementKeys, mask_all_chars, preserveMaskElementKeys) {
//     this.MASK_ELEMENT_KEYS          = maskElementKeys;
//     this.mask_all_chars             = mask_all_chars;
//     this.PRESERVE_MASK_ELEMENT_KEYS = preserveMaskElementKeys || [];

//     if (Array.isArray(jsonObject)) {
//       for (var j in jsonObject) {
//         this.traverseAndMask(jsonObject[j], "$");
//       }
//     } else {
//       this.traverseAndMask(jsonObject, "$");
//     }
//     return jsonObject;
//   };
// }

// // ─── handleForObject ─────────────────────────────────────────
// function handleForObject(o, parentKey, i, reference) {
//   var currentKey = "";
//   if (parentKey.endsWith("[")) {
//     currentKey = parentKey + "*" + "]";
//   } else if (reference.isArray(o[i])) {
//     currentKey = parentKey + "." + i + "[";
//   } else {
//     currentKey = parentKey + "." + i;
//   }
//   reference.traverseAndMask(o[i], currentKey);
// }

// // ─── lengthBasedTrim ─────────────────────────────────────────
// function lengthBasedTrim(plain) {
//   var offset_chars_to_extract = 0;

//   if (plain.length >= 6) {
//     offset_chars_to_extract = 4;
//   } else if (plain.length === 5 || plain.length === 4) {
//     offset_chars_to_extract = 2;
//   } else if (plain.length === 3) {
//     offset_chars_to_extract = 1;
//   }

//   if (!(plain instanceof String)) {
//     plain = String(plain);
//   }
//   return plain.substring(plain.length - offset_chars_to_extract, plain.length);
// }

// // ─── preserveLengthMask ──────────────────────────────────────
// function preserveLengthMask(plain, mask_all_chars) {
//   if (!(plain instanceof String)) {
//     plain = String(plain);
//   }

//   var totalLength = plain.length;

//   if (mask_all_chars === "TRUE") {
//     var maskedPortion = "";
//     for (var i = 0; i < totalLength; i++) {
//       maskedPortion += "*";
//     }
//     return maskedPortion;
//   }

//   var offset_chars_to_extract = 0;
//   if (totalLength >= 6) {
//     offset_chars_to_extract = 4;
//   } else if (totalLength === 5 || totalLength === 4) {
//     offset_chars_to_extract = 2;
//   } else if (totalLength === 3) {
//     offset_chars_to_extract = 1;
//   }

//   var charsToMask   = totalLength - offset_chars_to_extract;
//   var maskedPortion = "";
//   for (var i = 0; i < charsToMask; i++) {
//     maskedPortion += "*";
//   }

//   var unmaskedPortion = plain.substring(totalLength - offset_chars_to_extract, totalLength);
//   return maskedPortion + unmaskedPortion;
// }

// // ─── Masking ──────────────────────────────────────────────────
// var isPayloadAvailable = true;
// var jsonInputObject    = context.getVariable("request.content");
// var parseJsonArray     = [];

// try {
//   var parsed     = JSON.parse(jsonInputObject);
//   parseJsonArray = Array.isArray(parsed) ? parsed : [parsed];
// } catch (error) {
//   isPayloadAvailable = false;
// }

// // ─── Check for errors in any object in the array ─────────────
// var hasErrors = false;
// for (var i = 0; i < parseJsonArray.length; i++) {
//   if (parseJsonArray[i].errors) {
//     hasErrors = true;
//     break;
//   }
// }

// // ─── Apply masking ────────────────────────────────────────────
// if (isPayloadAvailable &&
//     (context.getVariable("message.content").indexOf("}") > -1) &&
//     ((maskElementKeys && maskElementKeys.length > 0) ||
//      (preserveMaskElementKeys && preserveMaskElementKeys.length > 0)) &&
//     !hasErrors) {

//   var jsonMaskingUtility   = new JsonMaskingUtility();
//   var finalMaskElementKeys = maskElementKeys || [];
//   var maskedArray          = [];

//   for (var j = 0; j < parseJsonArray.length; j++) {
//     maskedArray.push(
//       jsonMaskingUtility.mask(parseJsonArray[j], finalMaskElementKeys, mask_all_chars, preserveMaskElementKeys)
//     );
//   }

//   context.setVariable("api_mask_payload", JSON.stringify(maskedArray));

// } else {
//   context.setVariable("api_mask_payload", jsonInputObject);
// }

// // ─── Null fallback ────────────────────────────────────────────
// if (!isPayloadAvailable && (context.getVariable("message.content").indexOf("}") <= -1)) {
//   context.setVariable("api_mask_payload", null);
// }
