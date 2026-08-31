var status_code = context.getVariable("call_db_response.status.code");

var call_db_response = context.getVariable("call_db_response.content")
    ? JSON.parse(context.getVariable("call_db_response.content"))
    : "";


var federated_apis_string = '["Instant-Pay-test","abc","xyz"]';

var federated_apis_list = [];

try {
    federated_apis_list = JSON.parse(federated_apis_string);
} catch (e) {
    federated_apis_list = [];
}


if (call_db_response !== "" && status_code === 400) {

    var errors = call_db_response.errors;
    var entry_eixts_error = false;

    errors.forEach(function(error_list) {
        if (error_list.description.indexOf("already exists") >= 0) {
            entry_eixts_error = true;
        }
    });

    if (!entry_eixts_error) {
        sendFailure("Call DB Failed", 500);
    }
}


else if (status_code !== 200 && status_code !== 201) {

    var path_suffix = context.getVariable("proxy.pathsuffix");
    var request_verb = context.getVariable("request.verb");

    if (path_suffix === "/api" && request_verb === "POST") {

        var request_content = context.getVariable("request.content");
        var request_payload = {};

        // POST /api must have a valid JSON request body
        if (request_content !== null &&
            request_content !== undefined &&
            request_content !== "") {

            try {
                request_payload = JSON.parse(request_content);
            } catch (e) {
                sendFailure("Call DB Failed", 500);
            }

        } else {

            sendFailure("Call DB Failed", 500);
        }


        var api_resource_name = request_payload.api_resource_name;


        if (api_resource_name === null ||
            api_resource_name === undefined ||
            api_resource_name === "") {

            sendFailure("Call DB Failed", 500);

        } else {

            var resource_exists = false;

            for (var i = 0; i < federated_apis_list.length; i++) {

                if (federated_apis_list[i] === api_resource_name) {
                    resource_exists = true;
                    break;
                }
            }

           if (resource_exists) {

                context.setVariable("db_call", "success");

            } else {

                sendFailure("Call DB Failed", 500);
            }
        }

    } else {

        // Preserve existing behavior for every other request
        sendFailure("Call DB Failed", 500);
    }
}


else {

    context.setVariable("db_call", "success");
}
