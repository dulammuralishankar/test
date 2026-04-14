// ─── Rhino ES5 safe helpers ───────────────────────────────────
function endsWith(str, suffix) {
  return str && str.charAt(str.length - 1) === suffix;
}

function startsWith(str, prefix) {
  return str && str.indexOf(prefix) === 0;
}

function isArray(obj) {
  return Object.prototype.toString.call(obj) === '[object Array]';
}

function shallowCopy(target, source) {
  for (var key in source) {
    if (source.hasOwnProperty(key)) {
      target[key] = source[key];
    }
  }
  return target;
}

function getElkFormattedTime(date) {
  return date ? date.toISOString() : null;
}

// ─── Read common variables ────────────────────────────────────
var host_name           = null;
var proxy_url           = context.getVariable('request.header.host_name');
var paa_logging_enabled = context.getVariable('paa_logging_enabled');

if (proxy_url) {
  var tmp_array = proxy_url.match(/^[^:]*:\/\/([^\/]+)(\/.*)?$/);
  var tmp_str   = tmp_array[1];
  host_name     = tmp_str.split(":")[0];
}

// FIX: endsWith replaced
var api_base_path = context.getVariable('request.header.api_basepath');
if (api_base_path) {
  if (endsWith(api_base_path, "/")) {
    api_base_path = api_base_path.slice(0, -1);
  }
} else {
  api_base_path = "";
}

var api_version          = api_base_path ? api_base_path.split("/").pop() : "";
var client_received_time = new Date(Number(context.getVariable('request.header.req_received_time')));
var res_sent_time        = new Date(Number(context.getVariable('request.header.res_end_time')));
var res_sent_time_elk    = getElkFormattedTime(res_sent_time);
var system_time          = new Date(context.getVariable('system.timestamp'));
var elk_formatted_time   = getElkFormattedTime(system_time);
var req_in_time          = getElkFormattedTime(client_received_time);

var client_request_id = null;
var entity_id         = null;
var api               = context.getVariable('request.header.api_name');

// FIX: startsWith replaced
if (api && startsWith(api, "OBEU-")) {
  client_request_id = context.getVariable('request.header.x-fapi-interaction-id');
  entity_id         = context.getVariable('request.header.gateway-obeu-gurn');
} else {
  client_request_id = context.getVariable('request.header.client-request-id');
  if (client_request_id === null) {
    client_request_id = context.getVariable('request.header.request-id');
  }
  entity_id = context.getVariable('request.header.gateway-entity-id');
}

var query_string = context.getVariable('request.header.request_querystring');
if (query_string !== null) {
  query_string = query_string.length === 0 ? null : query_string;
}

var log_level      = context.getVariable("logging_level") || "INFO";
var ceo_company_id = context.getVariable('request.header.ceo-company-id');

// FIX: custom_fields_log safe parse + isArray replaced
var custom_fields_log = [];
try {
  var rawCustomFields = context.getVariable("custom_fields_log");
  var parsedCF        = rawCustomFields ? JSON.parse(rawCustomFields) : [];
  custom_fields_log   = isArray(parsedCF) ? parsedCF : [];
} catch (e) {
  custom_fields_log = [];
}

// ─── Base log_object ─────────────────────────────────────────
var log_object       = {};
var debug_log_object = {};
var session_id       = null;

log_object.a_log_time         = elk_formatted_time;
log_object.a_log_level        = "Info";
log_object.a_api_name         = context.getVariable('request.header.api_name');
log_object.a_api_id           = context.getVariable('request.header.app_id');
log_object.a_apimgr_server_id = host_name;
log_object.a_session_id       = context.getVariable('request.header.session-id');
log_object.a_company_id       = context.getVariable("request.header.gateway-company-id");
log_object.a_entity_id        = entity_id;
log_object.a_api_version      = api_version;
log_object.a_api_resource     = context.getVariable('request.header.api_resource');
log_object.a_request_id       = client_request_id;
log_object.a_timestamp        = req_in_time;

if (custom_fields_log.length > 0) {
  for (var l = 0; l < custom_fields_log.length; l++) {
    log_object[custom_fields_log[l].name] = custom_fields_log[l].value;
  }
}

// ─── Base paa_log_object ─────────────────────────────────────
var paa_log_object = {};
if (paa_logging_enabled !== "false") {
  paa_log_object.timestamp             = elk_formatted_time;
  paa_log_object.level                 = 'Info';
  paa_log_object.loggingApplicationId  = '1BAAS';
  paa_log_object.subApplicationId      = 'APIGEE';
  paa_log_object.apiName               = context.getVariable('request.header.api_name');
  paa_log_object.apiVersion            = api_version;
  paa_log_object.apiId                 = context.getVariable("request.header.app_id");
  paa_log_object.serverId              = host_name;
  paa_log_object.WFRequestID           = context.getVariable('request.header.session-id');
  paa_log_object.sessionId             = context.getVariable('request.header.session-id');
  paa_log_object.clientRequestId       = client_request_id;
  paa_log_object.gatewayCompanyId      = context.getVariable('request.header.gateway-company-id');
  paa_log_object.gatewayEntityId       = entity_id;
  paa_log_object.httpQueryParams       = query_string;
  paa_log_object.httpMethod            = context.getVariable('request.header.request_verb');
  paa_log_object.httpRelativePath      = context.getVariable('request.header.api_resource');
  paa_log_object.payload               = context.getVariable('api_mask_payload');
}

// ─── Helpers ─────────────────────────────────────────────────
function resolvePayload() {
  var p = context.getVariable('api_mask_payload');
  return (p === "" || p === null || p === undefined)
         ? context.getVariable('request.content') : p;
}

function extractErrors() {
  var api_error_message = null;
  var api_error_code    = null;
  var statusCode        = context.getVariable('request.header.response_status_code');

  if (statusCode !== null && statusCode !== "" && !statusCode.match(/2[0-9][0-9]/)) {
    var error_obj = context.getVariable('request.content');
    if (error_obj && error_obj !== "null" && error_obj.trim() !== "") {
      try {
        var error_response_object = JSON.parse(error_obj);
        // FIX: for...in on array replaced with indexed for loop
        var errs = error_response_object.errors;
        if (errs && isArray(errs)) {
          for (var e = 0; e < errs.length; e++) {
            var error_message = (errs[e].description || errs[e].statusDescription);
            var error_code    = (errs[e].error_code  || errs[e].statusCode);
            if (api_error_message === null && api_error_code === null) {
              api_error_message = error_message;
              api_error_code    = error_code;
            } else {
              api_error_message += ";" + error_message;
              api_error_code    += ";" + error_code;
            }
          }
        }
        if (api_error_message !== null) {
          api_error_message = api_error_message.replace(new RegExp("\\.", "g"), '');
        }
      } catch (err) {}
    }
  }
  return { message: api_error_message, code: api_error_code };
}

function calcProcessTimes() {
  var req_process_time          = 0;
  var res_process_time          = 0;
  var apigee_total_process_time = 0;

  if (context.getVariable('request.header.target_sent_time') &&
      context.getVariable('request.header.target_recived_time')) {
    req_process_time  = context.getVariable('request.header.target_sent_time') -
                        context.getVariable('request.header.client_recived_time');
    res_process_time  = context.getVariable('request.header.res_end_time') -
                        context.getVariable('request.header.target_recived_time');
    apigee_total_process_time = req_process_time + res_process_time;
  } else {
    apigee_total_process_time = context.getVariable('request.header.res_end_time') -
                                context.getVariable('request.header.client_recived_time');
  }
  return { req: req_process_time, res: res_process_time, total: apigee_total_process_time };
}

// ─── CHANGE 1: Declare accumulators BEFORE the loop ──────────
var log_message        = "";
var splunk_log_message = "";

// ─── Parse payload array ─────────────────────────────────────
var payloadRaw   = context.getVariable("payload");
var payloadArray = [];
try {
  var parsedPayload = payloadRaw ? JSON.parse(payloadRaw) : [];
  // FIX: Array.isArray replaced
  payloadArray = isArray(parsedPayload) ? parsedPayload : [parsedPayload];
} catch (e) {
  context.setVariable("debug.payload.parse.error", e.message);
}

// ─── Loop over each object, accumulate log_message ───────────
for (var idx = 0; idx < payloadArray.length; idx++) {
  var currentObj = payloadArray[idx];
  var log_type   = currentObj.log_type || null;

  if (log_type === 'request') {
    log_object.a_log_type         = "Request";
    log_object.a_query_parameters = query_string;
    log_object.a_endpoint         = context.getVariable('request.header.api_basepath');
    log_object.a_api_resource     = context.getVariable('request.header.api_basepath') +
                                    context.getVariable('request.header.api_resource');
    log_object.a_http_method      = context.getVariable('request.header.request_verb');

    // CHANGE 2: += instead of setVariable inside loop
    log_message += "\n" + JSON.stringify(log_object);

    if (log_level.toUpperCase() === "DEBUG") {
      debug_log_object = {};
      shallowCopy(debug_log_object, log_object);
      debug_log_object.a_log_level       = "Debug";
      debug_log_object.a_request_headers = context.getVariable('api_masked_headers');
      debug_log_object.a_request_body    = context.getVariable('api_request_mask_payload');
      log_message += "\n" + JSON.stringify(debug_log_object);
    }

    if (paa_logging_enabled !== "false") {
      paa_log_object.logEventType = 'RequestReceive';
      splunk_log_message += "\n" + JSON.stringify(paa_log_object);
    }

  } else if (log_type === 'response') {
    var errors       = extractErrors();
    var processTimes = calcProcessTimes();

    session_id = context.getVariable('request.header.gateway-request-id');
    if (!session_id) {
      session_id = context.getVariable('request.header.session-id');
    }

    log_object.a_log_type                  = "Response";
    log_object.a_session_id                = session_id;
    log_object.a_timestamp                 = res_sent_time_elk;
    log_object.a_error_message             = errors.message;
    log_object.a_api_error_code            = errors.code;
    log_object.a_http_response_code        = context.getVariable('request.header.response_status_code');
    log_object.a_apigee_req_process_time   = processTimes.req;
    log_object.a_apigee_res_process_time   = processTimes.res;
    log_object.a_apigee_total_process_time = processTimes.total;
    log_object.a_api_responsetime          = context.getVariable('request.header.total_process_time');
    log_object.a_api_resource              = context.getVariable('request.header.api_basepath') +
                                             context.getVariable('request.header.api_resource');
    log_object.a_api_available_calls       = context.getVariable('request.header.available_calls');
    log_object.a_api_used_calls            = context.getVariable('request.header.used_calls');
    log_object.a_api_allowed_calls         = context.getVariable('request.header.allowed_calls');
    log_object.a_api_exceed_calls          = context.getVariable('request.header.exceed_calls');
    log_object.a_api_total_exceed_calls    = context.getVariable('request.header.total_exceed_calls');
    log_object.a_api_quota_expiry_time     = context.getVariable('request.header.quota_expiry_time');

    log_message += "\n" + JSON.stringify(log_object);

    if (log_level.toUpperCase() === "DEBUG") {
      debug_log_object = {};
      shallowCopy(debug_log_object, log_object);
      debug_log_object.a_log_level        = "Debug";
      debug_log_object.a_response_headers = context.getVariable('api_masked_headers');
      debug_log_object.a_response_body    = context.getVariable('api_response_mask_payload');
      log_message += "\n" + JSON.stringify(debug_log_object);
    }

    if (paa_logging_enabled !== "false") {
      paa_log_object.logEventType          = 'ResponseTransmit';
      paa_log_object["HTTP response code"] = context.getVariable('request.header.response_status_code');
      paa_log_object["API response time"]  = context.getVariable('request.header.total_process_time');
      paa_log_object.payload               = resolvePayload();
      splunk_log_message += "\n" + JSON.stringify(paa_log_object);
    }

  } else if (log_type === 'fault') {
    session_id = context.getVariable('error.header.gateway-request-id');
    if (!session_id) {
      session_id = context.getVariable('error.header.session-id');
    }

    var faultReason = null;
    try {
      var errJson = JSON.parse(context.getVariable("request.content"));
      faultReason = errJson.fault.faultstring;
    } catch (err) {
      var faultContent = context.getVariable("request.content");
      if (faultContent && faultContent.trim() !== "") {
        faultReason = faultContent;
      } else {
        faultReason = context.getVariable("request.header.reason");
      }
    }

    log_object.a_log_type                       = "Error";
    log_object.a_log_level                      = "Error";
    log_object.a_api_resource                   = context.getVariable('request.header.api_basepath') +
                                                  context.getVariable('request.header.api_resource');
    log_object.a_error_message                  = context.getVariable('request.header.error_description');
    log_object.a_api_error_code                 = context.getVariable('request.header.error_code');
    log_object.a_http_response_code             = context.getVariable('request.header.http_status_code');
    log_object.a_1line_from_strack_strace_error = faultReason;

    log_message += "\n" + JSON.stringify(log_object);

    if (paa_logging_enabled !== "false") {
      paa_log_object.logEventType          = 'Error';
      paa_log_object.level                 = 'Error';
      paa_log_object["HTTP response code"] = context.getVariable('request.header.http_status_code');
      if (context.getVariable('request.header.http_status_code') === '401' ||
          context.getVariable('request.header.http_status_code') === '403') {
        paa_log_object.AuthStatus = "Authorization Failed";
      } else {
        paa_log_object.stackTrace = context.getVariable('request.header.error_description');
      }
      splunk_log_message += "\n" + JSON.stringify(paa_log_object);
    }

  } else if (log_type === 'BackendRequest') {
    log_object.a_log_type            = "BackendRequest";
    log_object.a_http_method         = context.getVariable('request.header.request_verb');
    log_object.a_backend_identifier  = context.getVariable('request.header.backend_identifier');
    log_object.a_backend_url         = context.getVariable('request.header.backend_url');
    log_object.a_content_type        = context.getVariable('request.header.request_content_type');
    if (ceo_company_id) {
      log_object.a_ceo_company_id    = ceo_company_id;
    }
    log_object.a_request_body        = resolvePayload();

    log_message += "\n" + JSON.stringify(log_object);

    if (log_level.toUpperCase() === "DEBUG") {
      debug_log_object = {};
      shallowCopy(debug_log_object, log_object);
      debug_log_object.a_log_level       = "Debug";
      debug_log_object.a_request_headers = context.getVariable('api_masked_headers');
      debug_log_object.a_request_body    = context.getVariable('api_mask_payload');
      log_message += "\n" + JSON.stringify(debug_log_object);
    }

    if (paa_logging_enabled !== "false") {
      paa_log_object.logEventType = 'RequestReceive';
      paa_log_object.payload      = resolvePayload();
      splunk_log_message += "\n" + JSON.stringify(paa_log_object);
    }

  } else if (log_type === 'BackendResponse') {
    log_object.a_log_type            = "BackendResponse";
    log_object.a_backend_identifier  = context.getVariable('request.header.backend_identifier');
    log_object.a_backend_url         = context.getVariable('request.header.backend_url');
    log_object.a_processing_time     = context.getVariable('request.header.a_processing_time');
    log_object.a_http_response_code  = context.getVariable('request.header.response_status_code');
    log_object.a_timestamp           = res_sent_time_elk;
    if (ceo_company_id) {
      log_object.a_ceo_company_id    = ceo_company_id;
    }
    log_object.a_response_body       = resolvePayload();

    log_message += "\n" + JSON.stringify(log_object);

    if (log_level.toUpperCase() === "DEBUG") {
      debug_log_object = {};
      shallowCopy(debug_log_object, log_object);
      debug_log_object.a_log_level        = "Debug";
      debug_log_object.a_response_headers = context.getVariable('api_masked_headers');
      debug_log_object.a_response_body    = context.getVariable('api_mask_payload');
      log_message += "\n" + JSON.stringify(debug_log_object);
    }

    if (paa_logging_enabled !== "false") {
      var baknd_identifier   = context.getVariable('request.header.backend_identifier');
      var new_log_event_type = (baknd_identifier && baknd_identifier === 'Mediation_DB_Response')
                               ? 'Mediation_DB_Response' : 'ResponseReceive';
      paa_log_object.logEventType          = new_log_event_type;
      paa_log_object["HTTP response code"] = context.getVariable('request.header.response_status_code');
      paa_log_object["API response time"]  = context.getVariable('request.header.total_process_time');
      paa_log_object.payload               = resolvePayload();
      splunk_log_message += "\n" + JSON.stringify(paa_log_object);
    }

  } else if (log_type === 'PreRequest') {
    log_object.a_log_type         = "PreRequest";
    log_object.a_query_parameters = query_string;
    log_object.a_endpoint         = context.getVariable('request.header.api_basepath');
    log_object.a_api_resource     = context.getVariable('request.header.api_basepath') +
                                    context.getVariable('request.header.api_resource');
    log_object.a_http_method      = context.getVariable('request.header.request_verb');

    log_message += "\n" + JSON.stringify(log_object);

    if (log_level.toUpperCase() === "DEBUG") {
      debug_log_object = {};
      shallowCopy(debug_log_object, log_object);
      debug_log_object.a_log_level       = "Debug";
      debug_log_object.a_request_headers = context.getVariable('api_masked_headers');
      debug_log_object.a_request_body    = context.getVariable('api_request_mask_payload');
      log_message += "\n" + JSON.stringify(debug_log_object);
    }

    if (paa_logging_enabled !== "false") {
      paa_log_object.logEventType = 'PreRequestReceive';
      splunk_log_message += "\n" + JSON.stringify(paa_log_object);
    }

  } else if (log_type === 'resource') {
    log_object.a_log_type         = "Resource";
    log_object.a_query_parameters = query_string;
    log_object.a_endpoint         = context.getVariable('request.header.api_basepath');
    log_object.a_api_resource     = context.getVariable('request.header.api_basepath') +
                                    context.getVariable('request.header.api_resource');
    log_object.a_http_method      = context.getVariable('request.header.request_verb');

    log_message += "\n" + JSON.stringify(log_object);

    if (log_level.toUpperCase() === "DEBUG") {
      debug_log_object = {};
      shallowCopy(debug_log_object, log_object);
      debug_log_object.a_log_level       = "Debug";
      debug_log_object.a_request_headers = context.getVariable('api_masked_headers');
      debug_log_object.a_request_body    = context.getVariable('api_request_mask_payload');
      log_message += "\n" + JSON.stringify(debug_log_object);
    }

  } else if (log_type === 'AM2IS') {
    log_object.a_log_type               = "AM2IS";
    log_object.a_query_parameters       = query_string;
    log_object.a_endpoint               = context.getVariable('request.header.api_basepath');
    log_object.a_api_resource           = context.getVariable('request.header.api_basepath') +
                                          context.getVariable('request.header.api_resource');
    log_object.a_http_method            = context.getVariable('request.header.request_verb');
    log_object.a_backend_identifier     = context.getVariable('request.header.backend_identifier');
    log_object.a_backend_url            = context.getVariable('request.header.backend_url');
    log_object.a_content_type           = context.getVariable('request.header.request_content_type');
    log_object.a_api_available_calls    = context.getVariable('request.header.available_calls');
    log_object.a_api_used_calls         = context.getVariable('request.header.used_calls');
    log_object.a_api_allowed_calls      = context.getVariable('request.header.allowed_calls');
    log_object.a_api_exceed_calls       = context.getVariable('request.header.exceed_calls');
    log_object.a_api_total_exceed_calls = context.getVariable('request.header.total_exceed_calls');
    log_object.a_api_quota_expiry_time  = context.getVariable('request.header.quota_expiry_time');

    log_message += "\n" + JSON.stringify(log_object);

    if (log_level.toUpperCase() === "DEBUG") {
      debug_log_object = {};
      shallowCopy(debug_log_object, log_object);
      debug_log_object.a_log_level       = "Debug";
      debug_log_object.a_request_headers = context.getVariable('api_masked_headers');
      debug_log_object.a_request_body    = context.getVariable('api_request_mask_payload');
      log_message += "\n" + JSON.stringify(debug_log_object);
    }

    if (paa_logging_enabled !== "false") {
      paa_log_object.logEventType = 'RequestTransmit';
      paa_log_object.payload      = resolvePayload();
      splunk_log_message += "\n" + JSON.stringify(paa_log_object);
    }

  } else if (log_type === 'IS2AM') {
    var errors3       = extractErrors();
    var processTimes4 = calcProcessTimes();

    session_id = context.getVariable('request.header.gateway-request-id');
    if (!session_id) {
      session_id = context.getVariable('request.header.session-id');
    }

    log_object.a_log_type                  = "IS2AM";
    log_object.a_session_id                = session_id;
    log_object.a_timestamp                 = res_sent_time_elk;
    log_object.a_error_message             = errors3.message;
    log_object.a_api_error_code            = errors3.code;
    log_object.a_http_response_code        = context.getVariable('request.header.response_status_code');
    log_object.a_apigee_req_process_time   = processTimes4.req;
    log_object.a_apigee_res_process_time   = processTimes4.res;
    log_object.a_apigee_total_process_time = processTimes4.total;
    log_object.a_api_responsetime          = context.getVariable('request.header.total_process_time');
    log_object.a_backend_identifier        = context.getVariable('request.header.backend_identifier');
    log_object.a_backend_url               = context.getVariable('request.header.backend_url');
    log_object.a_processing_time           = context.getVariable('request.header.a_processing_time');
    log_object.a_endpoint                  = context.getVariable('request.header.api_basepath');
    log_object.a_api_resource              = context.getVariable('request.header.api_basepath') +
                                             context.getVariable('request.header.api_resource');
    log_object.a_api_available_calls       = context.getVariable('request.header.available_calls');
    log_object.a_api_used_calls            = context.getVariable('request.header.used_calls');
    log_object.a_api_allowed_calls         = context.getVariable('request.header.allowed_calls');
    log_object.a_api_exceed_calls          = context.getVariable('request.header.exceed_calls');
    log_object.a_api_total_exceed_calls    = context.getVariable('request.header.total_exceed_calls');
    log_object.a_api_quota_expiry_time     = context.getVariable('request.header.quota_expiry_time');

    log_message += "\n" + JSON.stringify(log_object);

    if (log_level.toUpperCase() === "DEBUG") {
      debug_log_object = {};
      shallowCopy(debug_log_object, log_object);
      debug_log_object.a_log_level        = "Debug";
      debug_log_object.a_response_headers = context.getVariable('api_masked_headers');
      debug_log_object.a_response_body    = context.getVariable('api_response_mask_payload');
      log_message += "\n" + JSON.stringify(debug_log_object);
    }

    if (paa_logging_enabled !== "false") {
      paa_log_object.logEventType          = 'ResponseReceive';
      paa_log_object["HTTP response code"] = context.getVariable('request.header.response_status_code');
      paa_log_object["API response time"]  = context.getVariable('request.header.total_process_time');
      paa_log_object.payload               = resolvePayload();
      splunk_log_message += "\n" + JSON.stringify(paa_log_object);
    }

  } else if (log_type === 'AM2Java') {
    log_object.a_log_type         = "AM2Java";
    log_object.a_query_parameters = query_string;
    log_object.a_endpoint         = context.getVariable('request.header.api_basepath');
    log_object.a_api_resource     = context.getVariable('request.header.api_basepath') +
                                    context.getVariable('request.header.api_resource');
    log_object.a_http_method      = context.getVariable('request.header.request_verb');

    log_message += "\n" + JSON.stringify(log_object);

    if (log_level.toUpperCase() === "DEBUG") {
      debug_log_object = {};
      shallowCopy(debug_log_object, log_object);
      debug_log_object.a_log_level       = "Debug";
      debug_log_object.a_request_headers = context.getVariable('api_masked_headers');
      debug_log_object.a_request_body    = context.getVariable('api_request_mask_payload');
      log_message += "\n" + JSON.stringify(debug_log_object);
    }

    if (paa_logging_enabled !== "false") {
      paa_log_object.logEventType = 'AM2JavaAudit';
      splunk_log_message += "\n" + JSON.stringify(paa_log_object);
    }
  }

} // end for loop

// ─── CHANGE 3: Set BOTH variables ONCE after loop ────────────
context.setVariable("log_message",        log_message);
context.setVariable("splunk_log_message", splunk_log_message);
