function safeSet(target, key, value) {
  if (value !== null      &&
      value !== undefined &&
      value !== ""        &&
      value !== "null"    &&
      value !== "undefined") {
    target[key] = value;
  }
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

var localPayloadObj = {};

// ── CHANGE 1: Handle XML vs JSON for erp_request.content ─────
// BEFORE: localPayloadObj = JSON.parse(context.getVariable("erp_request.content"));
//         → crashes silently when content is XML
// AFTER:  detect XML by first char, store as string under payloadContent key
try {
  var rawErpContent = context.getVariable("erp_request.content");
  if (rawErpContent !== null && rawErpContent !== "" && rawErpContent !== "null") {
    var trimmedErp = rawErpContent.trim();
    if (trimmedErp.charAt(0) === '<') {
      // XML — store as string, do not JSON.parse
      localPayloadObj.payloadContent = trimmedErp;
    } else {
      // JSON — parse normally
      localPayloadObj = JSON.parse(trimmedErp);
    }
  }
} catch (e) {
  context.setVariable("patch.error", e.message);
}

// ── Patch ─────────────────────────────────────────────────────
safeSet(localPayloadObj, "log_type",             "AM2IS");
safeSet(localPayloadObj, "api_basepath",         context.getVariable("proxy.basepath"));
safeSet(localPayloadObj, "app_id",               context.getVariable("apiproduct.app-id"));
safeSet(localPayloadObj, "api_resource",         context.getVariable("path_for_logging"));
safeSet(localPayloadObj, "api_name",             context.getVariable("apiproxy.name"));
safeSet(localPayloadObj, "app_id",               context.getVariable("apiproduct.app-id"));
safeSet(localPayloadObj, "request_verb",         context.getVariable("request.verb"));
safeSet(localPayloadObj, "request_content_type", "application/xml");
safeSet(localPayloadObj, "client-request-id",    context.getVariable("request.header.client-request-id"));
safeSet(localPayloadObj, "host_name",            context.getVariable("proxy.url"));
safeSet(localPayloadObj, "gateway-entity-id",    context.getVariable("request.header.gateway-entity-id"));
safeSet(localPayloadObj, "ceo-company-id",       context.getVariable("ceo_company_id"));
safeSet(localPayloadObj, "req_received_time",    context.getVariable("req_received_time"));
safeSet(localPayloadObj, "backend_url",
  "https://" + context.getVariable("backend_host") + "/" + context.getVariable("backend_uri"));
safeSet(localPayloadObj, "backend_identifier",   "ERPSEASRequest");

// ── CHANGE 2: removed ternary — safeSet already handles null ──
// BEFORE: safeSet(localPayloadObj, "gateway-company-id",
//           context.getVariable("request.header.gateway-company-id") === null
//           ? "null" : context.getVariable("request.header.gateway-company-id"));
//         → was setting string "null" when value was null
// AFTER:  safeSet handles null/undefined/"null" internally
safeSet(localPayloadObj, "gateway-company-id",
  context.getVariable("request.header.gateway-company-id"));

payload.push(localPayloadObj);

// ── Write to payload ──────────────────────────────────────────
context.setVariable("payload", JSON.stringify(payload));
