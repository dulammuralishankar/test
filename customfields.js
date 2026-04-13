// ─── Prepare fields from request/response payload ────────────
var json_log_elements = context.getVariable("request.header.json_log_elements");

// FIX 1: null guard before split
if (json_log_elements) {
  json_log_elements = json_log_elements.split(" ");
} else {
  json_log_elements = [];
}

var variable_log_map       = {};
var variable_log_map_value = [];
var request_var_str        = [];

for (var k = 0; k < json_log_elements.length; k++) {
  var element = json_log_elements[k].split(":");
  variable_log_map[element[0]] = element[1];
  request_var_str.push(element[0]);
}

var isPayloadAvailable = true;
var jsonInputObject    = context.getVariable("request.content");

// FIX 2: declare jsonObject OUTSIDE try so it is accessible below
var jsonObject = null;
try {
  jsonObject = JSON.parse(jsonInputObject);
} catch (error) {
  isPayloadAvailable = false;
}

if (isPayloadAvailable && jsonObject !== null) {
  if (Array.isArray(jsonObject)) {
    for (var j = 0; j < jsonObject.length; j++) {   // FIX 3: for loop instead of for..in for arrays
      traverseAndgetVal(jsonObject[j], "$");
    }
  } else {
    // FIX 4: was this.traverseAndgetVal — no this context here
    traverseAndgetVal(jsonObject, "$");
  }
}

// ─── traverseAndgetVal ────────────────────────────────────────
function traverseAndgetVal(o, parentKey) {
  for (var i in o) {
    var currentKey = "";
    if (o[i] !== null && typeof o[i] === "object") {
      handleForObject(o, parentKey, i);
    } else {
      if (parentKey.endsWith("[")) {
        currentKey = parentKey + "*" + "]";
      } else {
        currentKey = parentKey + "." + i;
      }
      var keyParts   = currentKey.split(".");
      var logElement = keyParts[keyParts.length - 1];
      if (variable_log_map[logElement]) {
        var log_obj   = {};
        log_obj.name  = variable_log_map[logElement];
        log_obj.value = o[i];
        variable_log_map_value.push(log_obj);
      }
    }
  }
}

// ─── handleForObject ─────────────────────────────────────────
function handleForObject(o, parentKey, i) {
  var currentKey = "";
  if (parentKey.endsWith("[")) {
    currentKey = parentKey + "*" + "]";
  } else if (Array.isArray(o[i])) {
    currentKey = parentKey + "." + i + "[";
  } else {
    currentKey = parentKey + "." + i;
  }
  traverseAndgetVal(o[i], currentKey);
}

// ─── Prepare fields from URL ──────────────────────────────────
var path_log_elements    = context.getVariable("request.header.path_log_elements");
var request_resource_path = context.getVariable("request.header.request_resource_path");

if (path_log_elements && request_resource_path) {
  path_log_elements     = path_log_elements.split("/");
  request_resource_path = request_resource_path.split("/");

  if (path_log_elements.length === request_resource_path.length) {
    for (var p = 0; p < path_log_elements.length; p++) {
      if (request_resource_path[p] !== path_log_elements[p]) {
        var log_obj   = {};
        log_obj.name  = path_log_elements[p].replace("{", "").replace("}", "");
        log_obj.value = request_resource_path[p];
        variable_log_map_value.push(log_obj);
      }
    }
  }
}

// FIX 5: JSON.stringify before setVariable
if (variable_log_map_value.length > 0) {
  context.setVariable("custom_fields_log", JSON.stringify(variable_log_map_value));
}
