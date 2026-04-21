function safeSet(target, key, value) {
  if (value !== null      &&
      value !== undefined &&
      value !== ""        &&
      value !== "null"    &&
      value !== "undefined") {
    target[key] = value;
  }
}

// ── Rhino ES5 safe isArray ────────────────────────────────────
function isArray(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]';
}

var payload = [];
try {
  var rawPayload = context.getVariable("payload");
  if (rawPayload !== null && rawPayload !== "" && rawPayload !== "null") {
    payload = JSON.parse(rawPayload);
  }
} catch (e) {
  context.setVariable("debug.payload.raw",   String(rawPayload));
  context.setVariable("debug.payload.error", e.message);
  payload = [];
}

// ── CHANGE: Always start with a plain object ──────────────────
// BEFORE: var localPayloadObj = {};  (declared but then fully replaced on line 22)
// AFTER:  always stays an object — log_content array stored as key if needed
var localPayloadObj = {};

// ── CHANGE: Handle log_content — array, object, or null ───────
// BEFORE:
//   try {
//     localPayloadObj = JSON.parse(context.getVariable("log_content"));
//   } catch (e) {
//     context.setVariable("patch.error", e.message);
//   }
//   PROBLEM: when log_content is an array, localPayloadObj becomes the array
//   and all safeSet calls below silently fail or write to wrong places
//
// AFTER:
try {
  var rawLogContent = context.getVariable("log_content");
  if (rawLogContent !== null && rawLogContent !== "" && rawLogContent !== "null") {
    var parsed = JSON.parse(rawLogContent);
    if (isArray(parsed)) {
      // ARRAY — store under log_content key, localPayloadObj stays as object
      // Result: {"log_type":"response","log_content":[...], ...other safeSet keys...}
      localPayloadObj.log_content = parsed;
    } else {
      // OBJECT — merge fields into localPayloadObj (original behavior unchanged)
      localPayloadObj = parsed;
    }
  }
} catch (e) {
  context.setVariable("patch.error", e.message);
}

// ── Patch — unchanged ─────────────────────────────────────────
safeSet(localPayloadObj, "log_type",             "response");
safeSet(localPayloadObj, "api_basepath",         context.getVariable("proxy.basepath"));
safeSet(localPayloadObj, "app_id",               context.getVariable("apiproduct.app-id"));
safeSet(localPayloadObj, "api_resource",         context.getVariable("path_for_logging"));
safeSet(localPayloadObj, "api_name",             context.getVariable("apiproxy.name"));
safeSet(localPayloadObj, "total_process_time",   context.getVariable("status_code"));
safeSet(localPayloa
