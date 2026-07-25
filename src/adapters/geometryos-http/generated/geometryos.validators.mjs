import { ucs2length as func1 } from "./geometryos.ajv-runtime.mjs";
"use strict";
export const validateGenerateRequest = validate20;
const schema31 = {"$id":"urn:tutorboard:geometryos:generate-request","additionalProperties":false,"examples":[{"input":"Постройте треугольник ABC. Проведите высоту из вершины A к стороне BC.","input_type":"text","mode":"strict","output":["svg"]}],"properties":{"input":{"maxLength":20000,"minLength":1,"title":"Input","type":"string"},"input_type":{"const":"text","title":"Input Type","type":"string"},"mode":{"const":"strict","default":"strict","title":"Mode","type":"string"},"output":{"items":{"enum":["svg","tikz"],"type":"string"},"maxItems":2,"title":"Output","type":"array","uniqueItems":true}},"required":["input_type","input"],"title":"GenerateV1Request","type":"object","$defs":{"AltitudeConstraint":{"additionalProperties":false,"properties":{"foot":{"title":"Foot","type":"string"},"from_point":{"title":"From Point","type":"string"},"id":{"title":"Id","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"segment":{"title":"Segment","type":"string"},"to_object":{"title":"To Object","type":"string"},"type":{"const":"altitude","title":"Type","type":"string"}},"required":["id","type","from_point","to_object","foot","segment"],"title":"AltitudeConstraint","type":"object"},"AngleBisectorConstraint":{"additionalProperties":false,"properties":{"angle":{"title":"Angle","type":"string"},"id":{"title":"Id","type":"string"},"ray":{"title":"Ray","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"angle_bisector","title":"Type","type":"string"}},"required":["id","type","angle","ray"],"title":"AngleBisectorConstraint","type":"object"},"AngleObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"maxItems":3,"minItems":3,"prefixItems":[{"type":"string"},{"type":"string"},{"type":"string"}],"title":"Points","type":"array"},"type":{"const":"angle","title":"Type","type":"string"}},"required":["id","type","points"],"title":"AngleObject","type":"object"},"ApiAmbiguity":{"additionalProperties":false,"properties":{"code":{"title":"Code","type":"string"},"message":{"title":"Message","type":"string"},"options":{"items":{"type":"string"},"title":"Options","type":"array"}},"required":["code","message"],"title":"ApiAmbiguity","type":"object"},"ApiWarning":{"additionalProperties":false,"properties":{"code":{"enum":["unsupported_construction","draft_gir_invalid","normalized_gir_invalid","adapter_warning"],"title":"Code","type":"string"},"message":{"title":"Message","type":"string"}},"required":["code","message"],"title":"ApiWarning","type":"object"},"BelongsToConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"object":{"title":"Object","type":"string"},"point":{"title":"Point","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"belongs_to","title":"Type","type":"string"}},"required":["id","type","point","object"],"title":"BelongsToConstraint","type":"object"},"CheckStatus":{"enum":["pass","fail"],"title":"CheckStatus","type":"string"},"CircleObject":{"additionalProperties":false,"properties":{"center":{"title":"Center","type":"string"},"id":{"title":"Id","type":"string"},"radius_point":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Radius Point"},"type":{"const":"circle","title":"Type","type":"string"}},"required":["id","type","center"],"title":"CircleObject","type":"object"},"CircumcircleConstraint":{"additionalProperties":false,"properties":{"circle":{"title":"Circle","type":"string"},"id":{"title":"Id","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"triangle":{"title":"Triangle","type":"string"},"type":{"const":"circumcircle","title":"Type","type":"string"}},"required":["id","type","triangle","circle"],"title":"CircumcircleConstraint","type":"object"},"CollinearConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"items":{"type":"string"},"title":"Points","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"collinear","title":"Type","type":"string"}},"required":["id","type","points"],"title":"CollinearConstraint","type":"object"},"ConstructionStep":{"additionalProperties":false,"properties":{"action":{"title":"Action","type":"string"},"constraints":{"items":{"type":"string"},"title":"Constraints","type":"array"},"id":{"title":"Id","type":"string"},"objects":{"items":{"type":"string"},"title":"Objects","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"}},"required":["id","action","objects"],"title":"ConstructionStep","type":"object"},"EqualLengthConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"objects":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Objects","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"equal_length","title":"Type","type":"string"}},"required":["id","type","objects"],"title":"EqualLengthConstraint","type":"object"},"GenerateClarificationResponse":{"additionalProperties":false,"examples":[{"ambiguities":[{"code":"missing_angle","message":"Не указано, биссектрису какого угла нужно построить.","options":["angle_A","angle_B","angle_C"]}],"confidence":0.4,"explanation":"Bisector request lacks angle target.","schema_version":"0.2.0","status":"needs_clarification","warnings":[]}],"properties":{"ambiguities":{"items":{"$ref":"#/$defs/ApiAmbiguity"},"title":"Ambiguities","type":"array"},"confidence":{"maximum":1,"minimum":0,"title":"Confidence","type":"number"},"explanation":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Explanation"},"gir":{"title":"Gir","type":"null"},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"},"status":{"const":"needs_clarification","title":"Status","type":"string"},"svg":{"title":"Svg","type":"null"},"tikz":{"title":"Tikz","type":"null"},"validation_report":{"title":"Validation Report","type":"null"},"warnings":{"items":{"$ref":"#/$defs/ApiWarning"},"title":"Warnings","type":"array"}},"required":["status","confidence"],"title":"GenerateClarificationResponse","type":"object"},"GenerateErrorResponse":{"additionalProperties":false,"examples":[{"ambiguities":[],"confidence":0,"explanation":"No supported construction matched the input.","schema_version":"0.2.0","status":"error","warnings":[{"code":"unsupported_construction","message":"Construction is not supported."}]}],"properties":{"ambiguities":{"items":{"$ref":"#/$defs/ApiAmbiguity"},"title":"Ambiguities","type":"array"},"confidence":{"maximum":1,"minimum":0,"title":"Confidence","type":"number"},"explanation":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Explanation"},"gir":{"anyOf":[{"$ref":"#/$defs/GirScene"},{"type":"null"}]},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"},"status":{"const":"error","title":"Status","type":"string"},"svg":{"title":"Svg","type":"null"},"tikz":{"title":"Tikz","type":"null"},"validation_report":{"anyOf":[{"$ref":"#/$defs/ValidationReport"},{"type":"null"}]},"warnings":{"items":{"$ref":"#/$defs/ApiWarning"},"title":"Warnings","type":"array"}},"required":["status","confidence"],"title":"GenerateErrorResponse","type":"object"},"GenerateSuccessResponse":{"additionalProperties":false,"examples":[{"ambiguities":[],"confidence":0.98,"explanation":"Rule-based altitude case.","gir":{"constraints":[{"id":"c_noncol_abc","points":["A","B","C"],"type":"non_collinear"},{"foot":"H","from_point":"A","id":"c_altitude_a_bc","segment":"AH","to_object":"BC","type":"altitude"}],"construction_steps":[{"action":"construct_triangle","constraints":["c_noncol_abc"],"id":"step_construct_triangle","objects":["A","B","C","BC","ABC"],"reason":"Construct triangle ABC."},{"action":"construct_altitude","constraints":["c_altitude_a_bc"],"id":"step_construct_altitude","objects":["H","AH"],"reason":"Construct altitude from A to BC."}],"metadata":{},"objects":[{"id":"A","label":"A","type":"point"},{"id":"B","label":"B","type":"point"},{"id":"C","label":"C","type":"point"},{"id":"H","label":"H","type":"point"},{"id":"BC","points":["B","C"],"type":"segment"},{"id":"AH","points":["A","H"],"type":"segment"},{"id":"ABC","type":"triangle","vertices":["A","B","C"]}],"scene_type":"2d","schema_version":"0.2.0"},"schema_version":"0.2.0","status":"success","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\">...</svg>","validation_report":{"is_valid":true,"issues":[],"warnings":[]},"warnings":[]}],"properties":{"ambiguities":{"items":{"$ref":"#/$defs/ApiAmbiguity"},"title":"Ambiguities","type":"array"},"confidence":{"maximum":1,"minimum":0,"title":"Confidence","type":"number"},"explanation":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Explanation"},"gir":{"$ref":"#/$defs/GirScene"},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"},"status":{"const":"success","title":"Status","type":"string"},"svg":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Svg"},"tikz":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Tikz"},"validation_report":{"$ref":"#/$defs/ValidationReport"},"warnings":{"items":{"$ref":"#/$defs/ApiWarning"},"title":"Warnings","type":"array"}},"required":["status","confidence","gir","validation_report"],"title":"GenerateSuccessResponse","type":"object"},"GenerateV1Request":{"additionalProperties":false,"examples":[{"input":"Постройте треугольник ABC. Проведите высоту из вершины A к стороне BC.","input_type":"text","mode":"strict","output":["svg"]}],"properties":{"input":{"maxLength":20000,"minLength":1,"title":"Input","type":"string"},"input_type":{"const":"text","title":"Input Type","type":"string"},"mode":{"const":"strict","default":"strict","title":"Mode","type":"string"},"output":{"items":{"enum":["svg","tikz"],"type":"string"},"maxItems":2,"title":"Output","type":"array","uniqueItems":true}},"required":["input_type","input"],"title":"GenerateV1Request","type":"object"},"GirScene":{"additionalProperties":false,"properties":{"constraints":{"items":{"oneOf":[{"$ref":"#/$defs/BelongsToConstraint"},{"$ref":"#/$defs/CollinearConstraint"},{"$ref":"#/$defs/NonCollinearConstraint"},{"$ref":"#/$defs/ParallelConstraint"},{"$ref":"#/$defs/PerpendicularConstraint"},{"$ref":"#/$defs/EqualLengthConstraint"},{"$ref":"#/$defs/MidpointConstraint"},{"$ref":"#/$defs/IntersectionConstraint"},{"$ref":"#/$defs/AltitudeConstraint"},{"$ref":"#/$defs/MedianConstraint"},{"$ref":"#/$defs/AngleBisectorConstraint"},{"$ref":"#/$defs/CircumcircleConstraint"},{"$ref":"#/$defs/IncircleConstraint"}]},"title":"Constraints","type":"array"},"construction_steps":{"items":{"$ref":"#/$defs/ConstructionStep"},"title":"Construction Steps","type":"array"},"metadata":{"additionalProperties":true,"title":"Metadata","type":"object"},"objects":{"items":{"oneOf":[{"$ref":"#/$defs/PointObject"},{"$ref":"#/$defs/SegmentObject"},{"$ref":"#/$defs/LineObject"},{"$ref":"#/$defs/RayObject"},{"$ref":"#/$defs/CircleObject"},{"$ref":"#/$defs/TriangleObject"},{"$ref":"#/$defs/AngleObject"},{"$ref":"#/$defs/LabelObject"}]},"title":"Objects","type":"array"},"scene_type":{"const":"2d","title":"Scene Type","type":"string"},"schema_version":{"const":"0.2.0","title":"Schema Version","type":"string"}},"required":["schema_version","scene_type","objects","constraints","construction_steps"],"title":"GirScene","type":"object","x-gir-schema-version":"0.2.0"},"IncircleConstraint":{"additionalProperties":false,"properties":{"circle":{"title":"Circle","type":"string"},"id":{"title":"Id","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"triangle":{"title":"Triangle","type":"string"},"type":{"const":"incircle","title":"Type","type":"string"}},"required":["id","type","triangle","circle"],"title":"IncircleConstraint","type":"object"},"IntersectionConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"objects":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Objects","type":"array"},"point":{"title":"Point","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"intersection","title":"Type","type":"string"}},"required":["id","type","point","objects"],"title":"IntersectionConstraint","type":"object"},"LabelObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"target":{"title":"Target","type":"string"},"text":{"title":"Text","type":"string"},"type":{"const":"label","title":"Type","type":"string"}},"required":["id","type","text","target"],"title":"LabelObject","type":"object"},"LineObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Points","type":"array"},"type":{"const":"line","title":"Type","type":"string"}},"required":["id","type","points"],"title":"LineObject","type":"object"},"MedianConstraint":{"additionalProperties":false,"properties":{"from_point":{"title":"From Point","type":"string"},"id":{"title":"Id","type":"string"},"midpoint":{"title":"Midpoint","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"segment":{"title":"Segment","type":"string"},"to_object":{"title":"To Object","type":"string"},"type":{"const":"median","title":"Type","type":"string"}},"required":["id","type","from_point","to_object","midpoint","segment"],"title":"MedianConstraint","type":"object"},"MidpointConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"object":{"title":"Object","type":"string"},"point":{"title":"Point","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"midpoint","title":"Type","type":"string"}},"required":["id","type","point","object"],"title":"MidpointConstraint","type":"object"},"NonCollinearConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"maxItems":3,"minItems":3,"prefixItems":[{"type":"string"},{"type":"string"},{"type":"string"}],"title":"Points","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"non_collinear","title":"Type","type":"string"}},"required":["id","type","points"],"title":"NonCollinearConstraint","type":"object"},"ParallelConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"objects":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Objects","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"parallel","title":"Type","type":"string"}},"required":["id","type","objects"],"title":"ParallelConstraint","type":"object"},"PerpendicularConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"objects":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Objects","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"perpendicular","title":"Type","type":"string"}},"required":["id","type","objects"],"title":"PerpendicularConstraint","type":"object"},"PointObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"label":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Label"},"type":{"const":"point","title":"Type","type":"string"}},"required":["id","type"],"title":"PointObject","type":"object"},"ProblemDetail":{"additionalProperties":false,"examples":[{"code":"request_validation_failed","detail":"The request payload does not satisfy the API contract.","errors":[{"code":"literal_error","location":["body","mode"],"message":"Input should be 'strict'"}],"instance":"/api/v1/generate","request_id":"tutorboard-contract","status":422,"title":"Request validation failed","type":"urn:geometryos:problem:request-validation"},{"code":"operation_timeout","detail":"The generate operation exceeded its configured time limit.","errors":[],"instance":"/api/v1/generate","request_id":"tutorboard-contract","status":504,"title":"Operation timed out","type":"urn:geometryos:problem:operation-timeout"},{"code":"service_unavailable","detail":"GeometryOS is not ready to accept application requests.","errors":[],"instance":"/api/v1/generate","request_id":"tutorboard-contract","status":503,"title":"Service unavailable","type":"urn:geometryos:problem:service-unavailable"},{"code":"internal_error","detail":"An unexpected internal error occurred.","errors":[],"instance":"/api/v1/generate","request_id":"tutorboard-contract","status":500,"title":"Internal server error","type":"urn:geometryos:problem:internal-error"}],"properties":{"code":{"title":"Code","type":"string"},"detail":{"title":"Detail","type":"string"},"errors":{"items":{"$ref":"#/$defs/ProblemError"},"title":"Errors","type":"array"},"instance":{"title":"Instance","type":"string"},"request_id":{"title":"Request Id","type":"string"},"status":{"title":"Status","type":"integer"},"title":{"title":"Title","type":"string"},"type":{"title":"Type","type":"string"}},"required":["type","title","status","detail","instance","code","request_id"],"title":"ProblemDetail","type":"object"},"ProblemError":{"additionalProperties":false,"properties":{"code":{"title":"Code","type":"string"},"location":{"items":{"anyOf":[{"type":"string"},{"type":"integer"}]},"title":"Location","type":"array"},"message":{"title":"Message","type":"string"}},"required":["code","message"],"title":"ProblemError","type":"object"},"RayObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"start":{"title":"Start","type":"string"},"through":{"title":"Through","type":"string"},"type":{"const":"ray","title":"Type","type":"string"}},"required":["id","type","start","through"],"title":"RayObject","type":"object"},"ReadinessCheck":{"additionalProperties":false,"properties":{"name":{"title":"Name","type":"string"},"status":{"$ref":"#/$defs/CheckStatus"}},"required":["name","status"],"title":"ReadinessCheck","type":"object"},"ReadinessResponse":{"additionalProperties":false,"examples":[{"checks":[{"name":"lifecycle","status":"pass"},{"name":"settings","status":"pass"},{"name":"executor","status":"pass"}],"status":"ready"}],"properties":{"checks":{"items":{"$ref":"#/$defs/ReadinessCheck"},"title":"Checks","type":"array"},"status":{"enum":["ready","not_ready"],"title":"Status","type":"string"}},"required":["status","checks"],"title":"ReadinessResponse","type":"object"},"RenderSvgV1Response":{"additionalProperties":false,"examples":[{"content":"<svg xmlns=\"http://www.w3.org/2000/svg\">...</svg>","media_type":"image/svg+xml","schema_version":"0.2.0"}],"properties":{"content":{"title":"Content","type":"string"},"media_type":{"const":"image/svg+xml","default":"image/svg+xml","title":"Media Type","type":"string"},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"}},"required":["content"],"title":"RenderSvgV1Response","type":"object"},"RenderTikzV1Response":{"additionalProperties":false,"examples":[{"content":"\\begin{tikzpicture}...\\end{tikzpicture}","media_type":"text/x-tex","schema_version":"0.2.0"}],"properties":{"content":{"title":"Content","type":"string"},"media_type":{"const":"text/x-tex","default":"text/x-tex","title":"Media Type","type":"string"},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"}},"required":["content"],"title":"RenderTikzV1Response","type":"object"},"SegmentObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Points","type":"array"},"type":{"const":"segment","title":"Type","type":"string"}},"required":["id","type","points"],"title":"SegmentObject","type":"object"},"TriangleObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"type":{"const":"triangle","title":"Type","type":"string"},"vertices":{"maxItems":3,"minItems":3,"prefixItems":[{"type":"string"},{"type":"string"},{"type":"string"}],"title":"Vertices","type":"array"}},"required":["id","type","vertices"],"title":"TriangleObject","type":"object"},"ValidateGirV1Response":{"additionalProperties":false,"examples":[{"canonical_gir":{"constraints":[{"id":"c_noncol_abc","points":["A","B","C"],"type":"non_collinear"},{"foot":"H","from_point":"A","id":"c_altitude_a_bc","segment":"AH","to_object":"BC","type":"altitude"}],"construction_steps":[{"action":"construct_triangle","constraints":["c_noncol_abc"],"id":"step_construct_triangle","objects":["A","B","C","BC","ABC"],"reason":"Construct triangle ABC."},{"action":"construct_altitude","constraints":["c_altitude_a_bc"],"id":"step_construct_altitude","objects":["H","AH"],"reason":"Construct altitude from A to BC."}],"metadata":{},"objects":[{"id":"A","label":"A","type":"point"},{"id":"B","label":"B","type":"point"},{"id":"C","label":"C","type":"point"},{"id":"H","label":"H","type":"point"},{"id":"BC","points":["B","C"],"type":"segment"},{"id":"AH","points":["A","H"],"type":"segment"},{"id":"ABC","type":"triangle","vertices":["A","B","C"]}],"scene_type":"2d","schema_version":"0.2.0"},"schema_version":"0.2.0","validation_report":{"is_valid":true,"issues":[],"warnings":[]}}],"properties":{"canonical_gir":{"$ref":"#/$defs/GirScene"},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"},"validation_report":{"$ref":"#/$defs/ValidationReport"}},"required":["canonical_gir","validation_report"],"title":"ValidateGirV1Response","type":"object"},"ValidationIssue":{"additionalProperties":false,"properties":{"code":{"title":"Code","type":"string"},"message":{"title":"Message","type":"string"},"path":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Path"},"severity":{"default":"error","enum":["error","warning"],"title":"Severity","type":"string"}},"required":["code","message"],"title":"ValidationIssue","type":"object"},"ValidationReport":{"additionalProperties":false,"properties":{"is_valid":{"title":"Is Valid","type":"boolean"},"issues":{"items":{"$ref":"#/$defs/ValidationIssue"},"title":"Issues","type":"array"},"warnings":{"items":{"$ref":"#/$defs/ValidationIssue"},"title":"Warnings","type":"array"}},"required":["is_valid"],"title":"ValidationReport","type":"object"}}};


function validate20(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:tutorboard:geometryos:generate-request" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate20.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.input_type === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "input_type"},message:"must have required property '"+"input_type"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.input === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "input"},message:"must have required property '"+"input"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "input") || (key0 === "input_type")) || (key0 === "mode")) || (key0 === "output"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.input !== undefined){
let data0 = data.input;
if(typeof data0 === "string"){
if(func1(data0) > 20000){
const err3 = {instancePath:instancePath+"/input",schemaPath:"#/properties/input/maxLength",keyword:"maxLength",params:{limit: 20000},message:"must NOT have more than 20000 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(func1(data0) < 1){
const err4 = {instancePath:instancePath+"/input",schemaPath:"#/properties/input/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/input",schemaPath:"#/properties/input/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.input_type !== undefined){
let data1 = data.input_type;
if(typeof data1 !== "string"){
const err6 = {instancePath:instancePath+"/input_type",schemaPath:"#/properties/input_type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if("text" !== data1){
const err7 = {instancePath:instancePath+"/input_type",schemaPath:"#/properties/input_type/const",keyword:"const",params:{allowedValue: "text"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.mode !== undefined){
let data2 = data.mode;
if(typeof data2 !== "string"){
const err8 = {instancePath:instancePath+"/mode",schemaPath:"#/properties/mode/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if("strict" !== data2){
const err9 = {instancePath:instancePath+"/mode",schemaPath:"#/properties/mode/const",keyword:"const",params:{allowedValue: "strict"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.output !== undefined){
let data3 = data.output;
if(Array.isArray(data3)){
if(data3.length > 2){
const err10 = {instancePath:instancePath+"/output",schemaPath:"#/properties/output/maxItems",keyword:"maxItems",params:{limit: 2},message:"must NOT have more than 2 items"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
const len0 = data3.length;
for(let i0=0; i0<len0; i0++){
let data4 = data3[i0];
if(typeof data4 !== "string"){
const err11 = {instancePath:instancePath+"/output/" + i0,schemaPath:"#/properties/output/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!((data4 === "svg") || (data4 === "tikz"))){
const err12 = {instancePath:instancePath+"/output/" + i0,schemaPath:"#/properties/output/items/enum",keyword:"enum",params:{allowedValues: schema31.properties.output.items.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
let i1 = data3.length;
let j0;
if(i1 > 1){
const indices0 = {};
for(;i1--;){
let item0 = data3[i1];
if(typeof item0 !== "string"){
continue;
}
if(typeof indices0[item0] == "number"){
j0 = indices0[item0];
const err13 = {instancePath:instancePath+"/output",schemaPath:"#/properties/output/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
break;
}
indices0[item0] = i1;
}
}
}
else {
const err14 = {instancePath:instancePath+"/output",schemaPath:"#/properties/output/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
}
else {
const err15 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
validate20.errors = vErrors;
return errors === 0;
}
validate20.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateGenerateResponse = validate21;
const schema32 = {"$id":"urn:tutorboard:geometryos:generate-response","oneOf":[{"$ref":"#/$defs/GenerateSuccessResponse"},{"$ref":"#/$defs/GenerateClarificationResponse"},{"$ref":"#/$defs/GenerateErrorResponse"}],"title":"Response Geometryos V1 Generate","$defs":{"AltitudeConstraint":{"additionalProperties":false,"properties":{"foot":{"title":"Foot","type":"string"},"from_point":{"title":"From Point","type":"string"},"id":{"title":"Id","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"segment":{"title":"Segment","type":"string"},"to_object":{"title":"To Object","type":"string"},"type":{"const":"altitude","title":"Type","type":"string"}},"required":["id","type","from_point","to_object","foot","segment"],"title":"AltitudeConstraint","type":"object"},"AngleBisectorConstraint":{"additionalProperties":false,"properties":{"angle":{"title":"Angle","type":"string"},"id":{"title":"Id","type":"string"},"ray":{"title":"Ray","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"angle_bisector","title":"Type","type":"string"}},"required":["id","type","angle","ray"],"title":"AngleBisectorConstraint","type":"object"},"AngleObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"maxItems":3,"minItems":3,"prefixItems":[{"type":"string"},{"type":"string"},{"type":"string"}],"title":"Points","type":"array"},"type":{"const":"angle","title":"Type","type":"string"}},"required":["id","type","points"],"title":"AngleObject","type":"object"},"ApiAmbiguity":{"additionalProperties":false,"properties":{"code":{"title":"Code","type":"string"},"message":{"title":"Message","type":"string"},"options":{"items":{"type":"string"},"title":"Options","type":"array"}},"required":["code","message"],"title":"ApiAmbiguity","type":"object"},"ApiWarning":{"additionalProperties":false,"properties":{"code":{"enum":["unsupported_construction","draft_gir_invalid","normalized_gir_invalid","adapter_warning"],"title":"Code","type":"string"},"message":{"title":"Message","type":"string"}},"required":["code","message"],"title":"ApiWarning","type":"object"},"BelongsToConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"object":{"title":"Object","type":"string"},"point":{"title":"Point","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"belongs_to","title":"Type","type":"string"}},"required":["id","type","point","object"],"title":"BelongsToConstraint","type":"object"},"CheckStatus":{"enum":["pass","fail"],"title":"CheckStatus","type":"string"},"CircleObject":{"additionalProperties":false,"properties":{"center":{"title":"Center","type":"string"},"id":{"title":"Id","type":"string"},"radius_point":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Radius Point"},"type":{"const":"circle","title":"Type","type":"string"}},"required":["id","type","center"],"title":"CircleObject","type":"object"},"CircumcircleConstraint":{"additionalProperties":false,"properties":{"circle":{"title":"Circle","type":"string"},"id":{"title":"Id","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"triangle":{"title":"Triangle","type":"string"},"type":{"const":"circumcircle","title":"Type","type":"string"}},"required":["id","type","triangle","circle"],"title":"CircumcircleConstraint","type":"object"},"CollinearConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"items":{"type":"string"},"title":"Points","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"collinear","title":"Type","type":"string"}},"required":["id","type","points"],"title":"CollinearConstraint","type":"object"},"ConstructionStep":{"additionalProperties":false,"properties":{"action":{"title":"Action","type":"string"},"constraints":{"items":{"type":"string"},"title":"Constraints","type":"array"},"id":{"title":"Id","type":"string"},"objects":{"items":{"type":"string"},"title":"Objects","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"}},"required":["id","action","objects"],"title":"ConstructionStep","type":"object"},"EqualLengthConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"objects":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Objects","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"equal_length","title":"Type","type":"string"}},"required":["id","type","objects"],"title":"EqualLengthConstraint","type":"object"},"GenerateClarificationResponse":{"additionalProperties":false,"examples":[{"ambiguities":[{"code":"missing_angle","message":"Не указано, биссектрису какого угла нужно построить.","options":["angle_A","angle_B","angle_C"]}],"confidence":0.4,"explanation":"Bisector request lacks angle target.","schema_version":"0.2.0","status":"needs_clarification","warnings":[]}],"properties":{"ambiguities":{"items":{"$ref":"#/$defs/ApiAmbiguity"},"title":"Ambiguities","type":"array"},"confidence":{"maximum":1,"minimum":0,"title":"Confidence","type":"number"},"explanation":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Explanation"},"gir":{"title":"Gir","type":"null"},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"},"status":{"const":"needs_clarification","title":"Status","type":"string"},"svg":{"title":"Svg","type":"null"},"tikz":{"title":"Tikz","type":"null"},"validation_report":{"title":"Validation Report","type":"null"},"warnings":{"items":{"$ref":"#/$defs/ApiWarning"},"title":"Warnings","type":"array"}},"required":["status","confidence"],"title":"GenerateClarificationResponse","type":"object"},"GenerateErrorResponse":{"additionalProperties":false,"examples":[{"ambiguities":[],"confidence":0,"explanation":"No supported construction matched the input.","schema_version":"0.2.0","status":"error","warnings":[{"code":"unsupported_construction","message":"Construction is not supported."}]}],"properties":{"ambiguities":{"items":{"$ref":"#/$defs/ApiAmbiguity"},"title":"Ambiguities","type":"array"},"confidence":{"maximum":1,"minimum":0,"title":"Confidence","type":"number"},"explanation":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Explanation"},"gir":{"anyOf":[{"$ref":"#/$defs/GirScene"},{"type":"null"}]},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"},"status":{"const":"error","title":"Status","type":"string"},"svg":{"title":"Svg","type":"null"},"tikz":{"title":"Tikz","type":"null"},"validation_report":{"anyOf":[{"$ref":"#/$defs/ValidationReport"},{"type":"null"}]},"warnings":{"items":{"$ref":"#/$defs/ApiWarning"},"title":"Warnings","type":"array"}},"required":["status","confidence"],"title":"GenerateErrorResponse","type":"object"},"GenerateSuccessResponse":{"additionalProperties":false,"examples":[{"ambiguities":[],"confidence":0.98,"explanation":"Rule-based altitude case.","gir":{"constraints":[{"id":"c_noncol_abc","points":["A","B","C"],"type":"non_collinear"},{"foot":"H","from_point":"A","id":"c_altitude_a_bc","segment":"AH","to_object":"BC","type":"altitude"}],"construction_steps":[{"action":"construct_triangle","constraints":["c_noncol_abc"],"id":"step_construct_triangle","objects":["A","B","C","BC","ABC"],"reason":"Construct triangle ABC."},{"action":"construct_altitude","constraints":["c_altitude_a_bc"],"id":"step_construct_altitude","objects":["H","AH"],"reason":"Construct altitude from A to BC."}],"metadata":{},"objects":[{"id":"A","label":"A","type":"point"},{"id":"B","label":"B","type":"point"},{"id":"C","label":"C","type":"point"},{"id":"H","label":"H","type":"point"},{"id":"BC","points":["B","C"],"type":"segment"},{"id":"AH","points":["A","H"],"type":"segment"},{"id":"ABC","type":"triangle","vertices":["A","B","C"]}],"scene_type":"2d","schema_version":"0.2.0"},"schema_version":"0.2.0","status":"success","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\">...</svg>","validation_report":{"is_valid":true,"issues":[],"warnings":[]},"warnings":[]}],"properties":{"ambiguities":{"items":{"$ref":"#/$defs/ApiAmbiguity"},"title":"Ambiguities","type":"array"},"confidence":{"maximum":1,"minimum":0,"title":"Confidence","type":"number"},"explanation":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Explanation"},"gir":{"$ref":"#/$defs/GirScene"},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"},"status":{"const":"success","title":"Status","type":"string"},"svg":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Svg"},"tikz":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Tikz"},"validation_report":{"$ref":"#/$defs/ValidationReport"},"warnings":{"items":{"$ref":"#/$defs/ApiWarning"},"title":"Warnings","type":"array"}},"required":["status","confidence","gir","validation_report"],"title":"GenerateSuccessResponse","type":"object"},"GenerateV1Request":{"additionalProperties":false,"examples":[{"input":"Постройте треугольник ABC. Проведите высоту из вершины A к стороне BC.","input_type":"text","mode":"strict","output":["svg"]}],"properties":{"input":{"maxLength":20000,"minLength":1,"title":"Input","type":"string"},"input_type":{"const":"text","title":"Input Type","type":"string"},"mode":{"const":"strict","default":"strict","title":"Mode","type":"string"},"output":{"items":{"enum":["svg","tikz"],"type":"string"},"maxItems":2,"title":"Output","type":"array","uniqueItems":true}},"required":["input_type","input"],"title":"GenerateV1Request","type":"object"},"GirScene":{"additionalProperties":false,"properties":{"constraints":{"items":{"oneOf":[{"$ref":"#/$defs/BelongsToConstraint"},{"$ref":"#/$defs/CollinearConstraint"},{"$ref":"#/$defs/NonCollinearConstraint"},{"$ref":"#/$defs/ParallelConstraint"},{"$ref":"#/$defs/PerpendicularConstraint"},{"$ref":"#/$defs/EqualLengthConstraint"},{"$ref":"#/$defs/MidpointConstraint"},{"$ref":"#/$defs/IntersectionConstraint"},{"$ref":"#/$defs/AltitudeConstraint"},{"$ref":"#/$defs/MedianConstraint"},{"$ref":"#/$defs/AngleBisectorConstraint"},{"$ref":"#/$defs/CircumcircleConstraint"},{"$ref":"#/$defs/IncircleConstraint"}]},"title":"Constraints","type":"array"},"construction_steps":{"items":{"$ref":"#/$defs/ConstructionStep"},"title":"Construction Steps","type":"array"},"metadata":{"additionalProperties":true,"title":"Metadata","type":"object"},"objects":{"items":{"oneOf":[{"$ref":"#/$defs/PointObject"},{"$ref":"#/$defs/SegmentObject"},{"$ref":"#/$defs/LineObject"},{"$ref":"#/$defs/RayObject"},{"$ref":"#/$defs/CircleObject"},{"$ref":"#/$defs/TriangleObject"},{"$ref":"#/$defs/AngleObject"},{"$ref":"#/$defs/LabelObject"}]},"title":"Objects","type":"array"},"scene_type":{"const":"2d","title":"Scene Type","type":"string"},"schema_version":{"const":"0.2.0","title":"Schema Version","type":"string"}},"required":["schema_version","scene_type","objects","constraints","construction_steps"],"title":"GirScene","type":"object","x-gir-schema-version":"0.2.0"},"IncircleConstraint":{"additionalProperties":false,"properties":{"circle":{"title":"Circle","type":"string"},"id":{"title":"Id","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"triangle":{"title":"Triangle","type":"string"},"type":{"const":"incircle","title":"Type","type":"string"}},"required":["id","type","triangle","circle"],"title":"IncircleConstraint","type":"object"},"IntersectionConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"objects":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Objects","type":"array"},"point":{"title":"Point","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"intersection","title":"Type","type":"string"}},"required":["id","type","point","objects"],"title":"IntersectionConstraint","type":"object"},"LabelObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"target":{"title":"Target","type":"string"},"text":{"title":"Text","type":"string"},"type":{"const":"label","title":"Type","type":"string"}},"required":["id","type","text","target"],"title":"LabelObject","type":"object"},"LineObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Points","type":"array"},"type":{"const":"line","title":"Type","type":"string"}},"required":["id","type","points"],"title":"LineObject","type":"object"},"MedianConstraint":{"additionalProperties":false,"properties":{"from_point":{"title":"From Point","type":"string"},"id":{"title":"Id","type":"string"},"midpoint":{"title":"Midpoint","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"segment":{"title":"Segment","type":"string"},"to_object":{"title":"To Object","type":"string"},"type":{"const":"median","title":"Type","type":"string"}},"required":["id","type","from_point","to_object","midpoint","segment"],"title":"MedianConstraint","type":"object"},"MidpointConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"object":{"title":"Object","type":"string"},"point":{"title":"Point","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"midpoint","title":"Type","type":"string"}},"required":["id","type","point","object"],"title":"MidpointConstraint","type":"object"},"NonCollinearConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"maxItems":3,"minItems":3,"prefixItems":[{"type":"string"},{"type":"string"},{"type":"string"}],"title":"Points","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"non_collinear","title":"Type","type":"string"}},"required":["id","type","points"],"title":"NonCollinearConstraint","type":"object"},"ParallelConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"objects":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Objects","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"parallel","title":"Type","type":"string"}},"required":["id","type","objects"],"title":"ParallelConstraint","type":"object"},"PerpendicularConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"objects":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Objects","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"perpendicular","title":"Type","type":"string"}},"required":["id","type","objects"],"title":"PerpendicularConstraint","type":"object"},"PointObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"label":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Label"},"type":{"const":"point","title":"Type","type":"string"}},"required":["id","type"],"title":"PointObject","type":"object"},"ProblemDetail":{"additionalProperties":false,"examples":[{"code":"request_validation_failed","detail":"The request payload does not satisfy the API contract.","errors":[{"code":"literal_error","location":["body","mode"],"message":"Input should be 'strict'"}],"instance":"/api/v1/generate","request_id":"tutorboard-contract","status":422,"title":"Request validation failed","type":"urn:geometryos:problem:request-validation"},{"code":"operation_timeout","detail":"The generate operation exceeded its configured time limit.","errors":[],"instance":"/api/v1/generate","request_id":"tutorboard-contract","status":504,"title":"Operation timed out","type":"urn:geometryos:problem:operation-timeout"},{"code":"service_unavailable","detail":"GeometryOS is not ready to accept application requests.","errors":[],"instance":"/api/v1/generate","request_id":"tutorboard-contract","status":503,"title":"Service unavailable","type":"urn:geometryos:problem:service-unavailable"},{"code":"internal_error","detail":"An unexpected internal error occurred.","errors":[],"instance":"/api/v1/generate","request_id":"tutorboard-contract","status":500,"title":"Internal server error","type":"urn:geometryos:problem:internal-error"}],"properties":{"code":{"title":"Code","type":"string"},"detail":{"title":"Detail","type":"string"},"errors":{"items":{"$ref":"#/$defs/ProblemError"},"title":"Errors","type":"array"},"instance":{"title":"Instance","type":"string"},"request_id":{"title":"Request Id","type":"string"},"status":{"title":"Status","type":"integer"},"title":{"title":"Title","type":"string"},"type":{"title":"Type","type":"string"}},"required":["type","title","status","detail","instance","code","request_id"],"title":"ProblemDetail","type":"object"},"ProblemError":{"additionalProperties":false,"properties":{"code":{"title":"Code","type":"string"},"location":{"items":{"anyOf":[{"type":"string"},{"type":"integer"}]},"title":"Location","type":"array"},"message":{"title":"Message","type":"string"}},"required":["code","message"],"title":"ProblemError","type":"object"},"RayObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"start":{"title":"Start","type":"string"},"through":{"title":"Through","type":"string"},"type":{"const":"ray","title":"Type","type":"string"}},"required":["id","type","start","through"],"title":"RayObject","type":"object"},"ReadinessCheck":{"additionalProperties":false,"properties":{"name":{"title":"Name","type":"string"},"status":{"$ref":"#/$defs/CheckStatus"}},"required":["name","status"],"title":"ReadinessCheck","type":"object"},"ReadinessResponse":{"additionalProperties":false,"examples":[{"checks":[{"name":"lifecycle","status":"pass"},{"name":"settings","status":"pass"},{"name":"executor","status":"pass"}],"status":"ready"}],"properties":{"checks":{"items":{"$ref":"#/$defs/ReadinessCheck"},"title":"Checks","type":"array"},"status":{"enum":["ready","not_ready"],"title":"Status","type":"string"}},"required":["status","checks"],"title":"ReadinessResponse","type":"object"},"RenderSvgV1Response":{"additionalProperties":false,"examples":[{"content":"<svg xmlns=\"http://www.w3.org/2000/svg\">...</svg>","media_type":"image/svg+xml","schema_version":"0.2.0"}],"properties":{"content":{"title":"Content","type":"string"},"media_type":{"const":"image/svg+xml","default":"image/svg+xml","title":"Media Type","type":"string"},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"}},"required":["content"],"title":"RenderSvgV1Response","type":"object"},"RenderTikzV1Response":{"additionalProperties":false,"examples":[{"content":"\\begin{tikzpicture}...\\end{tikzpicture}","media_type":"text/x-tex","schema_version":"0.2.0"}],"properties":{"content":{"title":"Content","type":"string"},"media_type":{"const":"text/x-tex","default":"text/x-tex","title":"Media Type","type":"string"},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"}},"required":["content"],"title":"RenderTikzV1Response","type":"object"},"SegmentObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Points","type":"array"},"type":{"const":"segment","title":"Type","type":"string"}},"required":["id","type","points"],"title":"SegmentObject","type":"object"},"TriangleObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"type":{"const":"triangle","title":"Type","type":"string"},"vertices":{"maxItems":3,"minItems":3,"prefixItems":[{"type":"string"},{"type":"string"},{"type":"string"}],"title":"Vertices","type":"array"}},"required":["id","type","vertices"],"title":"TriangleObject","type":"object"},"ValidateGirV1Response":{"additionalProperties":false,"examples":[{"canonical_gir":{"constraints":[{"id":"c_noncol_abc","points":["A","B","C"],"type":"non_collinear"},{"foot":"H","from_point":"A","id":"c_altitude_a_bc","segment":"AH","to_object":"BC","type":"altitude"}],"construction_steps":[{"action":"construct_triangle","constraints":["c_noncol_abc"],"id":"step_construct_triangle","objects":["A","B","C","BC","ABC"],"reason":"Construct triangle ABC."},{"action":"construct_altitude","constraints":["c_altitude_a_bc"],"id":"step_construct_altitude","objects":["H","AH"],"reason":"Construct altitude from A to BC."}],"metadata":{},"objects":[{"id":"A","label":"A","type":"point"},{"id":"B","label":"B","type":"point"},{"id":"C","label":"C","type":"point"},{"id":"H","label":"H","type":"point"},{"id":"BC","points":["B","C"],"type":"segment"},{"id":"AH","points":["A","H"],"type":"segment"},{"id":"ABC","type":"triangle","vertices":["A","B","C"]}],"scene_type":"2d","schema_version":"0.2.0"},"schema_version":"0.2.0","validation_report":{"is_valid":true,"issues":[],"warnings":[]}}],"properties":{"canonical_gir":{"$ref":"#/$defs/GirScene"},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"},"validation_report":{"$ref":"#/$defs/ValidationReport"}},"required":["canonical_gir","validation_report"],"title":"ValidateGirV1Response","type":"object"},"ValidationIssue":{"additionalProperties":false,"properties":{"code":{"title":"Code","type":"string"},"message":{"title":"Message","type":"string"},"path":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Path"},"severity":{"default":"error","enum":["error","warning"],"title":"Severity","type":"string"}},"required":["code","message"],"title":"ValidationIssue","type":"object"},"ValidationReport":{"additionalProperties":false,"properties":{"is_valid":{"title":"Is Valid","type":"boolean"},"issues":{"items":{"$ref":"#/$defs/ValidationIssue"},"title":"Issues","type":"array"},"warnings":{"items":{"$ref":"#/$defs/ValidationIssue"},"title":"Warnings","type":"array"}},"required":["is_valid"],"title":"ValidationReport","type":"object"}}};
const schema33 = {"additionalProperties":false,"examples":[{"ambiguities":[],"confidence":0.98,"explanation":"Rule-based altitude case.","gir":{"constraints":[{"id":"c_noncol_abc","points":["A","B","C"],"type":"non_collinear"},{"foot":"H","from_point":"A","id":"c_altitude_a_bc","segment":"AH","to_object":"BC","type":"altitude"}],"construction_steps":[{"action":"construct_triangle","constraints":["c_noncol_abc"],"id":"step_construct_triangle","objects":["A","B","C","BC","ABC"],"reason":"Construct triangle ABC."},{"action":"construct_altitude","constraints":["c_altitude_a_bc"],"id":"step_construct_altitude","objects":["H","AH"],"reason":"Construct altitude from A to BC."}],"metadata":{},"objects":[{"id":"A","label":"A","type":"point"},{"id":"B","label":"B","type":"point"},{"id":"C","label":"C","type":"point"},{"id":"H","label":"H","type":"point"},{"id":"BC","points":["B","C"],"type":"segment"},{"id":"AH","points":["A","H"],"type":"segment"},{"id":"ABC","type":"triangle","vertices":["A","B","C"]}],"scene_type":"2d","schema_version":"0.2.0"},"schema_version":"0.2.0","status":"success","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\">...</svg>","validation_report":{"is_valid":true,"issues":[],"warnings":[]},"warnings":[]}],"properties":{"ambiguities":{"items":{"$ref":"#/$defs/ApiAmbiguity"},"title":"Ambiguities","type":"array"},"confidence":{"maximum":1,"minimum":0,"title":"Confidence","type":"number"},"explanation":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Explanation"},"gir":{"$ref":"#/$defs/GirScene"},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"},"status":{"const":"success","title":"Status","type":"string"},"svg":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Svg"},"tikz":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Tikz"},"validation_report":{"$ref":"#/$defs/ValidationReport"},"warnings":{"items":{"$ref":"#/$defs/ApiWarning"},"title":"Warnings","type":"array"}},"required":["status","confidence","gir","validation_report"],"title":"GenerateSuccessResponse","type":"object"};
const schema34 = {"additionalProperties":false,"properties":{"code":{"title":"Code","type":"string"},"message":{"title":"Message","type":"string"},"options":{"items":{"type":"string"},"title":"Options","type":"array"}},"required":["code","message"],"title":"ApiAmbiguity","type":"object"};
const schema61 = {"additionalProperties":false,"properties":{"code":{"enum":["unsupported_construction","draft_gir_invalid","normalized_gir_invalid","adapter_warning"],"title":"Code","type":"string"},"message":{"title":"Message","type":"string"}},"required":["code","message"],"title":"ApiWarning","type":"object"};
const func3 = Object.prototype.hasOwnProperty;
const schema35 = {"additionalProperties":false,"properties":{"constraints":{"items":{"oneOf":[{"$ref":"#/$defs/BelongsToConstraint"},{"$ref":"#/$defs/CollinearConstraint"},{"$ref":"#/$defs/NonCollinearConstraint"},{"$ref":"#/$defs/ParallelConstraint"},{"$ref":"#/$defs/PerpendicularConstraint"},{"$ref":"#/$defs/EqualLengthConstraint"},{"$ref":"#/$defs/MidpointConstraint"},{"$ref":"#/$defs/IntersectionConstraint"},{"$ref":"#/$defs/AltitudeConstraint"},{"$ref":"#/$defs/MedianConstraint"},{"$ref":"#/$defs/AngleBisectorConstraint"},{"$ref":"#/$defs/CircumcircleConstraint"},{"$ref":"#/$defs/IncircleConstraint"}]},"title":"Constraints","type":"array"},"construction_steps":{"items":{"$ref":"#/$defs/ConstructionStep"},"title":"Construction Steps","type":"array"},"metadata":{"additionalProperties":true,"title":"Metadata","type":"object"},"objects":{"items":{"oneOf":[{"$ref":"#/$defs/PointObject"},{"$ref":"#/$defs/SegmentObject"},{"$ref":"#/$defs/LineObject"},{"$ref":"#/$defs/RayObject"},{"$ref":"#/$defs/CircleObject"},{"$ref":"#/$defs/TriangleObject"},{"$ref":"#/$defs/AngleObject"},{"$ref":"#/$defs/LabelObject"}]},"title":"Objects","type":"array"},"scene_type":{"const":"2d","title":"Scene Type","type":"string"},"schema_version":{"const":"0.2.0","title":"Schema Version","type":"string"}},"required":["schema_version","scene_type","objects","constraints","construction_steps"],"title":"GirScene","type":"object","x-gir-schema-version":"0.2.0"};
const schema36 = {"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"object":{"title":"Object","type":"string"},"point":{"title":"Point","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"belongs_to","title":"Type","type":"string"}},"required":["id","type","point","object"],"title":"BelongsToConstraint","type":"object"};
const schema37 = {"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"items":{"type":"string"},"title":"Points","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"collinear","title":"Type","type":"string"}},"required":["id","type","points"],"title":"CollinearConstraint","type":"object"};
const schema38 = {"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"maxItems":3,"minItems":3,"prefixItems":[{"type":"string"},{"type":"string"},{"type":"string"}],"title":"Points","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"non_collinear","title":"Type","type":"string"}},"required":["id","type","points"],"title":"NonCollinearConstraint","type":"object"};
const schema39 = {"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"objects":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Objects","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"parallel","title":"Type","type":"string"}},"required":["id","type","objects"],"title":"ParallelConstraint","type":"object"};
const schema40 = {"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"objects":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Objects","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"perpendicular","title":"Type","type":"string"}},"required":["id","type","objects"],"title":"PerpendicularConstraint","type":"object"};
const schema41 = {"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"objects":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Objects","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"equal_length","title":"Type","type":"string"}},"required":["id","type","objects"],"title":"EqualLengthConstraint","type":"object"};
const schema42 = {"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"object":{"title":"Object","type":"string"},"point":{"title":"Point","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"midpoint","title":"Type","type":"string"}},"required":["id","type","point","object"],"title":"MidpointConstraint","type":"object"};
const schema43 = {"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"objects":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Objects","type":"array"},"point":{"title":"Point","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"intersection","title":"Type","type":"string"}},"required":["id","type","point","objects"],"title":"IntersectionConstraint","type":"object"};
const schema44 = {"additionalProperties":false,"properties":{"foot":{"title":"Foot","type":"string"},"from_point":{"title":"From Point","type":"string"},"id":{"title":"Id","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"segment":{"title":"Segment","type":"string"},"to_object":{"title":"To Object","type":"string"},"type":{"const":"altitude","title":"Type","type":"string"}},"required":["id","type","from_point","to_object","foot","segment"],"title":"AltitudeConstraint","type":"object"};
const schema45 = {"additionalProperties":false,"properties":{"from_point":{"title":"From Point","type":"string"},"id":{"title":"Id","type":"string"},"midpoint":{"title":"Midpoint","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"segment":{"title":"Segment","type":"string"},"to_object":{"title":"To Object","type":"string"},"type":{"const":"median","title":"Type","type":"string"}},"required":["id","type","from_point","to_object","midpoint","segment"],"title":"MedianConstraint","type":"object"};
const schema46 = {"additionalProperties":false,"properties":{"angle":{"title":"Angle","type":"string"},"id":{"title":"Id","type":"string"},"ray":{"title":"Ray","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"angle_bisector","title":"Type","type":"string"}},"required":["id","type","angle","ray"],"title":"AngleBisectorConstraint","type":"object"};
const schema47 = {"additionalProperties":false,"properties":{"circle":{"title":"Circle","type":"string"},"id":{"title":"Id","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"triangle":{"title":"Triangle","type":"string"},"type":{"const":"circumcircle","title":"Type","type":"string"}},"required":["id","type","triangle","circle"],"title":"CircumcircleConstraint","type":"object"};
const schema48 = {"additionalProperties":false,"properties":{"circle":{"title":"Circle","type":"string"},"id":{"title":"Id","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"triangle":{"title":"Triangle","type":"string"},"type":{"const":"incircle","title":"Type","type":"string"}},"required":["id","type","triangle","circle"],"title":"IncircleConstraint","type":"object"};
const schema49 = {"additionalProperties":false,"properties":{"action":{"title":"Action","type":"string"},"constraints":{"items":{"type":"string"},"title":"Constraints","type":"array"},"id":{"title":"Id","type":"string"},"objects":{"items":{"type":"string"},"title":"Objects","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"}},"required":["id","action","objects"],"title":"ConstructionStep","type":"object"};
const schema50 = {"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"label":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Label"},"type":{"const":"point","title":"Type","type":"string"}},"required":["id","type"],"title":"PointObject","type":"object"};
const schema51 = {"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Points","type":"array"},"type":{"const":"segment","title":"Type","type":"string"}},"required":["id","type","points"],"title":"SegmentObject","type":"object"};
const schema52 = {"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Points","type":"array"},"type":{"const":"line","title":"Type","type":"string"}},"required":["id","type","points"],"title":"LineObject","type":"object"};
const schema53 = {"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"start":{"title":"Start","type":"string"},"through":{"title":"Through","type":"string"},"type":{"const":"ray","title":"Type","type":"string"}},"required":["id","type","start","through"],"title":"RayObject","type":"object"};
const schema54 = {"additionalProperties":false,"properties":{"center":{"title":"Center","type":"string"},"id":{"title":"Id","type":"string"},"radius_point":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Radius Point"},"type":{"const":"circle","title":"Type","type":"string"}},"required":["id","type","center"],"title":"CircleObject","type":"object"};
const schema55 = {"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"type":{"const":"triangle","title":"Type","type":"string"},"vertices":{"maxItems":3,"minItems":3,"prefixItems":[{"type":"string"},{"type":"string"},{"type":"string"}],"title":"Vertices","type":"array"}},"required":["id","type","vertices"],"title":"TriangleObject","type":"object"};
const schema56 = {"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"maxItems":3,"minItems":3,"prefixItems":[{"type":"string"},{"type":"string"},{"type":"string"}],"title":"Points","type":"array"},"type":{"const":"angle","title":"Type","type":"string"}},"required":["id","type","points"],"title":"AngleObject","type":"object"};
const schema57 = {"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"target":{"title":"Target","type":"string"},"text":{"title":"Text","type":"string"},"type":{"const":"label","title":"Type","type":"string"}},"required":["id","type","text","target"],"title":"LabelObject","type":"object"};

function validate23(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate23.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.schema_version === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "schema_version"},message:"must have required property '"+"schema_version"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.scene_type === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "scene_type"},message:"must have required property '"+"scene_type"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.objects === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "objects"},message:"must have required property '"+"objects"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.constraints === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "constraints"},message:"must have required property '"+"constraints"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.construction_steps === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "construction_steps"},message:"must have required property '"+"construction_steps"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "constraints") || (key0 === "construction_steps")) || (key0 === "metadata")) || (key0 === "objects")) || (key0 === "scene_type")) || (key0 === "schema_version"))){
const err5 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.constraints !== undefined){
let data0 = data.constraints;
if(Array.isArray(data0)){
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
let data1 = data0[i0];
const _errs5 = errors;
let valid3 = false;
let passing0 = null;
const _errs6 = errors;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.id === undefined){
const err6 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/BelongsToConstraint/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data1.type === undefined){
const err7 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/BelongsToConstraint/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data1.point === undefined){
const err8 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/BelongsToConstraint/required",keyword:"required",params:{missingProperty: "point"},message:"must have required property '"+"point"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data1.object === undefined){
const err9 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/BelongsToConstraint/required",keyword:"required",params:{missingProperty: "object"},message:"must have required property '"+"object"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key1 in data1){
if(!(((((key1 === "id") || (key1 === "object")) || (key1 === "point")) || (key1 === "reason")) || (key1 === "type"))){
const err10 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/BelongsToConstraint/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data1.id !== undefined){
if(typeof data1.id !== "string"){
const err11 = {instancePath:instancePath+"/constraints/" + i0+"/id",schemaPath:"#/$defs/BelongsToConstraint/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data1.object !== undefined){
if(typeof data1.object !== "string"){
const err12 = {instancePath:instancePath+"/constraints/" + i0+"/object",schemaPath:"#/$defs/BelongsToConstraint/properties/object/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data1.point !== undefined){
if(typeof data1.point !== "string"){
const err13 = {instancePath:instancePath+"/constraints/" + i0+"/point",schemaPath:"#/$defs/BelongsToConstraint/properties/point/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data1.reason !== undefined){
let data5 = data1.reason;
const _errs17 = errors;
let valid6 = false;
const _errs18 = errors;
if(typeof data5 !== "string"){
const err14 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/BelongsToConstraint/properties/reason/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
var _valid1 = _errs18 === errors;
valid6 = valid6 || _valid1;
const _errs20 = errors;
if(data5 !== null){
const err15 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/BelongsToConstraint/properties/reason/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var _valid1 = _errs20 === errors;
valid6 = valid6 || _valid1;
if(!valid6){
const err16 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/BelongsToConstraint/properties/reason/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
else {
errors = _errs17;
if(vErrors !== null){
if(_errs17){
vErrors.length = _errs17;
}
else {
vErrors = null;
}
}
}
}
if(data1.type !== undefined){
let data6 = data1.type;
if(typeof data6 !== "string"){
const err17 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/BelongsToConstraint/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if("belongs_to" !== data6){
const err18 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/BelongsToConstraint/properties/type/const",keyword:"const",params:{allowedValue: "belongs_to"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/BelongsToConstraint/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var _valid0 = _errs6 === errors;
if(_valid0){
valid3 = true;
passing0 = 0;
var props0 = true;
}
const _errs24 = errors;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.id === undefined){
const err20 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/CollinearConstraint/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(data1.type === undefined){
const err21 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/CollinearConstraint/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(data1.points === undefined){
const err22 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/CollinearConstraint/required",keyword:"required",params:{missingProperty: "points"},message:"must have required property '"+"points"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
for(const key2 in data1){
if(!((((key2 === "id") || (key2 === "points")) || (key2 === "reason")) || (key2 === "type"))){
const err23 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/CollinearConstraint/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data1.id !== undefined){
if(typeof data1.id !== "string"){
const err24 = {instancePath:instancePath+"/constraints/" + i0+"/id",schemaPath:"#/$defs/CollinearConstraint/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data1.points !== undefined){
let data8 = data1.points;
if(Array.isArray(data8)){
const len1 = data8.length;
for(let i1=0; i1<len1; i1++){
if(typeof data8[i1] !== "string"){
const err25 = {instancePath:instancePath+"/constraints/" + i0+"/points/" + i1,schemaPath:"#/$defs/CollinearConstraint/properties/points/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
else {
const err26 = {instancePath:instancePath+"/constraints/" + i0+"/points",schemaPath:"#/$defs/CollinearConstraint/properties/points/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data1.reason !== undefined){
let data10 = data1.reason;
const _errs35 = errors;
let valid11 = false;
const _errs36 = errors;
if(typeof data10 !== "string"){
const err27 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/CollinearConstraint/properties/reason/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
var _valid2 = _errs36 === errors;
valid11 = valid11 || _valid2;
const _errs38 = errors;
if(data10 !== null){
const err28 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/CollinearConstraint/properties/reason/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
var _valid2 = _errs38 === errors;
valid11 = valid11 || _valid2;
if(!valid11){
const err29 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/CollinearConstraint/properties/reason/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
else {
errors = _errs35;
if(vErrors !== null){
if(_errs35){
vErrors.length = _errs35;
}
else {
vErrors = null;
}
}
}
}
if(data1.type !== undefined){
let data11 = data1.type;
if(typeof data11 !== "string"){
const err30 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/CollinearConstraint/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if("collinear" !== data11){
const err31 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/CollinearConstraint/properties/type/const",keyword:"const",params:{allowedValue: "collinear"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
}
else {
const err32 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/CollinearConstraint/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
var _valid0 = _errs24 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid3 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
const _errs42 = errors;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.id === undefined){
const err33 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/NonCollinearConstraint/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if(data1.type === undefined){
const err34 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/NonCollinearConstraint/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
if(data1.points === undefined){
const err35 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/NonCollinearConstraint/required",keyword:"required",params:{missingProperty: "points"},message:"must have required property '"+"points"+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
for(const key3 in data1){
if(!((((key3 === "id") || (key3 === "points")) || (key3 === "reason")) || (key3 === "type"))){
const err36 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/NonCollinearConstraint/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
if(data1.id !== undefined){
if(typeof data1.id !== "string"){
const err37 = {instancePath:instancePath+"/constraints/" + i0+"/id",schemaPath:"#/$defs/NonCollinearConstraint/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data1.points !== undefined){
let data13 = data1.points;
if(Array.isArray(data13)){
if(data13.length > 3){
const err38 = {instancePath:instancePath+"/constraints/" + i0+"/points",schemaPath:"#/$defs/NonCollinearConstraint/properties/points/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(data13.length < 3){
const err39 = {instancePath:instancePath+"/constraints/" + i0+"/points",schemaPath:"#/$defs/NonCollinearConstraint/properties/points/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
const len2 = data13.length;
if(len2 > 0){
if(typeof data13[0] !== "string"){
const err40 = {instancePath:instancePath+"/constraints/" + i0+"/points/0",schemaPath:"#/$defs/NonCollinearConstraint/properties/points/prefixItems/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(len2 > 1){
if(typeof data13[1] !== "string"){
const err41 = {instancePath:instancePath+"/constraints/" + i0+"/points/1",schemaPath:"#/$defs/NonCollinearConstraint/properties/points/prefixItems/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(len2 > 2){
if(typeof data13[2] !== "string"){
const err42 = {instancePath:instancePath+"/constraints/" + i0+"/points/2",schemaPath:"#/$defs/NonCollinearConstraint/properties/points/prefixItems/2/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
}
else {
const err43 = {instancePath:instancePath+"/constraints/" + i0+"/points",schemaPath:"#/$defs/NonCollinearConstraint/properties/points/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data1.reason !== undefined){
let data17 = data1.reason;
const _errs57 = errors;
let valid15 = false;
const _errs58 = errors;
if(typeof data17 !== "string"){
const err44 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/NonCollinearConstraint/properties/reason/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
var _valid3 = _errs58 === errors;
valid15 = valid15 || _valid3;
const _errs60 = errors;
if(data17 !== null){
const err45 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/NonCollinearConstraint/properties/reason/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
var _valid3 = _errs60 === errors;
valid15 = valid15 || _valid3;
if(!valid15){
const err46 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/NonCollinearConstraint/properties/reason/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
else {
errors = _errs57;
if(vErrors !== null){
if(_errs57){
vErrors.length = _errs57;
}
else {
vErrors = null;
}
}
}
}
if(data1.type !== undefined){
let data18 = data1.type;
if(typeof data18 !== "string"){
const err47 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/NonCollinearConstraint/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if("non_collinear" !== data18){
const err48 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/NonCollinearConstraint/properties/type/const",keyword:"const",params:{allowedValue: "non_collinear"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
}
else {
const err49 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/NonCollinearConstraint/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
var _valid0 = _errs42 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid3 = true;
passing0 = 2;
if(props0 !== true){
props0 = true;
}
}
const _errs64 = errors;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.id === undefined){
const err50 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/ParallelConstraint/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
if(data1.type === undefined){
const err51 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/ParallelConstraint/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if(data1.objects === undefined){
const err52 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/ParallelConstraint/required",keyword:"required",params:{missingProperty: "objects"},message:"must have required property '"+"objects"+"'"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
for(const key4 in data1){
if(!((((key4 === "id") || (key4 === "objects")) || (key4 === "reason")) || (key4 === "type"))){
const err53 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/ParallelConstraint/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
if(data1.id !== undefined){
if(typeof data1.id !== "string"){
const err54 = {instancePath:instancePath+"/constraints/" + i0+"/id",schemaPath:"#/$defs/ParallelConstraint/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
if(data1.objects !== undefined){
let data20 = data1.objects;
if(Array.isArray(data20)){
if(data20.length > 2){
const err55 = {instancePath:instancePath+"/constraints/" + i0+"/objects",schemaPath:"#/$defs/ParallelConstraint/properties/objects/maxItems",keyword:"maxItems",params:{limit: 2},message:"must NOT have more than 2 items"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
if(data20.length < 2){
const err56 = {instancePath:instancePath+"/constraints/" + i0+"/objects",schemaPath:"#/$defs/ParallelConstraint/properties/objects/minItems",keyword:"minItems",params:{limit: 2},message:"must NOT have fewer than 2 items"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
const len3 = data20.length;
if(len3 > 0){
if(typeof data20[0] !== "string"){
const err57 = {instancePath:instancePath+"/constraints/" + i0+"/objects/0",schemaPath:"#/$defs/ParallelConstraint/properties/objects/prefixItems/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
if(len3 > 1){
if(typeof data20[1] !== "string"){
const err58 = {instancePath:instancePath+"/constraints/" + i0+"/objects/1",schemaPath:"#/$defs/ParallelConstraint/properties/objects/prefixItems/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
}
else {
const err59 = {instancePath:instancePath+"/constraints/" + i0+"/objects",schemaPath:"#/$defs/ParallelConstraint/properties/objects/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
if(data1.reason !== undefined){
let data23 = data1.reason;
const _errs77 = errors;
let valid19 = false;
const _errs78 = errors;
if(typeof data23 !== "string"){
const err60 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/ParallelConstraint/properties/reason/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
var _valid4 = _errs78 === errors;
valid19 = valid19 || _valid4;
const _errs80 = errors;
if(data23 !== null){
const err61 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/ParallelConstraint/properties/reason/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
var _valid4 = _errs80 === errors;
valid19 = valid19 || _valid4;
if(!valid19){
const err62 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/ParallelConstraint/properties/reason/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
else {
errors = _errs77;
if(vErrors !== null){
if(_errs77){
vErrors.length = _errs77;
}
else {
vErrors = null;
}
}
}
}
if(data1.type !== undefined){
let data24 = data1.type;
if(typeof data24 !== "string"){
const err63 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/ParallelConstraint/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
if("parallel" !== data24){
const err64 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/ParallelConstraint/properties/type/const",keyword:"const",params:{allowedValue: "parallel"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
}
else {
const err65 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/ParallelConstraint/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
var _valid0 = _errs64 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid3 = true;
passing0 = 3;
if(props0 !== true){
props0 = true;
}
}
const _errs84 = errors;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.id === undefined){
const err66 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/PerpendicularConstraint/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
if(data1.type === undefined){
const err67 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/PerpendicularConstraint/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
if(data1.objects === undefined){
const err68 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/PerpendicularConstraint/required",keyword:"required",params:{missingProperty: "objects"},message:"must have required property '"+"objects"+"'"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
for(const key5 in data1){
if(!((((key5 === "id") || (key5 === "objects")) || (key5 === "reason")) || (key5 === "type"))){
const err69 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/PerpendicularConstraint/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
}
if(data1.id !== undefined){
if(typeof data1.id !== "string"){
const err70 = {instancePath:instancePath+"/constraints/" + i0+"/id",schemaPath:"#/$defs/PerpendicularConstraint/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
if(data1.objects !== undefined){
let data26 = data1.objects;
if(Array.isArray(data26)){
if(data26.length > 2){
const err71 = {instancePath:instancePath+"/constraints/" + i0+"/objects",schemaPath:"#/$defs/PerpendicularConstraint/properties/objects/maxItems",keyword:"maxItems",params:{limit: 2},message:"must NOT have more than 2 items"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
if(data26.length < 2){
const err72 = {instancePath:instancePath+"/constraints/" + i0+"/objects",schemaPath:"#/$defs/PerpendicularConstraint/properties/objects/minItems",keyword:"minItems",params:{limit: 2},message:"must NOT have fewer than 2 items"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
const len4 = data26.length;
if(len4 > 0){
if(typeof data26[0] !== "string"){
const err73 = {instancePath:instancePath+"/constraints/" + i0+"/objects/0",schemaPath:"#/$defs/PerpendicularConstraint/properties/objects/prefixItems/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
if(len4 > 1){
if(typeof data26[1] !== "string"){
const err74 = {instancePath:instancePath+"/constraints/" + i0+"/objects/1",schemaPath:"#/$defs/PerpendicularConstraint/properties/objects/prefixItems/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
}
else {
const err75 = {instancePath:instancePath+"/constraints/" + i0+"/objects",schemaPath:"#/$defs/PerpendicularConstraint/properties/objects/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
}
if(data1.reason !== undefined){
let data29 = data1.reason;
const _errs97 = errors;
let valid23 = false;
const _errs98 = errors;
if(typeof data29 !== "string"){
const err76 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/PerpendicularConstraint/properties/reason/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
var _valid5 = _errs98 === errors;
valid23 = valid23 || _valid5;
const _errs100 = errors;
if(data29 !== null){
const err77 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/PerpendicularConstraint/properties/reason/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
var _valid5 = _errs100 === errors;
valid23 = valid23 || _valid5;
if(!valid23){
const err78 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/PerpendicularConstraint/properties/reason/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
else {
errors = _errs97;
if(vErrors !== null){
if(_errs97){
vErrors.length = _errs97;
}
else {
vErrors = null;
}
}
}
}
if(data1.type !== undefined){
let data30 = data1.type;
if(typeof data30 !== "string"){
const err79 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/PerpendicularConstraint/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
if("perpendicular" !== data30){
const err80 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/PerpendicularConstraint/properties/type/const",keyword:"const",params:{allowedValue: "perpendicular"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
}
}
else {
const err81 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/PerpendicularConstraint/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
var _valid0 = _errs84 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid3 = true;
passing0 = 4;
if(props0 !== true){
props0 = true;
}
}
const _errs104 = errors;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.id === undefined){
const err82 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/EqualLengthConstraint/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
if(data1.type === undefined){
const err83 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/EqualLengthConstraint/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
if(data1.objects === undefined){
const err84 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/EqualLengthConstraint/required",keyword:"required",params:{missingProperty: "objects"},message:"must have required property '"+"objects"+"'"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
for(const key6 in data1){
if(!((((key6 === "id") || (key6 === "objects")) || (key6 === "reason")) || (key6 === "type"))){
const err85 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/EqualLengthConstraint/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
}
if(data1.id !== undefined){
if(typeof data1.id !== "string"){
const err86 = {instancePath:instancePath+"/constraints/" + i0+"/id",schemaPath:"#/$defs/EqualLengthConstraint/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
}
if(data1.objects !== undefined){
let data32 = data1.objects;
if(Array.isArray(data32)){
if(data32.length > 2){
const err87 = {instancePath:instancePath+"/constraints/" + i0+"/objects",schemaPath:"#/$defs/EqualLengthConstraint/properties/objects/maxItems",keyword:"maxItems",params:{limit: 2},message:"must NOT have more than 2 items"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
if(data32.length < 2){
const err88 = {instancePath:instancePath+"/constraints/" + i0+"/objects",schemaPath:"#/$defs/EqualLengthConstraint/properties/objects/minItems",keyword:"minItems",params:{limit: 2},message:"must NOT have fewer than 2 items"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
const len5 = data32.length;
if(len5 > 0){
if(typeof data32[0] !== "string"){
const err89 = {instancePath:instancePath+"/constraints/" + i0+"/objects/0",schemaPath:"#/$defs/EqualLengthConstraint/properties/objects/prefixItems/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
if(len5 > 1){
if(typeof data32[1] !== "string"){
const err90 = {instancePath:instancePath+"/constraints/" + i0+"/objects/1",schemaPath:"#/$defs/EqualLengthConstraint/properties/objects/prefixItems/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
}
}
else {
const err91 = {instancePath:instancePath+"/constraints/" + i0+"/objects",schemaPath:"#/$defs/EqualLengthConstraint/properties/objects/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
}
if(data1.reason !== undefined){
let data35 = data1.reason;
const _errs117 = errors;
let valid27 = false;
const _errs118 = errors;
if(typeof data35 !== "string"){
const err92 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/EqualLengthConstraint/properties/reason/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
var _valid6 = _errs118 === errors;
valid27 = valid27 || _valid6;
const _errs120 = errors;
if(data35 !== null){
const err93 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/EqualLengthConstraint/properties/reason/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
var _valid6 = _errs120 === errors;
valid27 = valid27 || _valid6;
if(!valid27){
const err94 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/EqualLengthConstraint/properties/reason/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
else {
errors = _errs117;
if(vErrors !== null){
if(_errs117){
vErrors.length = _errs117;
}
else {
vErrors = null;
}
}
}
}
if(data1.type !== undefined){
let data36 = data1.type;
if(typeof data36 !== "string"){
const err95 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/EqualLengthConstraint/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
if("equal_length" !== data36){
const err96 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/EqualLengthConstraint/properties/type/const",keyword:"const",params:{allowedValue: "equal_length"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
}
}
else {
const err97 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/EqualLengthConstraint/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
var _valid0 = _errs104 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 5];
}
else {
if(_valid0){
valid3 = true;
passing0 = 5;
if(props0 !== true){
props0 = true;
}
}
const _errs124 = errors;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.id === undefined){
const err98 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/MidpointConstraint/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
if(data1.type === undefined){
const err99 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/MidpointConstraint/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
if(data1.point === undefined){
const err100 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/MidpointConstraint/required",keyword:"required",params:{missingProperty: "point"},message:"must have required property '"+"point"+"'"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
if(data1.object === undefined){
const err101 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/MidpointConstraint/required",keyword:"required",params:{missingProperty: "object"},message:"must have required property '"+"object"+"'"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
for(const key7 in data1){
if(!(((((key7 === "id") || (key7 === "object")) || (key7 === "point")) || (key7 === "reason")) || (key7 === "type"))){
const err102 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/MidpointConstraint/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key7},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
}
if(data1.id !== undefined){
if(typeof data1.id !== "string"){
const err103 = {instancePath:instancePath+"/constraints/" + i0+"/id",schemaPath:"#/$defs/MidpointConstraint/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
}
if(data1.object !== undefined){
if(typeof data1.object !== "string"){
const err104 = {instancePath:instancePath+"/constraints/" + i0+"/object",schemaPath:"#/$defs/MidpointConstraint/properties/object/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
}
if(data1.point !== undefined){
if(typeof data1.point !== "string"){
const err105 = {instancePath:instancePath+"/constraints/" + i0+"/point",schemaPath:"#/$defs/MidpointConstraint/properties/point/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
}
if(data1.reason !== undefined){
let data40 = data1.reason;
const _errs135 = errors;
let valid30 = false;
const _errs136 = errors;
if(typeof data40 !== "string"){
const err106 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/MidpointConstraint/properties/reason/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
var _valid7 = _errs136 === errors;
valid30 = valid30 || _valid7;
const _errs138 = errors;
if(data40 !== null){
const err107 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/MidpointConstraint/properties/reason/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
var _valid7 = _errs138 === errors;
valid30 = valid30 || _valid7;
if(!valid30){
const err108 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/MidpointConstraint/properties/reason/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
else {
errors = _errs135;
if(vErrors !== null){
if(_errs135){
vErrors.length = _errs135;
}
else {
vErrors = null;
}
}
}
}
if(data1.type !== undefined){
let data41 = data1.type;
if(typeof data41 !== "string"){
const err109 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/MidpointConstraint/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
if("midpoint" !== data41){
const err110 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/MidpointConstraint/properties/type/const",keyword:"const",params:{allowedValue: "midpoint"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
}
}
else {
const err111 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/MidpointConstraint/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
var _valid0 = _errs124 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 6];
}
else {
if(_valid0){
valid3 = true;
passing0 = 6;
if(props0 !== true){
props0 = true;
}
}
const _errs142 = errors;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.id === undefined){
const err112 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/IntersectionConstraint/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
if(data1.type === undefined){
const err113 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/IntersectionConstraint/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
}
if(data1.point === undefined){
const err114 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/IntersectionConstraint/required",keyword:"required",params:{missingProperty: "point"},message:"must have required property '"+"point"+"'"};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
if(data1.objects === undefined){
const err115 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/IntersectionConstraint/required",keyword:"required",params:{missingProperty: "objects"},message:"must have required property '"+"objects"+"'"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
for(const key8 in data1){
if(!(((((key8 === "id") || (key8 === "objects")) || (key8 === "point")) || (key8 === "reason")) || (key8 === "type"))){
const err116 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/IntersectionConstraint/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key8},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
}
}
if(data1.id !== undefined){
if(typeof data1.id !== "string"){
const err117 = {instancePath:instancePath+"/constraints/" + i0+"/id",schemaPath:"#/$defs/IntersectionConstraint/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
}
if(data1.objects !== undefined){
let data43 = data1.objects;
if(Array.isArray(data43)){
if(data43.length > 2){
const err118 = {instancePath:instancePath+"/constraints/" + i0+"/objects",schemaPath:"#/$defs/IntersectionConstraint/properties/objects/maxItems",keyword:"maxItems",params:{limit: 2},message:"must NOT have more than 2 items"};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
if(data43.length < 2){
const err119 = {instancePath:instancePath+"/constraints/" + i0+"/objects",schemaPath:"#/$defs/IntersectionConstraint/properties/objects/minItems",keyword:"minItems",params:{limit: 2},message:"must NOT have fewer than 2 items"};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
const len6 = data43.length;
if(len6 > 0){
if(typeof data43[0] !== "string"){
const err120 = {instancePath:instancePath+"/constraints/" + i0+"/objects/0",schemaPath:"#/$defs/IntersectionConstraint/properties/objects/prefixItems/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
}
if(len6 > 1){
if(typeof data43[1] !== "string"){
const err121 = {instancePath:instancePath+"/constraints/" + i0+"/objects/1",schemaPath:"#/$defs/IntersectionConstraint/properties/objects/prefixItems/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
}
}
}
else {
const err122 = {instancePath:instancePath+"/constraints/" + i0+"/objects",schemaPath:"#/$defs/IntersectionConstraint/properties/objects/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
}
if(data1.point !== undefined){
if(typeof data1.point !== "string"){
const err123 = {instancePath:instancePath+"/constraints/" + i0+"/point",schemaPath:"#/$defs/IntersectionConstraint/properties/point/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
}
if(data1.reason !== undefined){
let data47 = data1.reason;
const _errs157 = errors;
let valid34 = false;
const _errs158 = errors;
if(typeof data47 !== "string"){
const err124 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/IntersectionConstraint/properties/reason/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
}
var _valid8 = _errs158 === errors;
valid34 = valid34 || _valid8;
const _errs160 = errors;
if(data47 !== null){
const err125 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/IntersectionConstraint/properties/reason/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
var _valid8 = _errs160 === errors;
valid34 = valid34 || _valid8;
if(!valid34){
const err126 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/IntersectionConstraint/properties/reason/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
else {
errors = _errs157;
if(vErrors !== null){
if(_errs157){
vErrors.length = _errs157;
}
else {
vErrors = null;
}
}
}
}
if(data1.type !== undefined){
let data48 = data1.type;
if(typeof data48 !== "string"){
const err127 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/IntersectionConstraint/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
if("intersection" !== data48){
const err128 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/IntersectionConstraint/properties/type/const",keyword:"const",params:{allowedValue: "intersection"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
}
}
else {
const err129 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/IntersectionConstraint/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err129];
}
else {
vErrors.push(err129);
}
errors++;
}
var _valid0 = _errs142 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 7];
}
else {
if(_valid0){
valid3 = true;
passing0 = 7;
if(props0 !== true){
props0 = true;
}
}
const _errs164 = errors;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.id === undefined){
const err130 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/AltitudeConstraint/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
if(data1.type === undefined){
const err131 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/AltitudeConstraint/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err131];
}
else {
vErrors.push(err131);
}
errors++;
}
if(data1.from_point === undefined){
const err132 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/AltitudeConstraint/required",keyword:"required",params:{missingProperty: "from_point"},message:"must have required property '"+"from_point"+"'"};
if(vErrors === null){
vErrors = [err132];
}
else {
vErrors.push(err132);
}
errors++;
}
if(data1.to_object === undefined){
const err133 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/AltitudeConstraint/required",keyword:"required",params:{missingProperty: "to_object"},message:"must have required property '"+"to_object"+"'"};
if(vErrors === null){
vErrors = [err133];
}
else {
vErrors.push(err133);
}
errors++;
}
if(data1.foot === undefined){
const err134 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/AltitudeConstraint/required",keyword:"required",params:{missingProperty: "foot"},message:"must have required property '"+"foot"+"'"};
if(vErrors === null){
vErrors = [err134];
}
else {
vErrors.push(err134);
}
errors++;
}
if(data1.segment === undefined){
const err135 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/AltitudeConstraint/required",keyword:"required",params:{missingProperty: "segment"},message:"must have required property '"+"segment"+"'"};
if(vErrors === null){
vErrors = [err135];
}
else {
vErrors.push(err135);
}
errors++;
}
for(const key9 in data1){
if(!(((((((key9 === "foot") || (key9 === "from_point")) || (key9 === "id")) || (key9 === "reason")) || (key9 === "segment")) || (key9 === "to_object")) || (key9 === "type"))){
const err136 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/AltitudeConstraint/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key9},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err136];
}
else {
vErrors.push(err136);
}
errors++;
}
}
if(data1.foot !== undefined){
if(typeof data1.foot !== "string"){
const err137 = {instancePath:instancePath+"/constraints/" + i0+"/foot",schemaPath:"#/$defs/AltitudeConstraint/properties/foot/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err137];
}
else {
vErrors.push(err137);
}
errors++;
}
}
if(data1.from_point !== undefined){
if(typeof data1.from_point !== "string"){
const err138 = {instancePath:instancePath+"/constraints/" + i0+"/from_point",schemaPath:"#/$defs/AltitudeConstraint/properties/from_point/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err138];
}
else {
vErrors.push(err138);
}
errors++;
}
}
if(data1.id !== undefined){
if(typeof data1.id !== "string"){
const err139 = {instancePath:instancePath+"/constraints/" + i0+"/id",schemaPath:"#/$defs/AltitudeConstraint/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err139];
}
else {
vErrors.push(err139);
}
errors++;
}
}
if(data1.reason !== undefined){
let data52 = data1.reason;
const _errs175 = errors;
let valid37 = false;
const _errs176 = errors;
if(typeof data52 !== "string"){
const err140 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/AltitudeConstraint/properties/reason/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err140];
}
else {
vErrors.push(err140);
}
errors++;
}
var _valid9 = _errs176 === errors;
valid37 = valid37 || _valid9;
const _errs178 = errors;
if(data52 !== null){
const err141 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/AltitudeConstraint/properties/reason/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err141];
}
else {
vErrors.push(err141);
}
errors++;
}
var _valid9 = _errs178 === errors;
valid37 = valid37 || _valid9;
if(!valid37){
const err142 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/AltitudeConstraint/properties/reason/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err142];
}
else {
vErrors.push(err142);
}
errors++;
}
else {
errors = _errs175;
if(vErrors !== null){
if(_errs175){
vErrors.length = _errs175;
}
else {
vErrors = null;
}
}
}
}
if(data1.segment !== undefined){
if(typeof data1.segment !== "string"){
const err143 = {instancePath:instancePath+"/constraints/" + i0+"/segment",schemaPath:"#/$defs/AltitudeConstraint/properties/segment/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err143];
}
else {
vErrors.push(err143);
}
errors++;
}
}
if(data1.to_object !== undefined){
if(typeof data1.to_object !== "string"){
const err144 = {instancePath:instancePath+"/constraints/" + i0+"/to_object",schemaPath:"#/$defs/AltitudeConstraint/properties/to_object/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err144];
}
else {
vErrors.push(err144);
}
errors++;
}
}
if(data1.type !== undefined){
let data55 = data1.type;
if(typeof data55 !== "string"){
const err145 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/AltitudeConstraint/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err145];
}
else {
vErrors.push(err145);
}
errors++;
}
if("altitude" !== data55){
const err146 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/AltitudeConstraint/properties/type/const",keyword:"const",params:{allowedValue: "altitude"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err146];
}
else {
vErrors.push(err146);
}
errors++;
}
}
}
else {
const err147 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/AltitudeConstraint/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err147];
}
else {
vErrors.push(err147);
}
errors++;
}
var _valid0 = _errs164 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 8];
}
else {
if(_valid0){
valid3 = true;
passing0 = 8;
if(props0 !== true){
props0 = true;
}
}
const _errs186 = errors;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.id === undefined){
const err148 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/MedianConstraint/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err148];
}
else {
vErrors.push(err148);
}
errors++;
}
if(data1.type === undefined){
const err149 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/MedianConstraint/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err149];
}
else {
vErrors.push(err149);
}
errors++;
}
if(data1.from_point === undefined){
const err150 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/MedianConstraint/required",keyword:"required",params:{missingProperty: "from_point"},message:"must have required property '"+"from_point"+"'"};
if(vErrors === null){
vErrors = [err150];
}
else {
vErrors.push(err150);
}
errors++;
}
if(data1.to_object === undefined){
const err151 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/MedianConstraint/required",keyword:"required",params:{missingProperty: "to_object"},message:"must have required property '"+"to_object"+"'"};
if(vErrors === null){
vErrors = [err151];
}
else {
vErrors.push(err151);
}
errors++;
}
if(data1.midpoint === undefined){
const err152 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/MedianConstraint/required",keyword:"required",params:{missingProperty: "midpoint"},message:"must have required property '"+"midpoint"+"'"};
if(vErrors === null){
vErrors = [err152];
}
else {
vErrors.push(err152);
}
errors++;
}
if(data1.segment === undefined){
const err153 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/MedianConstraint/required",keyword:"required",params:{missingProperty: "segment"},message:"must have required property '"+"segment"+"'"};
if(vErrors === null){
vErrors = [err153];
}
else {
vErrors.push(err153);
}
errors++;
}
for(const key10 in data1){
if(!(((((((key10 === "from_point") || (key10 === "id")) || (key10 === "midpoint")) || (key10 === "reason")) || (key10 === "segment")) || (key10 === "to_object")) || (key10 === "type"))){
const err154 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/MedianConstraint/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key10},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err154];
}
else {
vErrors.push(err154);
}
errors++;
}
}
if(data1.from_point !== undefined){
if(typeof data1.from_point !== "string"){
const err155 = {instancePath:instancePath+"/constraints/" + i0+"/from_point",schemaPath:"#/$defs/MedianConstraint/properties/from_point/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err155];
}
else {
vErrors.push(err155);
}
errors++;
}
}
if(data1.id !== undefined){
if(typeof data1.id !== "string"){
const err156 = {instancePath:instancePath+"/constraints/" + i0+"/id",schemaPath:"#/$defs/MedianConstraint/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err156];
}
else {
vErrors.push(err156);
}
errors++;
}
}
if(data1.midpoint !== undefined){
if(typeof data1.midpoint !== "string"){
const err157 = {instancePath:instancePath+"/constraints/" + i0+"/midpoint",schemaPath:"#/$defs/MedianConstraint/properties/midpoint/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err157];
}
else {
vErrors.push(err157);
}
errors++;
}
}
if(data1.reason !== undefined){
let data59 = data1.reason;
const _errs197 = errors;
let valid40 = false;
const _errs198 = errors;
if(typeof data59 !== "string"){
const err158 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/MedianConstraint/properties/reason/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err158];
}
else {
vErrors.push(err158);
}
errors++;
}
var _valid10 = _errs198 === errors;
valid40 = valid40 || _valid10;
const _errs200 = errors;
if(data59 !== null){
const err159 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/MedianConstraint/properties/reason/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err159];
}
else {
vErrors.push(err159);
}
errors++;
}
var _valid10 = _errs200 === errors;
valid40 = valid40 || _valid10;
if(!valid40){
const err160 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/MedianConstraint/properties/reason/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err160];
}
else {
vErrors.push(err160);
}
errors++;
}
else {
errors = _errs197;
if(vErrors !== null){
if(_errs197){
vErrors.length = _errs197;
}
else {
vErrors = null;
}
}
}
}
if(data1.segment !== undefined){
if(typeof data1.segment !== "string"){
const err161 = {instancePath:instancePath+"/constraints/" + i0+"/segment",schemaPath:"#/$defs/MedianConstraint/properties/segment/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err161];
}
else {
vErrors.push(err161);
}
errors++;
}
}
if(data1.to_object !== undefined){
if(typeof data1.to_object !== "string"){
const err162 = {instancePath:instancePath+"/constraints/" + i0+"/to_object",schemaPath:"#/$defs/MedianConstraint/properties/to_object/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err162];
}
else {
vErrors.push(err162);
}
errors++;
}
}
if(data1.type !== undefined){
let data62 = data1.type;
if(typeof data62 !== "string"){
const err163 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/MedianConstraint/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err163];
}
else {
vErrors.push(err163);
}
errors++;
}
if("median" !== data62){
const err164 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/MedianConstraint/properties/type/const",keyword:"const",params:{allowedValue: "median"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err164];
}
else {
vErrors.push(err164);
}
errors++;
}
}
}
else {
const err165 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/MedianConstraint/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err165];
}
else {
vErrors.push(err165);
}
errors++;
}
var _valid0 = _errs186 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 9];
}
else {
if(_valid0){
valid3 = true;
passing0 = 9;
if(props0 !== true){
props0 = true;
}
}
const _errs208 = errors;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.id === undefined){
const err166 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/AngleBisectorConstraint/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err166];
}
else {
vErrors.push(err166);
}
errors++;
}
if(data1.type === undefined){
const err167 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/AngleBisectorConstraint/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err167];
}
else {
vErrors.push(err167);
}
errors++;
}
if(data1.angle === undefined){
const err168 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/AngleBisectorConstraint/required",keyword:"required",params:{missingProperty: "angle"},message:"must have required property '"+"angle"+"'"};
if(vErrors === null){
vErrors = [err168];
}
else {
vErrors.push(err168);
}
errors++;
}
if(data1.ray === undefined){
const err169 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/AngleBisectorConstraint/required",keyword:"required",params:{missingProperty: "ray"},message:"must have required property '"+"ray"+"'"};
if(vErrors === null){
vErrors = [err169];
}
else {
vErrors.push(err169);
}
errors++;
}
for(const key11 in data1){
if(!(((((key11 === "angle") || (key11 === "id")) || (key11 === "ray")) || (key11 === "reason")) || (key11 === "type"))){
const err170 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/AngleBisectorConstraint/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key11},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err170];
}
else {
vErrors.push(err170);
}
errors++;
}
}
if(data1.angle !== undefined){
if(typeof data1.angle !== "string"){
const err171 = {instancePath:instancePath+"/constraints/" + i0+"/angle",schemaPath:"#/$defs/AngleBisectorConstraint/properties/angle/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err171];
}
else {
vErrors.push(err171);
}
errors++;
}
}
if(data1.id !== undefined){
if(typeof data1.id !== "string"){
const err172 = {instancePath:instancePath+"/constraints/" + i0+"/id",schemaPath:"#/$defs/AngleBisectorConstraint/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err172];
}
else {
vErrors.push(err172);
}
errors++;
}
}
if(data1.ray !== undefined){
if(typeof data1.ray !== "string"){
const err173 = {instancePath:instancePath+"/constraints/" + i0+"/ray",schemaPath:"#/$defs/AngleBisectorConstraint/properties/ray/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err173];
}
else {
vErrors.push(err173);
}
errors++;
}
}
if(data1.reason !== undefined){
let data66 = data1.reason;
const _errs219 = errors;
let valid43 = false;
const _errs220 = errors;
if(typeof data66 !== "string"){
const err174 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/AngleBisectorConstraint/properties/reason/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err174];
}
else {
vErrors.push(err174);
}
errors++;
}
var _valid11 = _errs220 === errors;
valid43 = valid43 || _valid11;
const _errs222 = errors;
if(data66 !== null){
const err175 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/AngleBisectorConstraint/properties/reason/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err175];
}
else {
vErrors.push(err175);
}
errors++;
}
var _valid11 = _errs222 === errors;
valid43 = valid43 || _valid11;
if(!valid43){
const err176 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/AngleBisectorConstraint/properties/reason/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err176];
}
else {
vErrors.push(err176);
}
errors++;
}
else {
errors = _errs219;
if(vErrors !== null){
if(_errs219){
vErrors.length = _errs219;
}
else {
vErrors = null;
}
}
}
}
if(data1.type !== undefined){
let data67 = data1.type;
if(typeof data67 !== "string"){
const err177 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/AngleBisectorConstraint/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err177];
}
else {
vErrors.push(err177);
}
errors++;
}
if("angle_bisector" !== data67){
const err178 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/AngleBisectorConstraint/properties/type/const",keyword:"const",params:{allowedValue: "angle_bisector"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err178];
}
else {
vErrors.push(err178);
}
errors++;
}
}
}
else {
const err179 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/AngleBisectorConstraint/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err179];
}
else {
vErrors.push(err179);
}
errors++;
}
var _valid0 = _errs208 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 10];
}
else {
if(_valid0){
valid3 = true;
passing0 = 10;
if(props0 !== true){
props0 = true;
}
}
const _errs226 = errors;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.id === undefined){
const err180 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/CircumcircleConstraint/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err180];
}
else {
vErrors.push(err180);
}
errors++;
}
if(data1.type === undefined){
const err181 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/CircumcircleConstraint/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err181];
}
else {
vErrors.push(err181);
}
errors++;
}
if(data1.triangle === undefined){
const err182 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/CircumcircleConstraint/required",keyword:"required",params:{missingProperty: "triangle"},message:"must have required property '"+"triangle"+"'"};
if(vErrors === null){
vErrors = [err182];
}
else {
vErrors.push(err182);
}
errors++;
}
if(data1.circle === undefined){
const err183 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/CircumcircleConstraint/required",keyword:"required",params:{missingProperty: "circle"},message:"must have required property '"+"circle"+"'"};
if(vErrors === null){
vErrors = [err183];
}
else {
vErrors.push(err183);
}
errors++;
}
for(const key12 in data1){
if(!(((((key12 === "circle") || (key12 === "id")) || (key12 === "reason")) || (key12 === "triangle")) || (key12 === "type"))){
const err184 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/CircumcircleConstraint/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key12},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err184];
}
else {
vErrors.push(err184);
}
errors++;
}
}
if(data1.circle !== undefined){
if(typeof data1.circle !== "string"){
const err185 = {instancePath:instancePath+"/constraints/" + i0+"/circle",schemaPath:"#/$defs/CircumcircleConstraint/properties/circle/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err185];
}
else {
vErrors.push(err185);
}
errors++;
}
}
if(data1.id !== undefined){
if(typeof data1.id !== "string"){
const err186 = {instancePath:instancePath+"/constraints/" + i0+"/id",schemaPath:"#/$defs/CircumcircleConstraint/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err186];
}
else {
vErrors.push(err186);
}
errors++;
}
}
if(data1.reason !== undefined){
let data70 = data1.reason;
const _errs235 = errors;
let valid46 = false;
const _errs236 = errors;
if(typeof data70 !== "string"){
const err187 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/CircumcircleConstraint/properties/reason/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err187];
}
else {
vErrors.push(err187);
}
errors++;
}
var _valid12 = _errs236 === errors;
valid46 = valid46 || _valid12;
const _errs238 = errors;
if(data70 !== null){
const err188 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/CircumcircleConstraint/properties/reason/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err188];
}
else {
vErrors.push(err188);
}
errors++;
}
var _valid12 = _errs238 === errors;
valid46 = valid46 || _valid12;
if(!valid46){
const err189 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/CircumcircleConstraint/properties/reason/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err189];
}
else {
vErrors.push(err189);
}
errors++;
}
else {
errors = _errs235;
if(vErrors !== null){
if(_errs235){
vErrors.length = _errs235;
}
else {
vErrors = null;
}
}
}
}
if(data1.triangle !== undefined){
if(typeof data1.triangle !== "string"){
const err190 = {instancePath:instancePath+"/constraints/" + i0+"/triangle",schemaPath:"#/$defs/CircumcircleConstraint/properties/triangle/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err190];
}
else {
vErrors.push(err190);
}
errors++;
}
}
if(data1.type !== undefined){
let data72 = data1.type;
if(typeof data72 !== "string"){
const err191 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/CircumcircleConstraint/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err191];
}
else {
vErrors.push(err191);
}
errors++;
}
if("circumcircle" !== data72){
const err192 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/CircumcircleConstraint/properties/type/const",keyword:"const",params:{allowedValue: "circumcircle"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err192];
}
else {
vErrors.push(err192);
}
errors++;
}
}
}
else {
const err193 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/CircumcircleConstraint/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err193];
}
else {
vErrors.push(err193);
}
errors++;
}
var _valid0 = _errs226 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 11];
}
else {
if(_valid0){
valid3 = true;
passing0 = 11;
if(props0 !== true){
props0 = true;
}
}
const _errs244 = errors;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.id === undefined){
const err194 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/IncircleConstraint/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err194];
}
else {
vErrors.push(err194);
}
errors++;
}
if(data1.type === undefined){
const err195 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/IncircleConstraint/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err195];
}
else {
vErrors.push(err195);
}
errors++;
}
if(data1.triangle === undefined){
const err196 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/IncircleConstraint/required",keyword:"required",params:{missingProperty: "triangle"},message:"must have required property '"+"triangle"+"'"};
if(vErrors === null){
vErrors = [err196];
}
else {
vErrors.push(err196);
}
errors++;
}
if(data1.circle === undefined){
const err197 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/IncircleConstraint/required",keyword:"required",params:{missingProperty: "circle"},message:"must have required property '"+"circle"+"'"};
if(vErrors === null){
vErrors = [err197];
}
else {
vErrors.push(err197);
}
errors++;
}
for(const key13 in data1){
if(!(((((key13 === "circle") || (key13 === "id")) || (key13 === "reason")) || (key13 === "triangle")) || (key13 === "type"))){
const err198 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/IncircleConstraint/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key13},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err198];
}
else {
vErrors.push(err198);
}
errors++;
}
}
if(data1.circle !== undefined){
if(typeof data1.circle !== "string"){
const err199 = {instancePath:instancePath+"/constraints/" + i0+"/circle",schemaPath:"#/$defs/IncircleConstraint/properties/circle/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err199];
}
else {
vErrors.push(err199);
}
errors++;
}
}
if(data1.id !== undefined){
if(typeof data1.id !== "string"){
const err200 = {instancePath:instancePath+"/constraints/" + i0+"/id",schemaPath:"#/$defs/IncircleConstraint/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err200];
}
else {
vErrors.push(err200);
}
errors++;
}
}
if(data1.reason !== undefined){
let data75 = data1.reason;
const _errs253 = errors;
let valid49 = false;
const _errs254 = errors;
if(typeof data75 !== "string"){
const err201 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/IncircleConstraint/properties/reason/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err201];
}
else {
vErrors.push(err201);
}
errors++;
}
var _valid13 = _errs254 === errors;
valid49 = valid49 || _valid13;
const _errs256 = errors;
if(data75 !== null){
const err202 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/IncircleConstraint/properties/reason/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err202];
}
else {
vErrors.push(err202);
}
errors++;
}
var _valid13 = _errs256 === errors;
valid49 = valid49 || _valid13;
if(!valid49){
const err203 = {instancePath:instancePath+"/constraints/" + i0+"/reason",schemaPath:"#/$defs/IncircleConstraint/properties/reason/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err203];
}
else {
vErrors.push(err203);
}
errors++;
}
else {
errors = _errs253;
if(vErrors !== null){
if(_errs253){
vErrors.length = _errs253;
}
else {
vErrors = null;
}
}
}
}
if(data1.triangle !== undefined){
if(typeof data1.triangle !== "string"){
const err204 = {instancePath:instancePath+"/constraints/" + i0+"/triangle",schemaPath:"#/$defs/IncircleConstraint/properties/triangle/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err204];
}
else {
vErrors.push(err204);
}
errors++;
}
}
if(data1.type !== undefined){
let data77 = data1.type;
if(typeof data77 !== "string"){
const err205 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/IncircleConstraint/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err205];
}
else {
vErrors.push(err205);
}
errors++;
}
if("incircle" !== data77){
const err206 = {instancePath:instancePath+"/constraints/" + i0+"/type",schemaPath:"#/$defs/IncircleConstraint/properties/type/const",keyword:"const",params:{allowedValue: "incircle"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err206];
}
else {
vErrors.push(err206);
}
errors++;
}
}
}
else {
const err207 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/$defs/IncircleConstraint/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err207];
}
else {
vErrors.push(err207);
}
errors++;
}
var _valid0 = _errs244 === errors;
if(_valid0 && valid3){
valid3 = false;
passing0 = [passing0, 12];
}
else {
if(_valid0){
valid3 = true;
passing0 = 12;
if(props0 !== true){
props0 = true;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
if(!valid3){
const err208 = {instancePath:instancePath+"/constraints/" + i0,schemaPath:"#/properties/constraints/items/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err208];
}
else {
vErrors.push(err208);
}
errors++;
}
else {
errors = _errs5;
if(vErrors !== null){
if(_errs5){
vErrors.length = _errs5;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err209 = {instancePath:instancePath+"/constraints",schemaPath:"#/properties/constraints/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err209];
}
else {
vErrors.push(err209);
}
errors++;
}
}
if(data.construction_steps !== undefined){
let data78 = data.construction_steps;
if(Array.isArray(data78)){
const len7 = data78.length;
for(let i2=0; i2<len7; i2++){
let data79 = data78[i2];
if(data79 && typeof data79 == "object" && !Array.isArray(data79)){
if(data79.id === undefined){
const err210 = {instancePath:instancePath+"/construction_steps/" + i2,schemaPath:"#/$defs/ConstructionStep/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err210];
}
else {
vErrors.push(err210);
}
errors++;
}
if(data79.action === undefined){
const err211 = {instancePath:instancePath+"/construction_steps/" + i2,schemaPath:"#/$defs/ConstructionStep/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err211];
}
else {
vErrors.push(err211);
}
errors++;
}
if(data79.objects === undefined){
const err212 = {instancePath:instancePath+"/construction_steps/" + i2,schemaPath:"#/$defs/ConstructionStep/required",keyword:"required",params:{missingProperty: "objects"},message:"must have required property '"+"objects"+"'"};
if(vErrors === null){
vErrors = [err212];
}
else {
vErrors.push(err212);
}
errors++;
}
for(const key14 in data79){
if(!(((((key14 === "action") || (key14 === "constraints")) || (key14 === "id")) || (key14 === "objects")) || (key14 === "reason"))){
const err213 = {instancePath:instancePath+"/construction_steps/" + i2,schemaPath:"#/$defs/ConstructionStep/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key14},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err213];
}
else {
vErrors.push(err213);
}
errors++;
}
}
if(data79.action !== undefined){
if(typeof data79.action !== "string"){
const err214 = {instancePath:instancePath+"/construction_steps/" + i2+"/action",schemaPath:"#/$defs/ConstructionStep/properties/action/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err214];
}
else {
vErrors.push(err214);
}
errors++;
}
}
if(data79.constraints !== undefined){
let data81 = data79.constraints;
if(Array.isArray(data81)){
const len8 = data81.length;
for(let i3=0; i3<len8; i3++){
if(typeof data81[i3] !== "string"){
const err215 = {instancePath:instancePath+"/construction_steps/" + i2+"/constraints/" + i3,schemaPath:"#/$defs/ConstructionStep/properties/constraints/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err215];
}
else {
vErrors.push(err215);
}
errors++;
}
}
}
else {
const err216 = {instancePath:instancePath+"/construction_steps/" + i2+"/constraints",schemaPath:"#/$defs/ConstructionStep/properties/constraints/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err216];
}
else {
vErrors.push(err216);
}
errors++;
}
}
if(data79.id !== undefined){
if(typeof data79.id !== "string"){
const err217 = {instancePath:instancePath+"/construction_steps/" + i2+"/id",schemaPath:"#/$defs/ConstructionStep/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err217];
}
else {
vErrors.push(err217);
}
errors++;
}
}
if(data79.objects !== undefined){
let data84 = data79.objects;
if(Array.isArray(data84)){
const len9 = data84.length;
for(let i4=0; i4<len9; i4++){
if(typeof data84[i4] !== "string"){
const err218 = {instancePath:instancePath+"/construction_steps/" + i2+"/objects/" + i4,schemaPath:"#/$defs/ConstructionStep/properties/objects/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err218];
}
else {
vErrors.push(err218);
}
errors++;
}
}
}
else {
const err219 = {instancePath:instancePath+"/construction_steps/" + i2+"/objects",schemaPath:"#/$defs/ConstructionStep/properties/objects/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err219];
}
else {
vErrors.push(err219);
}
errors++;
}
}
if(data79.reason !== undefined){
let data86 = data79.reason;
const _errs281 = errors;
let valid58 = false;
const _errs282 = errors;
if(typeof data86 !== "string"){
const err220 = {instancePath:instancePath+"/construction_steps/" + i2+"/reason",schemaPath:"#/$defs/ConstructionStep/properties/reason/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err220];
}
else {
vErrors.push(err220);
}
errors++;
}
var _valid14 = _errs282 === errors;
valid58 = valid58 || _valid14;
const _errs284 = errors;
if(data86 !== null){
const err221 = {instancePath:instancePath+"/construction_steps/" + i2+"/reason",schemaPath:"#/$defs/ConstructionStep/properties/reason/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err221];
}
else {
vErrors.push(err221);
}
errors++;
}
var _valid14 = _errs284 === errors;
valid58 = valid58 || _valid14;
if(!valid58){
const err222 = {instancePath:instancePath+"/construction_steps/" + i2+"/reason",schemaPath:"#/$defs/ConstructionStep/properties/reason/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err222];
}
else {
vErrors.push(err222);
}
errors++;
}
else {
errors = _errs281;
if(vErrors !== null){
if(_errs281){
vErrors.length = _errs281;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err223 = {instancePath:instancePath+"/construction_steps/" + i2,schemaPath:"#/$defs/ConstructionStep/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err223];
}
else {
vErrors.push(err223);
}
errors++;
}
}
}
else {
const err224 = {instancePath:instancePath+"/construction_steps",schemaPath:"#/properties/construction_steps/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err224];
}
else {
vErrors.push(err224);
}
errors++;
}
}
if(data.metadata !== undefined){
let data87 = data.metadata;
if(data87 && typeof data87 == "object" && !Array.isArray(data87)){
}
else {
const err225 = {instancePath:instancePath+"/metadata",schemaPath:"#/properties/metadata/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err225];
}
else {
vErrors.push(err225);
}
errors++;
}
}
if(data.objects !== undefined){
let data88 = data.objects;
if(Array.isArray(data88)){
const len10 = data88.length;
for(let i5=0; i5<len10; i5++){
let data89 = data88[i5];
const _errs292 = errors;
let valid61 = false;
let passing1 = null;
const _errs293 = errors;
if(data89 && typeof data89 == "object" && !Array.isArray(data89)){
if(data89.id === undefined){
const err226 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/PointObject/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err226];
}
else {
vErrors.push(err226);
}
errors++;
}
if(data89.type === undefined){
const err227 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/PointObject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err227];
}
else {
vErrors.push(err227);
}
errors++;
}
for(const key15 in data89){
if(!(((key15 === "id") || (key15 === "label")) || (key15 === "type"))){
const err228 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/PointObject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key15},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err228];
}
else {
vErrors.push(err228);
}
errors++;
}
}
if(data89.id !== undefined){
if(typeof data89.id !== "string"){
const err229 = {instancePath:instancePath+"/objects/" + i5+"/id",schemaPath:"#/$defs/PointObject/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err229];
}
else {
vErrors.push(err229);
}
errors++;
}
}
if(data89.label !== undefined){
let data91 = data89.label;
const _errs300 = errors;
let valid64 = false;
const _errs301 = errors;
if(typeof data91 !== "string"){
const err230 = {instancePath:instancePath+"/objects/" + i5+"/label",schemaPath:"#/$defs/PointObject/properties/label/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err230];
}
else {
vErrors.push(err230);
}
errors++;
}
var _valid16 = _errs301 === errors;
valid64 = valid64 || _valid16;
const _errs303 = errors;
if(data91 !== null){
const err231 = {instancePath:instancePath+"/objects/" + i5+"/label",schemaPath:"#/$defs/PointObject/properties/label/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err231];
}
else {
vErrors.push(err231);
}
errors++;
}
var _valid16 = _errs303 === errors;
valid64 = valid64 || _valid16;
if(!valid64){
const err232 = {instancePath:instancePath+"/objects/" + i5+"/label",schemaPath:"#/$defs/PointObject/properties/label/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err232];
}
else {
vErrors.push(err232);
}
errors++;
}
else {
errors = _errs300;
if(vErrors !== null){
if(_errs300){
vErrors.length = _errs300;
}
else {
vErrors = null;
}
}
}
}
if(data89.type !== undefined){
let data92 = data89.type;
if(typeof data92 !== "string"){
const err233 = {instancePath:instancePath+"/objects/" + i5+"/type",schemaPath:"#/$defs/PointObject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err233];
}
else {
vErrors.push(err233);
}
errors++;
}
if("point" !== data92){
const err234 = {instancePath:instancePath+"/objects/" + i5+"/type",schemaPath:"#/$defs/PointObject/properties/type/const",keyword:"const",params:{allowedValue: "point"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err234];
}
else {
vErrors.push(err234);
}
errors++;
}
}
}
else {
const err235 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/PointObject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err235];
}
else {
vErrors.push(err235);
}
errors++;
}
var _valid15 = _errs293 === errors;
if(_valid15){
valid61 = true;
passing1 = 0;
var props1 = true;
}
const _errs307 = errors;
if(data89 && typeof data89 == "object" && !Array.isArray(data89)){
if(data89.id === undefined){
const err236 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/SegmentObject/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err236];
}
else {
vErrors.push(err236);
}
errors++;
}
if(data89.type === undefined){
const err237 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/SegmentObject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err237];
}
else {
vErrors.push(err237);
}
errors++;
}
if(data89.points === undefined){
const err238 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/SegmentObject/required",keyword:"required",params:{missingProperty: "points"},message:"must have required property '"+"points"+"'"};
if(vErrors === null){
vErrors = [err238];
}
else {
vErrors.push(err238);
}
errors++;
}
for(const key16 in data89){
if(!(((key16 === "id") || (key16 === "points")) || (key16 === "type"))){
const err239 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/SegmentObject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key16},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err239];
}
else {
vErrors.push(err239);
}
errors++;
}
}
if(data89.id !== undefined){
if(typeof data89.id !== "string"){
const err240 = {instancePath:instancePath+"/objects/" + i5+"/id",schemaPath:"#/$defs/SegmentObject/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err240];
}
else {
vErrors.push(err240);
}
errors++;
}
}
if(data89.points !== undefined){
let data94 = data89.points;
if(Array.isArray(data94)){
if(data94.length > 2){
const err241 = {instancePath:instancePath+"/objects/" + i5+"/points",schemaPath:"#/$defs/SegmentObject/properties/points/maxItems",keyword:"maxItems",params:{limit: 2},message:"must NOT have more than 2 items"};
if(vErrors === null){
vErrors = [err241];
}
else {
vErrors.push(err241);
}
errors++;
}
if(data94.length < 2){
const err242 = {instancePath:instancePath+"/objects/" + i5+"/points",schemaPath:"#/$defs/SegmentObject/properties/points/minItems",keyword:"minItems",params:{limit: 2},message:"must NOT have fewer than 2 items"};
if(vErrors === null){
vErrors = [err242];
}
else {
vErrors.push(err242);
}
errors++;
}
const len11 = data94.length;
if(len11 > 0){
if(typeof data94[0] !== "string"){
const err243 = {instancePath:instancePath+"/objects/" + i5+"/points/0",schemaPath:"#/$defs/SegmentObject/properties/points/prefixItems/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err243];
}
else {
vErrors.push(err243);
}
errors++;
}
}
if(len11 > 1){
if(typeof data94[1] !== "string"){
const err244 = {instancePath:instancePath+"/objects/" + i5+"/points/1",schemaPath:"#/$defs/SegmentObject/properties/points/prefixItems/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err244];
}
else {
vErrors.push(err244);
}
errors++;
}
}
}
else {
const err245 = {instancePath:instancePath+"/objects/" + i5+"/points",schemaPath:"#/$defs/SegmentObject/properties/points/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err245];
}
else {
vErrors.push(err245);
}
errors++;
}
}
if(data89.type !== undefined){
let data97 = data89.type;
if(typeof data97 !== "string"){
const err246 = {instancePath:instancePath+"/objects/" + i5+"/type",schemaPath:"#/$defs/SegmentObject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err246];
}
else {
vErrors.push(err246);
}
errors++;
}
if("segment" !== data97){
const err247 = {instancePath:instancePath+"/objects/" + i5+"/type",schemaPath:"#/$defs/SegmentObject/properties/type/const",keyword:"const",params:{allowedValue: "segment"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err247];
}
else {
vErrors.push(err247);
}
errors++;
}
}
}
else {
const err248 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/SegmentObject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err248];
}
else {
vErrors.push(err248);
}
errors++;
}
var _valid15 = _errs307 === errors;
if(_valid15 && valid61){
valid61 = false;
passing1 = [passing1, 1];
}
else {
if(_valid15){
valid61 = true;
passing1 = 1;
if(props1 !== true){
props1 = true;
}
}
const _errs321 = errors;
if(data89 && typeof data89 == "object" && !Array.isArray(data89)){
if(data89.id === undefined){
const err249 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/LineObject/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err249];
}
else {
vErrors.push(err249);
}
errors++;
}
if(data89.type === undefined){
const err250 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/LineObject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err250];
}
else {
vErrors.push(err250);
}
errors++;
}
if(data89.points === undefined){
const err251 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/LineObject/required",keyword:"required",params:{missingProperty: "points"},message:"must have required property '"+"points"+"'"};
if(vErrors === null){
vErrors = [err251];
}
else {
vErrors.push(err251);
}
errors++;
}
for(const key17 in data89){
if(!(((key17 === "id") || (key17 === "points")) || (key17 === "type"))){
const err252 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/LineObject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key17},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err252];
}
else {
vErrors.push(err252);
}
errors++;
}
}
if(data89.id !== undefined){
if(typeof data89.id !== "string"){
const err253 = {instancePath:instancePath+"/objects/" + i5+"/id",schemaPath:"#/$defs/LineObject/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err253];
}
else {
vErrors.push(err253);
}
errors++;
}
}
if(data89.points !== undefined){
let data99 = data89.points;
if(Array.isArray(data99)){
if(data99.length > 2){
const err254 = {instancePath:instancePath+"/objects/" + i5+"/points",schemaPath:"#/$defs/LineObject/properties/points/maxItems",keyword:"maxItems",params:{limit: 2},message:"must NOT have more than 2 items"};
if(vErrors === null){
vErrors = [err254];
}
else {
vErrors.push(err254);
}
errors++;
}
if(data99.length < 2){
const err255 = {instancePath:instancePath+"/objects/" + i5+"/points",schemaPath:"#/$defs/LineObject/properties/points/minItems",keyword:"minItems",params:{limit: 2},message:"must NOT have fewer than 2 items"};
if(vErrors === null){
vErrors = [err255];
}
else {
vErrors.push(err255);
}
errors++;
}
const len12 = data99.length;
if(len12 > 0){
if(typeof data99[0] !== "string"){
const err256 = {instancePath:instancePath+"/objects/" + i5+"/points/0",schemaPath:"#/$defs/LineObject/properties/points/prefixItems/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err256];
}
else {
vErrors.push(err256);
}
errors++;
}
}
if(len12 > 1){
if(typeof data99[1] !== "string"){
const err257 = {instancePath:instancePath+"/objects/" + i5+"/points/1",schemaPath:"#/$defs/LineObject/properties/points/prefixItems/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err257];
}
else {
vErrors.push(err257);
}
errors++;
}
}
}
else {
const err258 = {instancePath:instancePath+"/objects/" + i5+"/points",schemaPath:"#/$defs/LineObject/properties/points/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err258];
}
else {
vErrors.push(err258);
}
errors++;
}
}
if(data89.type !== undefined){
let data102 = data89.type;
if(typeof data102 !== "string"){
const err259 = {instancePath:instancePath+"/objects/" + i5+"/type",schemaPath:"#/$defs/LineObject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err259];
}
else {
vErrors.push(err259);
}
errors++;
}
if("line" !== data102){
const err260 = {instancePath:instancePath+"/objects/" + i5+"/type",schemaPath:"#/$defs/LineObject/properties/type/const",keyword:"const",params:{allowedValue: "line"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err260];
}
else {
vErrors.push(err260);
}
errors++;
}
}
}
else {
const err261 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/LineObject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err261];
}
else {
vErrors.push(err261);
}
errors++;
}
var _valid15 = _errs321 === errors;
if(_valid15 && valid61){
valid61 = false;
passing1 = [passing1, 2];
}
else {
if(_valid15){
valid61 = true;
passing1 = 2;
if(props1 !== true){
props1 = true;
}
}
const _errs335 = errors;
if(data89 && typeof data89 == "object" && !Array.isArray(data89)){
if(data89.id === undefined){
const err262 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/RayObject/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err262];
}
else {
vErrors.push(err262);
}
errors++;
}
if(data89.type === undefined){
const err263 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/RayObject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err263];
}
else {
vErrors.push(err263);
}
errors++;
}
if(data89.start === undefined){
const err264 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/RayObject/required",keyword:"required",params:{missingProperty: "start"},message:"must have required property '"+"start"+"'"};
if(vErrors === null){
vErrors = [err264];
}
else {
vErrors.push(err264);
}
errors++;
}
if(data89.through === undefined){
const err265 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/RayObject/required",keyword:"required",params:{missingProperty: "through"},message:"must have required property '"+"through"+"'"};
if(vErrors === null){
vErrors = [err265];
}
else {
vErrors.push(err265);
}
errors++;
}
for(const key18 in data89){
if(!((((key18 === "id") || (key18 === "start")) || (key18 === "through")) || (key18 === "type"))){
const err266 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/RayObject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key18},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err266];
}
else {
vErrors.push(err266);
}
errors++;
}
}
if(data89.id !== undefined){
if(typeof data89.id !== "string"){
const err267 = {instancePath:instancePath+"/objects/" + i5+"/id",schemaPath:"#/$defs/RayObject/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err267];
}
else {
vErrors.push(err267);
}
errors++;
}
}
if(data89.start !== undefined){
if(typeof data89.start !== "string"){
const err268 = {instancePath:instancePath+"/objects/" + i5+"/start",schemaPath:"#/$defs/RayObject/properties/start/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err268];
}
else {
vErrors.push(err268);
}
errors++;
}
}
if(data89.through !== undefined){
if(typeof data89.through !== "string"){
const err269 = {instancePath:instancePath+"/objects/" + i5+"/through",schemaPath:"#/$defs/RayObject/properties/through/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err269];
}
else {
vErrors.push(err269);
}
errors++;
}
}
if(data89.type !== undefined){
let data106 = data89.type;
if(typeof data106 !== "string"){
const err270 = {instancePath:instancePath+"/objects/" + i5+"/type",schemaPath:"#/$defs/RayObject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err270];
}
else {
vErrors.push(err270);
}
errors++;
}
if("ray" !== data106){
const err271 = {instancePath:instancePath+"/objects/" + i5+"/type",schemaPath:"#/$defs/RayObject/properties/type/const",keyword:"const",params:{allowedValue: "ray"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err271];
}
else {
vErrors.push(err271);
}
errors++;
}
}
}
else {
const err272 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/RayObject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err272];
}
else {
vErrors.push(err272);
}
errors++;
}
var _valid15 = _errs335 === errors;
if(_valid15 && valid61){
valid61 = false;
passing1 = [passing1, 3];
}
else {
if(_valid15){
valid61 = true;
passing1 = 3;
if(props1 !== true){
props1 = true;
}
}
const _errs347 = errors;
if(data89 && typeof data89 == "object" && !Array.isArray(data89)){
if(data89.id === undefined){
const err273 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/CircleObject/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err273];
}
else {
vErrors.push(err273);
}
errors++;
}
if(data89.type === undefined){
const err274 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/CircleObject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err274];
}
else {
vErrors.push(err274);
}
errors++;
}
if(data89.center === undefined){
const err275 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/CircleObject/required",keyword:"required",params:{missingProperty: "center"},message:"must have required property '"+"center"+"'"};
if(vErrors === null){
vErrors = [err275];
}
else {
vErrors.push(err275);
}
errors++;
}
for(const key19 in data89){
if(!((((key19 === "center") || (key19 === "id")) || (key19 === "radius_point")) || (key19 === "type"))){
const err276 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/CircleObject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key19},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err276];
}
else {
vErrors.push(err276);
}
errors++;
}
}
if(data89.center !== undefined){
if(typeof data89.center !== "string"){
const err277 = {instancePath:instancePath+"/objects/" + i5+"/center",schemaPath:"#/$defs/CircleObject/properties/center/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err277];
}
else {
vErrors.push(err277);
}
errors++;
}
}
if(data89.id !== undefined){
if(typeof data89.id !== "string"){
const err278 = {instancePath:instancePath+"/objects/" + i5+"/id",schemaPath:"#/$defs/CircleObject/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err278];
}
else {
vErrors.push(err278);
}
errors++;
}
}
if(data89.radius_point !== undefined){
let data109 = data89.radius_point;
const _errs356 = errors;
let valid75 = false;
const _errs357 = errors;
if(typeof data109 !== "string"){
const err279 = {instancePath:instancePath+"/objects/" + i5+"/radius_point",schemaPath:"#/$defs/CircleObject/properties/radius_point/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err279];
}
else {
vErrors.push(err279);
}
errors++;
}
var _valid17 = _errs357 === errors;
valid75 = valid75 || _valid17;
const _errs359 = errors;
if(data109 !== null){
const err280 = {instancePath:instancePath+"/objects/" + i5+"/radius_point",schemaPath:"#/$defs/CircleObject/properties/radius_point/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err280];
}
else {
vErrors.push(err280);
}
errors++;
}
var _valid17 = _errs359 === errors;
valid75 = valid75 || _valid17;
if(!valid75){
const err281 = {instancePath:instancePath+"/objects/" + i5+"/radius_point",schemaPath:"#/$defs/CircleObject/properties/radius_point/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err281];
}
else {
vErrors.push(err281);
}
errors++;
}
else {
errors = _errs356;
if(vErrors !== null){
if(_errs356){
vErrors.length = _errs356;
}
else {
vErrors = null;
}
}
}
}
if(data89.type !== undefined){
let data110 = data89.type;
if(typeof data110 !== "string"){
const err282 = {instancePath:instancePath+"/objects/" + i5+"/type",schemaPath:"#/$defs/CircleObject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err282];
}
else {
vErrors.push(err282);
}
errors++;
}
if("circle" !== data110){
const err283 = {instancePath:instancePath+"/objects/" + i5+"/type",schemaPath:"#/$defs/CircleObject/properties/type/const",keyword:"const",params:{allowedValue: "circle"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err283];
}
else {
vErrors.push(err283);
}
errors++;
}
}
}
else {
const err284 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/CircleObject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err284];
}
else {
vErrors.push(err284);
}
errors++;
}
var _valid15 = _errs347 === errors;
if(_valid15 && valid61){
valid61 = false;
passing1 = [passing1, 4];
}
else {
if(_valid15){
valid61 = true;
passing1 = 4;
if(props1 !== true){
props1 = true;
}
}
const _errs363 = errors;
if(data89 && typeof data89 == "object" && !Array.isArray(data89)){
if(data89.id === undefined){
const err285 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/TriangleObject/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err285];
}
else {
vErrors.push(err285);
}
errors++;
}
if(data89.type === undefined){
const err286 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/TriangleObject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err286];
}
else {
vErrors.push(err286);
}
errors++;
}
if(data89.vertices === undefined){
const err287 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/TriangleObject/required",keyword:"required",params:{missingProperty: "vertices"},message:"must have required property '"+"vertices"+"'"};
if(vErrors === null){
vErrors = [err287];
}
else {
vErrors.push(err287);
}
errors++;
}
for(const key20 in data89){
if(!(((key20 === "id") || (key20 === "type")) || (key20 === "vertices"))){
const err288 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/TriangleObject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key20},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err288];
}
else {
vErrors.push(err288);
}
errors++;
}
}
if(data89.id !== undefined){
if(typeof data89.id !== "string"){
const err289 = {instancePath:instancePath+"/objects/" + i5+"/id",schemaPath:"#/$defs/TriangleObject/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err289];
}
else {
vErrors.push(err289);
}
errors++;
}
}
if(data89.type !== undefined){
let data112 = data89.type;
if(typeof data112 !== "string"){
const err290 = {instancePath:instancePath+"/objects/" + i5+"/type",schemaPath:"#/$defs/TriangleObject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err290];
}
else {
vErrors.push(err290);
}
errors++;
}
if("triangle" !== data112){
const err291 = {instancePath:instancePath+"/objects/" + i5+"/type",schemaPath:"#/$defs/TriangleObject/properties/type/const",keyword:"const",params:{allowedValue: "triangle"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err291];
}
else {
vErrors.push(err291);
}
errors++;
}
}
if(data89.vertices !== undefined){
let data113 = data89.vertices;
if(Array.isArray(data113)){
if(data113.length > 3){
const err292 = {instancePath:instancePath+"/objects/" + i5+"/vertices",schemaPath:"#/$defs/TriangleObject/properties/vertices/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err292];
}
else {
vErrors.push(err292);
}
errors++;
}
if(data113.length < 3){
const err293 = {instancePath:instancePath+"/objects/" + i5+"/vertices",schemaPath:"#/$defs/TriangleObject/properties/vertices/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err293];
}
else {
vErrors.push(err293);
}
errors++;
}
const len13 = data113.length;
if(len13 > 0){
if(typeof data113[0] !== "string"){
const err294 = {instancePath:instancePath+"/objects/" + i5+"/vertices/0",schemaPath:"#/$defs/TriangleObject/properties/vertices/prefixItems/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err294];
}
else {
vErrors.push(err294);
}
errors++;
}
}
if(len13 > 1){
if(typeof data113[1] !== "string"){
const err295 = {instancePath:instancePath+"/objects/" + i5+"/vertices/1",schemaPath:"#/$defs/TriangleObject/properties/vertices/prefixItems/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err295];
}
else {
vErrors.push(err295);
}
errors++;
}
}
if(len13 > 2){
if(typeof data113[2] !== "string"){
const err296 = {instancePath:instancePath+"/objects/" + i5+"/vertices/2",schemaPath:"#/$defs/TriangleObject/properties/vertices/prefixItems/2/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err296];
}
else {
vErrors.push(err296);
}
errors++;
}
}
}
else {
const err297 = {instancePath:instancePath+"/objects/" + i5+"/vertices",schemaPath:"#/$defs/TriangleObject/properties/vertices/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err297];
}
else {
vErrors.push(err297);
}
errors++;
}
}
}
else {
const err298 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/TriangleObject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err298];
}
else {
vErrors.push(err298);
}
errors++;
}
var _valid15 = _errs363 === errors;
if(_valid15 && valid61){
valid61 = false;
passing1 = [passing1, 5];
}
else {
if(_valid15){
valid61 = true;
passing1 = 5;
if(props1 !== true){
props1 = true;
}
}
const _errs379 = errors;
if(data89 && typeof data89 == "object" && !Array.isArray(data89)){
if(data89.id === undefined){
const err299 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/AngleObject/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err299];
}
else {
vErrors.push(err299);
}
errors++;
}
if(data89.type === undefined){
const err300 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/AngleObject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err300];
}
else {
vErrors.push(err300);
}
errors++;
}
if(data89.points === undefined){
const err301 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/AngleObject/required",keyword:"required",params:{missingProperty: "points"},message:"must have required property '"+"points"+"'"};
if(vErrors === null){
vErrors = [err301];
}
else {
vErrors.push(err301);
}
errors++;
}
for(const key21 in data89){
if(!(((key21 === "id") || (key21 === "points")) || (key21 === "type"))){
const err302 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/AngleObject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key21},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err302];
}
else {
vErrors.push(err302);
}
errors++;
}
}
if(data89.id !== undefined){
if(typeof data89.id !== "string"){
const err303 = {instancePath:instancePath+"/objects/" + i5+"/id",schemaPath:"#/$defs/AngleObject/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err303];
}
else {
vErrors.push(err303);
}
errors++;
}
}
if(data89.points !== undefined){
let data118 = data89.points;
if(Array.isArray(data118)){
if(data118.length > 3){
const err304 = {instancePath:instancePath+"/objects/" + i5+"/points",schemaPath:"#/$defs/AngleObject/properties/points/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err304];
}
else {
vErrors.push(err304);
}
errors++;
}
if(data118.length < 3){
const err305 = {instancePath:instancePath+"/objects/" + i5+"/points",schemaPath:"#/$defs/AngleObject/properties/points/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err305];
}
else {
vErrors.push(err305);
}
errors++;
}
const len14 = data118.length;
if(len14 > 0){
if(typeof data118[0] !== "string"){
const err306 = {instancePath:instancePath+"/objects/" + i5+"/points/0",schemaPath:"#/$defs/AngleObject/properties/points/prefixItems/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err306];
}
else {
vErrors.push(err306);
}
errors++;
}
}
if(len14 > 1){
if(typeof data118[1] !== "string"){
const err307 = {instancePath:instancePath+"/objects/" + i5+"/points/1",schemaPath:"#/$defs/AngleObject/properties/points/prefixItems/1/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err307];
}
else {
vErrors.push(err307);
}
errors++;
}
}
if(len14 > 2){
if(typeof data118[2] !== "string"){
const err308 = {instancePath:instancePath+"/objects/" + i5+"/points/2",schemaPath:"#/$defs/AngleObject/properties/points/prefixItems/2/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err308];
}
else {
vErrors.push(err308);
}
errors++;
}
}
}
else {
const err309 = {instancePath:instancePath+"/objects/" + i5+"/points",schemaPath:"#/$defs/AngleObject/properties/points/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err309];
}
else {
vErrors.push(err309);
}
errors++;
}
}
if(data89.type !== undefined){
let data122 = data89.type;
if(typeof data122 !== "string"){
const err310 = {instancePath:instancePath+"/objects/" + i5+"/type",schemaPath:"#/$defs/AngleObject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err310];
}
else {
vErrors.push(err310);
}
errors++;
}
if("angle" !== data122){
const err311 = {instancePath:instancePath+"/objects/" + i5+"/type",schemaPath:"#/$defs/AngleObject/properties/type/const",keyword:"const",params:{allowedValue: "angle"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err311];
}
else {
vErrors.push(err311);
}
errors++;
}
}
}
else {
const err312 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/AngleObject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err312];
}
else {
vErrors.push(err312);
}
errors++;
}
var _valid15 = _errs379 === errors;
if(_valid15 && valid61){
valid61 = false;
passing1 = [passing1, 6];
}
else {
if(_valid15){
valid61 = true;
passing1 = 6;
if(props1 !== true){
props1 = true;
}
}
const _errs395 = errors;
if(data89 && typeof data89 == "object" && !Array.isArray(data89)){
if(data89.id === undefined){
const err313 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/LabelObject/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err313];
}
else {
vErrors.push(err313);
}
errors++;
}
if(data89.type === undefined){
const err314 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/LabelObject/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err314];
}
else {
vErrors.push(err314);
}
errors++;
}
if(data89.text === undefined){
const err315 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/LabelObject/required",keyword:"required",params:{missingProperty: "text"},message:"must have required property '"+"text"+"'"};
if(vErrors === null){
vErrors = [err315];
}
else {
vErrors.push(err315);
}
errors++;
}
if(data89.target === undefined){
const err316 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/LabelObject/required",keyword:"required",params:{missingProperty: "target"},message:"must have required property '"+"target"+"'"};
if(vErrors === null){
vErrors = [err316];
}
else {
vErrors.push(err316);
}
errors++;
}
for(const key22 in data89){
if(!((((key22 === "id") || (key22 === "target")) || (key22 === "text")) || (key22 === "type"))){
const err317 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/LabelObject/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key22},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err317];
}
else {
vErrors.push(err317);
}
errors++;
}
}
if(data89.id !== undefined){
if(typeof data89.id !== "string"){
const err318 = {instancePath:instancePath+"/objects/" + i5+"/id",schemaPath:"#/$defs/LabelObject/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err318];
}
else {
vErrors.push(err318);
}
errors++;
}
}
if(data89.target !== undefined){
if(typeof data89.target !== "string"){
const err319 = {instancePath:instancePath+"/objects/" + i5+"/target",schemaPath:"#/$defs/LabelObject/properties/target/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err319];
}
else {
vErrors.push(err319);
}
errors++;
}
}
if(data89.text !== undefined){
if(typeof data89.text !== "string"){
const err320 = {instancePath:instancePath+"/objects/" + i5+"/text",schemaPath:"#/$defs/LabelObject/properties/text/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err320];
}
else {
vErrors.push(err320);
}
errors++;
}
}
if(data89.type !== undefined){
let data126 = data89.type;
if(typeof data126 !== "string"){
const err321 = {instancePath:instancePath+"/objects/" + i5+"/type",schemaPath:"#/$defs/LabelObject/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err321];
}
else {
vErrors.push(err321);
}
errors++;
}
if("label" !== data126){
const err322 = {instancePath:instancePath+"/objects/" + i5+"/type",schemaPath:"#/$defs/LabelObject/properties/type/const",keyword:"const",params:{allowedValue: "label"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err322];
}
else {
vErrors.push(err322);
}
errors++;
}
}
}
else {
const err323 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/$defs/LabelObject/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err323];
}
else {
vErrors.push(err323);
}
errors++;
}
var _valid15 = _errs395 === errors;
if(_valid15 && valid61){
valid61 = false;
passing1 = [passing1, 7];
}
else {
if(_valid15){
valid61 = true;
passing1 = 7;
if(props1 !== true){
props1 = true;
}
}
}
}
}
}
}
}
}
if(!valid61){
const err324 = {instancePath:instancePath+"/objects/" + i5,schemaPath:"#/properties/objects/items/oneOf",keyword:"oneOf",params:{passingSchemas: passing1},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err324];
}
else {
vErrors.push(err324);
}
errors++;
}
else {
errors = _errs292;
if(vErrors !== null){
if(_errs292){
vErrors.length = _errs292;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err325 = {instancePath:instancePath+"/objects",schemaPath:"#/properties/objects/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err325];
}
else {
vErrors.push(err325);
}
errors++;
}
}
if(data.scene_type !== undefined){
let data127 = data.scene_type;
if(typeof data127 !== "string"){
const err326 = {instancePath:instancePath+"/scene_type",schemaPath:"#/properties/scene_type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err326];
}
else {
vErrors.push(err326);
}
errors++;
}
if("2d" !== data127){
const err327 = {instancePath:instancePath+"/scene_type",schemaPath:"#/properties/scene_type/const",keyword:"const",params:{allowedValue: "2d"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err327];
}
else {
vErrors.push(err327);
}
errors++;
}
}
if(data.schema_version !== undefined){
let data128 = data.schema_version;
if(typeof data128 !== "string"){
const err328 = {instancePath:instancePath+"/schema_version",schemaPath:"#/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err328];
}
else {
vErrors.push(err328);
}
errors++;
}
if("0.2.0" !== data128){
const err329 = {instancePath:instancePath+"/schema_version",schemaPath:"#/properties/schema_version/const",keyword:"const",params:{allowedValue: "0.2.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err329];
}
else {
vErrors.push(err329);
}
errors++;
}
}
}
else {
const err330 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err330];
}
else {
vErrors.push(err330);
}
errors++;
}
validate23.errors = vErrors;
return errors === 0;
}
validate23.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema58 = {"additionalProperties":false,"properties":{"is_valid":{"title":"Is Valid","type":"boolean"},"issues":{"items":{"$ref":"#/$defs/ValidationIssue"},"title":"Issues","type":"array"},"warnings":{"items":{"$ref":"#/$defs/ValidationIssue"},"title":"Warnings","type":"array"}},"required":["is_valid"],"title":"ValidationReport","type":"object"};
const schema59 = {"additionalProperties":false,"properties":{"code":{"title":"Code","type":"string"},"message":{"title":"Message","type":"string"},"path":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Path"},"severity":{"default":"error","enum":["error","warning"],"title":"Severity","type":"string"}},"required":["code","message"],"title":"ValidationIssue","type":"object"};

function validate25(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate25.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.is_valid === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "is_valid"},message:"must have required property '"+"is_valid"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "is_valid") || (key0 === "issues")) || (key0 === "warnings"))){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.is_valid !== undefined){
if(typeof data.is_valid !== "boolean"){
const err2 = {instancePath:instancePath+"/is_valid",schemaPath:"#/properties/is_valid/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.issues !== undefined){
let data1 = data.issues;
if(Array.isArray(data1)){
const len0 = data1.length;
for(let i0=0; i0<len0; i0++){
let data2 = data1[i0];
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
if(data2.code === undefined){
const err3 = {instancePath:instancePath+"/issues/" + i0,schemaPath:"#/$defs/ValidationIssue/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data2.message === undefined){
const err4 = {instancePath:instancePath+"/issues/" + i0,schemaPath:"#/$defs/ValidationIssue/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data2){
if(!((((key1 === "code") || (key1 === "message")) || (key1 === "path")) || (key1 === "severity"))){
const err5 = {instancePath:instancePath+"/issues/" + i0,schemaPath:"#/$defs/ValidationIssue/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data2.code !== undefined){
if(typeof data2.code !== "string"){
const err6 = {instancePath:instancePath+"/issues/" + i0+"/code",schemaPath:"#/$defs/ValidationIssue/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data2.message !== undefined){
if(typeof data2.message !== "string"){
const err7 = {instancePath:instancePath+"/issues/" + i0+"/message",schemaPath:"#/$defs/ValidationIssue/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data2.path !== undefined){
let data5 = data2.path;
const _errs15 = errors;
let valid5 = false;
const _errs16 = errors;
if(typeof data5 !== "string"){
const err8 = {instancePath:instancePath+"/issues/" + i0+"/path",schemaPath:"#/$defs/ValidationIssue/properties/path/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
var _valid0 = _errs16 === errors;
valid5 = valid5 || _valid0;
const _errs18 = errors;
if(data5 !== null){
const err9 = {instancePath:instancePath+"/issues/" + i0+"/path",schemaPath:"#/$defs/ValidationIssue/properties/path/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var _valid0 = _errs18 === errors;
valid5 = valid5 || _valid0;
if(!valid5){
const err10 = {instancePath:instancePath+"/issues/" + i0+"/path",schemaPath:"#/$defs/ValidationIssue/properties/path/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
else {
errors = _errs15;
if(vErrors !== null){
if(_errs15){
vErrors.length = _errs15;
}
else {
vErrors = null;
}
}
}
}
if(data2.severity !== undefined){
let data6 = data2.severity;
if(typeof data6 !== "string"){
const err11 = {instancePath:instancePath+"/issues/" + i0+"/severity",schemaPath:"#/$defs/ValidationIssue/properties/severity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(!((data6 === "error") || (data6 === "warning"))){
const err12 = {instancePath:instancePath+"/issues/" + i0+"/severity",schemaPath:"#/$defs/ValidationIssue/properties/severity/enum",keyword:"enum",params:{allowedValues: schema59.properties.severity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath:instancePath+"/issues/" + i0,schemaPath:"#/$defs/ValidationIssue/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath:instancePath+"/issues",schemaPath:"#/properties/issues/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.warnings !== undefined){
let data7 = data.warnings;
if(Array.isArray(data7)){
const len1 = data7.length;
for(let i1=0; i1<len1; i1++){
let data8 = data7[i1];
if(data8 && typeof data8 == "object" && !Array.isArray(data8)){
if(data8.code === undefined){
const err15 = {instancePath:instancePath+"/warnings/" + i1,schemaPath:"#/$defs/ValidationIssue/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data8.message === undefined){
const err16 = {instancePath:instancePath+"/warnings/" + i1,schemaPath:"#/$defs/ValidationIssue/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
for(const key2 in data8){
if(!((((key2 === "code") || (key2 === "message")) || (key2 === "path")) || (key2 === "severity"))){
const err17 = {instancePath:instancePath+"/warnings/" + i1,schemaPath:"#/$defs/ValidationIssue/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data8.code !== undefined){
if(typeof data8.code !== "string"){
const err18 = {instancePath:instancePath+"/warnings/" + i1+"/code",schemaPath:"#/$defs/ValidationIssue/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data8.message !== undefined){
if(typeof data8.message !== "string"){
const err19 = {instancePath:instancePath+"/warnings/" + i1+"/message",schemaPath:"#/$defs/ValidationIssue/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data8.path !== undefined){
let data11 = data8.path;
const _errs33 = errors;
let valid10 = false;
const _errs34 = errors;
if(typeof data11 !== "string"){
const err20 = {instancePath:instancePath+"/warnings/" + i1+"/path",schemaPath:"#/$defs/ValidationIssue/properties/path/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var _valid1 = _errs34 === errors;
valid10 = valid10 || _valid1;
const _errs36 = errors;
if(data11 !== null){
const err21 = {instancePath:instancePath+"/warnings/" + i1+"/path",schemaPath:"#/$defs/ValidationIssue/properties/path/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
var _valid1 = _errs36 === errors;
valid10 = valid10 || _valid1;
if(!valid10){
const err22 = {instancePath:instancePath+"/warnings/" + i1+"/path",schemaPath:"#/$defs/ValidationIssue/properties/path/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
else {
errors = _errs33;
if(vErrors !== null){
if(_errs33){
vErrors.length = _errs33;
}
else {
vErrors = null;
}
}
}
}
if(data8.severity !== undefined){
let data12 = data8.severity;
if(typeof data12 !== "string"){
const err23 = {instancePath:instancePath+"/warnings/" + i1+"/severity",schemaPath:"#/$defs/ValidationIssue/properties/severity/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(!((data12 === "error") || (data12 === "warning"))){
const err24 = {instancePath:instancePath+"/warnings/" + i1+"/severity",schemaPath:"#/$defs/ValidationIssue/properties/severity/enum",keyword:"enum",params:{allowedValues: schema59.properties.severity.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
}
else {
const err25 = {instancePath:instancePath+"/warnings/" + i1,schemaPath:"#/$defs/ValidationIssue/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
else {
const err26 = {instancePath:instancePath+"/warnings",schemaPath:"#/properties/warnings/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
}
else {
const err27 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
validate25.errors = vErrors;
return errors === 0;
}
validate25.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate22(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate22.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.status === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.confidence === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "confidence"},message:"must have required property '"+"confidence"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.gir === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "gir"},message:"must have required property '"+"gir"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.validation_report === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "validation_report"},message:"must have required property '"+"validation_report"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!(func3.call(schema33.properties, key0))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.ambiguities !== undefined){
let data0 = data.ambiguities;
if(Array.isArray(data0)){
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
let data1 = data0[i0];
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.code === undefined){
const err5 = {instancePath:instancePath+"/ambiguities/" + i0,schemaPath:"#/$defs/ApiAmbiguity/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data1.message === undefined){
const err6 = {instancePath:instancePath+"/ambiguities/" + i0,schemaPath:"#/$defs/ApiAmbiguity/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key1 in data1){
if(!(((key1 === "code") || (key1 === "message")) || (key1 === "options"))){
const err7 = {instancePath:instancePath+"/ambiguities/" + i0,schemaPath:"#/$defs/ApiAmbiguity/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data1.code !== undefined){
if(typeof data1.code !== "string"){
const err8 = {instancePath:instancePath+"/ambiguities/" + i0+"/code",schemaPath:"#/$defs/ApiAmbiguity/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data1.message !== undefined){
if(typeof data1.message !== "string"){
const err9 = {instancePath:instancePath+"/ambiguities/" + i0+"/message",schemaPath:"#/$defs/ApiAmbiguity/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data1.options !== undefined){
let data4 = data1.options;
if(Array.isArray(data4)){
const len1 = data4.length;
for(let i1=0; i1<len1; i1++){
if(typeof data4[i1] !== "string"){
const err10 = {instancePath:instancePath+"/ambiguities/" + i0+"/options/" + i1,schemaPath:"#/$defs/ApiAmbiguity/properties/options/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
else {
const err11 = {instancePath:instancePath+"/ambiguities/" + i0+"/options",schemaPath:"#/$defs/ApiAmbiguity/properties/options/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
else {
const err12 = {instancePath:instancePath+"/ambiguities/" + i0,schemaPath:"#/$defs/ApiAmbiguity/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath:instancePath+"/ambiguities",schemaPath:"#/properties/ambiguities/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.confidence !== undefined){
let data6 = data.confidence;
if(typeof data6 == "number"){
if(data6 > 1 || isNaN(data6)){
const err14 = {instancePath:instancePath+"/confidence",schemaPath:"#/properties/confidence/maximum",keyword:"maximum",params:{comparison: "<=", limit: 1},message:"must be <= 1"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data6 < 0 || isNaN(data6)){
const err15 = {instancePath:instancePath+"/confidence",schemaPath:"#/properties/confidence/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/confidence",schemaPath:"#/properties/confidence/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.explanation !== undefined){
let data7 = data.explanation;
const _errs19 = errors;
let valid7 = false;
const _errs20 = errors;
if(typeof data7 !== "string"){
const err17 = {instancePath:instancePath+"/explanation",schemaPath:"#/properties/explanation/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
var _valid0 = _errs20 === errors;
valid7 = valid7 || _valid0;
const _errs22 = errors;
if(data7 !== null){
const err18 = {instancePath:instancePath+"/explanation",schemaPath:"#/properties/explanation/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
var _valid0 = _errs22 === errors;
valid7 = valid7 || _valid0;
if(!valid7){
const err19 = {instancePath:instancePath+"/explanation",schemaPath:"#/properties/explanation/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
else {
errors = _errs19;
if(vErrors !== null){
if(_errs19){
vErrors.length = _errs19;
}
else {
vErrors = null;
}
}
}
}
if(data.gir !== undefined){
if(!(validate23(data.gir, {instancePath:instancePath+"/gir",parentData:data,parentDataProperty:"gir",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
errors = vErrors.length;
}
}
if(data.schema_version !== undefined){
let data9 = data.schema_version;
if(typeof data9 !== "string"){
const err20 = {instancePath:instancePath+"/schema_version",schemaPath:"#/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if("0.2.0" !== data9){
const err21 = {instancePath:instancePath+"/schema_version",schemaPath:"#/properties/schema_version/const",keyword:"const",params:{allowedValue: "0.2.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.status !== undefined){
let data10 = data.status;
if(typeof data10 !== "string"){
const err22 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if("success" !== data10){
const err23 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/const",keyword:"const",params:{allowedValue: "success"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.svg !== undefined){
let data11 = data.svg;
const _errs30 = errors;
let valid8 = false;
const _errs31 = errors;
if(typeof data11 !== "string"){
const err24 = {instancePath:instancePath+"/svg",schemaPath:"#/properties/svg/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
var _valid1 = _errs31 === errors;
valid8 = valid8 || _valid1;
const _errs33 = errors;
if(data11 !== null){
const err25 = {instancePath:instancePath+"/svg",schemaPath:"#/properties/svg/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
var _valid1 = _errs33 === errors;
valid8 = valid8 || _valid1;
if(!valid8){
const err26 = {instancePath:instancePath+"/svg",schemaPath:"#/properties/svg/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
else {
errors = _errs30;
if(vErrors !== null){
if(_errs30){
vErrors.length = _errs30;
}
else {
vErrors = null;
}
}
}
}
if(data.tikz !== undefined){
let data12 = data.tikz;
const _errs36 = errors;
let valid9 = false;
const _errs37 = errors;
if(typeof data12 !== "string"){
const err27 = {instancePath:instancePath+"/tikz",schemaPath:"#/properties/tikz/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
var _valid2 = _errs37 === errors;
valid9 = valid9 || _valid2;
const _errs39 = errors;
if(data12 !== null){
const err28 = {instancePath:instancePath+"/tikz",schemaPath:"#/properties/tikz/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
var _valid2 = _errs39 === errors;
valid9 = valid9 || _valid2;
if(!valid9){
const err29 = {instancePath:instancePath+"/tikz",schemaPath:"#/properties/tikz/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
else {
errors = _errs36;
if(vErrors !== null){
if(_errs36){
vErrors.length = _errs36;
}
else {
vErrors = null;
}
}
}
}
if(data.validation_report !== undefined){
if(!(validate25(data.validation_report, {instancePath:instancePath+"/validation_report",parentData:data,parentDataProperty:"validation_report",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
if(data.warnings !== undefined){
let data14 = data.warnings;
if(Array.isArray(data14)){
const len2 = data14.length;
for(let i2=0; i2<len2; i2++){
let data15 = data14[i2];
if(data15 && typeof data15 == "object" && !Array.isArray(data15)){
if(data15.code === undefined){
const err30 = {instancePath:instancePath+"/warnings/" + i2,schemaPath:"#/$defs/ApiWarning/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(data15.message === undefined){
const err31 = {instancePath:instancePath+"/warnings/" + i2,schemaPath:"#/$defs/ApiWarning/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
for(const key2 in data15){
if(!((key2 === "code") || (key2 === "message"))){
const err32 = {instancePath:instancePath+"/warnings/" + i2,schemaPath:"#/$defs/ApiWarning/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data15.code !== undefined){
let data16 = data15.code;
if(typeof data16 !== "string"){
const err33 = {instancePath:instancePath+"/warnings/" + i2+"/code",schemaPath:"#/$defs/ApiWarning/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if(!((((data16 === "unsupported_construction") || (data16 === "draft_gir_invalid")) || (data16 === "normalized_gir_invalid")) || (data16 === "adapter_warning"))){
const err34 = {instancePath:instancePath+"/warnings/" + i2+"/code",schemaPath:"#/$defs/ApiWarning/properties/code/enum",keyword:"enum",params:{allowedValues: schema61.properties.code.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data15.message !== undefined){
if(typeof data15.message !== "string"){
const err35 = {instancePath:instancePath+"/warnings/" + i2+"/message",schemaPath:"#/$defs/ApiWarning/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
}
else {
const err36 = {instancePath:instancePath+"/warnings/" + i2,schemaPath:"#/$defs/ApiWarning/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
}
else {
const err37 = {instancePath:instancePath+"/warnings",schemaPath:"#/properties/warnings/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
}
else {
const err38 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
validate22.errors = vErrors;
return errors === 0;
}
validate22.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema62 = {"additionalProperties":false,"examples":[{"ambiguities":[{"code":"missing_angle","message":"Не указано, биссектрису какого угла нужно построить.","options":["angle_A","angle_B","angle_C"]}],"confidence":0.4,"explanation":"Bisector request lacks angle target.","schema_version":"0.2.0","status":"needs_clarification","warnings":[]}],"properties":{"ambiguities":{"items":{"$ref":"#/$defs/ApiAmbiguity"},"title":"Ambiguities","type":"array"},"confidence":{"maximum":1,"minimum":0,"title":"Confidence","type":"number"},"explanation":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Explanation"},"gir":{"title":"Gir","type":"null"},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"},"status":{"const":"needs_clarification","title":"Status","type":"string"},"svg":{"title":"Svg","type":"null"},"tikz":{"title":"Tikz","type":"null"},"validation_report":{"title":"Validation Report","type":"null"},"warnings":{"items":{"$ref":"#/$defs/ApiWarning"},"title":"Warnings","type":"array"}},"required":["status","confidence"],"title":"GenerateClarificationResponse","type":"object"};

function validate28(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate28.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.status === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.confidence === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "confidence"},message:"must have required property '"+"confidence"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(func3.call(schema62.properties, key0))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.ambiguities !== undefined){
let data0 = data.ambiguities;
if(Array.isArray(data0)){
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
let data1 = data0[i0];
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.code === undefined){
const err3 = {instancePath:instancePath+"/ambiguities/" + i0,schemaPath:"#/$defs/ApiAmbiguity/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data1.message === undefined){
const err4 = {instancePath:instancePath+"/ambiguities/" + i0,schemaPath:"#/$defs/ApiAmbiguity/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data1){
if(!(((key1 === "code") || (key1 === "message")) || (key1 === "options"))){
const err5 = {instancePath:instancePath+"/ambiguities/" + i0,schemaPath:"#/$defs/ApiAmbiguity/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data1.code !== undefined){
if(typeof data1.code !== "string"){
const err6 = {instancePath:instancePath+"/ambiguities/" + i0+"/code",schemaPath:"#/$defs/ApiAmbiguity/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data1.message !== undefined){
if(typeof data1.message !== "string"){
const err7 = {instancePath:instancePath+"/ambiguities/" + i0+"/message",schemaPath:"#/$defs/ApiAmbiguity/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data1.options !== undefined){
let data4 = data1.options;
if(Array.isArray(data4)){
const len1 = data4.length;
for(let i1=0; i1<len1; i1++){
if(typeof data4[i1] !== "string"){
const err8 = {instancePath:instancePath+"/ambiguities/" + i0+"/options/" + i1,schemaPath:"#/$defs/ApiAmbiguity/properties/options/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath:instancePath+"/ambiguities/" + i0+"/options",schemaPath:"#/$defs/ApiAmbiguity/properties/options/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
else {
const err10 = {instancePath:instancePath+"/ambiguities/" + i0,schemaPath:"#/$defs/ApiAmbiguity/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
else {
const err11 = {instancePath:instancePath+"/ambiguities",schemaPath:"#/properties/ambiguities/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.confidence !== undefined){
let data6 = data.confidence;
if(typeof data6 == "number"){
if(data6 > 1 || isNaN(data6)){
const err12 = {instancePath:instancePath+"/confidence",schemaPath:"#/properties/confidence/maximum",keyword:"maximum",params:{comparison: "<=", limit: 1},message:"must be <= 1"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data6 < 0 || isNaN(data6)){
const err13 = {instancePath:instancePath+"/confidence",schemaPath:"#/properties/confidence/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/confidence",schemaPath:"#/properties/confidence/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.explanation !== undefined){
let data7 = data.explanation;
const _errs19 = errors;
let valid7 = false;
const _errs20 = errors;
if(typeof data7 !== "string"){
const err15 = {instancePath:instancePath+"/explanation",schemaPath:"#/properties/explanation/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var _valid0 = _errs20 === errors;
valid7 = valid7 || _valid0;
const _errs22 = errors;
if(data7 !== null){
const err16 = {instancePath:instancePath+"/explanation",schemaPath:"#/properties/explanation/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var _valid0 = _errs22 === errors;
valid7 = valid7 || _valid0;
if(!valid7){
const err17 = {instancePath:instancePath+"/explanation",schemaPath:"#/properties/explanation/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
errors = _errs19;
if(vErrors !== null){
if(_errs19){
vErrors.length = _errs19;
}
else {
vErrors = null;
}
}
}
}
if(data.gir !== undefined){
if(data.gir !== null){
const err18 = {instancePath:instancePath+"/gir",schemaPath:"#/properties/gir/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.schema_version !== undefined){
let data9 = data.schema_version;
if(typeof data9 !== "string"){
const err19 = {instancePath:instancePath+"/schema_version",schemaPath:"#/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if("0.2.0" !== data9){
const err20 = {instancePath:instancePath+"/schema_version",schemaPath:"#/properties/schema_version/const",keyword:"const",params:{allowedValue: "0.2.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.status !== undefined){
let data10 = data.status;
if(typeof data10 !== "string"){
const err21 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if("needs_clarification" !== data10){
const err22 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/const",keyword:"const",params:{allowedValue: "needs_clarification"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.svg !== undefined){
if(data.svg !== null){
const err23 = {instancePath:instancePath+"/svg",schemaPath:"#/properties/svg/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.tikz !== undefined){
if(data.tikz !== null){
const err24 = {instancePath:instancePath+"/tikz",schemaPath:"#/properties/tikz/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data.validation_report !== undefined){
if(data.validation_report !== null){
const err25 = {instancePath:instancePath+"/validation_report",schemaPath:"#/properties/validation_report/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.warnings !== undefined){
let data14 = data.warnings;
if(Array.isArray(data14)){
const len2 = data14.length;
for(let i2=0; i2<len2; i2++){
let data15 = data14[i2];
if(data15 && typeof data15 == "object" && !Array.isArray(data15)){
if(data15.code === undefined){
const err26 = {instancePath:instancePath+"/warnings/" + i2,schemaPath:"#/$defs/ApiWarning/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(data15.message === undefined){
const err27 = {instancePath:instancePath+"/warnings/" + i2,schemaPath:"#/$defs/ApiWarning/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
for(const key2 in data15){
if(!((key2 === "code") || (key2 === "message"))){
const err28 = {instancePath:instancePath+"/warnings/" + i2,schemaPath:"#/$defs/ApiWarning/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data15.code !== undefined){
let data16 = data15.code;
if(typeof data16 !== "string"){
const err29 = {instancePath:instancePath+"/warnings/" + i2+"/code",schemaPath:"#/$defs/ApiWarning/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(!((((data16 === "unsupported_construction") || (data16 === "draft_gir_invalid")) || (data16 === "normalized_gir_invalid")) || (data16 === "adapter_warning"))){
const err30 = {instancePath:instancePath+"/warnings/" + i2+"/code",schemaPath:"#/$defs/ApiWarning/properties/code/enum",keyword:"enum",params:{allowedValues: schema61.properties.code.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data15.message !== undefined){
if(typeof data15.message !== "string"){
const err31 = {instancePath:instancePath+"/warnings/" + i2+"/message",schemaPath:"#/$defs/ApiWarning/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
}
else {
const err32 = {instancePath:instancePath+"/warnings/" + i2,schemaPath:"#/$defs/ApiWarning/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
}
else {
const err33 = {instancePath:instancePath+"/warnings",schemaPath:"#/properties/warnings/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
}
else {
const err34 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
validate28.errors = vErrors;
return errors === 0;
}
validate28.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema65 = {"additionalProperties":false,"examples":[{"ambiguities":[],"confidence":0,"explanation":"No supported construction matched the input.","schema_version":"0.2.0","status":"error","warnings":[{"code":"unsupported_construction","message":"Construction is not supported."}]}],"properties":{"ambiguities":{"items":{"$ref":"#/$defs/ApiAmbiguity"},"title":"Ambiguities","type":"array"},"confidence":{"maximum":1,"minimum":0,"title":"Confidence","type":"number"},"explanation":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Explanation"},"gir":{"anyOf":[{"$ref":"#/$defs/GirScene"},{"type":"null"}]},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"},"status":{"const":"error","title":"Status","type":"string"},"svg":{"title":"Svg","type":"null"},"tikz":{"title":"Tikz","type":"null"},"validation_report":{"anyOf":[{"$ref":"#/$defs/ValidationReport"},{"type":"null"}]},"warnings":{"items":{"$ref":"#/$defs/ApiWarning"},"title":"Warnings","type":"array"}},"required":["status","confidence"],"title":"GenerateErrorResponse","type":"object"};

function validate30(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate30.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.status === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.confidence === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "confidence"},message:"must have required property '"+"confidence"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(func3.call(schema65.properties, key0))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.ambiguities !== undefined){
let data0 = data.ambiguities;
if(Array.isArray(data0)){
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
let data1 = data0[i0];
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.code === undefined){
const err3 = {instancePath:instancePath+"/ambiguities/" + i0,schemaPath:"#/$defs/ApiAmbiguity/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data1.message === undefined){
const err4 = {instancePath:instancePath+"/ambiguities/" + i0,schemaPath:"#/$defs/ApiAmbiguity/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key1 in data1){
if(!(((key1 === "code") || (key1 === "message")) || (key1 === "options"))){
const err5 = {instancePath:instancePath+"/ambiguities/" + i0,schemaPath:"#/$defs/ApiAmbiguity/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data1.code !== undefined){
if(typeof data1.code !== "string"){
const err6 = {instancePath:instancePath+"/ambiguities/" + i0+"/code",schemaPath:"#/$defs/ApiAmbiguity/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data1.message !== undefined){
if(typeof data1.message !== "string"){
const err7 = {instancePath:instancePath+"/ambiguities/" + i0+"/message",schemaPath:"#/$defs/ApiAmbiguity/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data1.options !== undefined){
let data4 = data1.options;
if(Array.isArray(data4)){
const len1 = data4.length;
for(let i1=0; i1<len1; i1++){
if(typeof data4[i1] !== "string"){
const err8 = {instancePath:instancePath+"/ambiguities/" + i0+"/options/" + i1,schemaPath:"#/$defs/ApiAmbiguity/properties/options/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath:instancePath+"/ambiguities/" + i0+"/options",schemaPath:"#/$defs/ApiAmbiguity/properties/options/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
else {
const err10 = {instancePath:instancePath+"/ambiguities/" + i0,schemaPath:"#/$defs/ApiAmbiguity/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
else {
const err11 = {instancePath:instancePath+"/ambiguities",schemaPath:"#/properties/ambiguities/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.confidence !== undefined){
let data6 = data.confidence;
if(typeof data6 == "number"){
if(data6 > 1 || isNaN(data6)){
const err12 = {instancePath:instancePath+"/confidence",schemaPath:"#/properties/confidence/maximum",keyword:"maximum",params:{comparison: "<=", limit: 1},message:"must be <= 1"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data6 < 0 || isNaN(data6)){
const err13 = {instancePath:instancePath+"/confidence",schemaPath:"#/properties/confidence/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/confidence",schemaPath:"#/properties/confidence/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.explanation !== undefined){
let data7 = data.explanation;
const _errs19 = errors;
let valid7 = false;
const _errs20 = errors;
if(typeof data7 !== "string"){
const err15 = {instancePath:instancePath+"/explanation",schemaPath:"#/properties/explanation/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var _valid0 = _errs20 === errors;
valid7 = valid7 || _valid0;
const _errs22 = errors;
if(data7 !== null){
const err16 = {instancePath:instancePath+"/explanation",schemaPath:"#/properties/explanation/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var _valid0 = _errs22 === errors;
valid7 = valid7 || _valid0;
if(!valid7){
const err17 = {instancePath:instancePath+"/explanation",schemaPath:"#/properties/explanation/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
errors = _errs19;
if(vErrors !== null){
if(_errs19){
vErrors.length = _errs19;
}
else {
vErrors = null;
}
}
}
}
if(data.gir !== undefined){
let data8 = data.gir;
const _errs25 = errors;
let valid8 = false;
const _errs26 = errors;
if(!(validate23(data8, {instancePath:instancePath+"/gir",parentData:data,parentDataProperty:"gir",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
errors = vErrors.length;
}
var _valid1 = _errs26 === errors;
valid8 = valid8 || _valid1;
const _errs27 = errors;
if(data8 !== null){
const err18 = {instancePath:instancePath+"/gir",schemaPath:"#/properties/gir/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
var _valid1 = _errs27 === errors;
valid8 = valid8 || _valid1;
if(!valid8){
const err19 = {instancePath:instancePath+"/gir",schemaPath:"#/properties/gir/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
else {
errors = _errs25;
if(vErrors !== null){
if(_errs25){
vErrors.length = _errs25;
}
else {
vErrors = null;
}
}
}
}
if(data.schema_version !== undefined){
let data9 = data.schema_version;
if(typeof data9 !== "string"){
const err20 = {instancePath:instancePath+"/schema_version",schemaPath:"#/properties/schema_version/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if("0.2.0" !== data9){
const err21 = {instancePath:instancePath+"/schema_version",schemaPath:"#/properties/schema_version/const",keyword:"const",params:{allowedValue: "0.2.0"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.status !== undefined){
let data10 = data.status;
if(typeof data10 !== "string"){
const err22 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if("error" !== data10){
const err23 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/const",keyword:"const",params:{allowedValue: "error"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.svg !== undefined){
if(data.svg !== null){
const err24 = {instancePath:instancePath+"/svg",schemaPath:"#/properties/svg/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data.tikz !== undefined){
if(data.tikz !== null){
const err25 = {instancePath:instancePath+"/tikz",schemaPath:"#/properties/tikz/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.validation_report !== undefined){
let data13 = data.validation_report;
const _errs38 = errors;
let valid9 = false;
const _errs39 = errors;
if(!(validate25(data13, {instancePath:instancePath+"/validation_report",parentData:data,parentDataProperty:"validation_report",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
var _valid2 = _errs39 === errors;
valid9 = valid9 || _valid2;
const _errs40 = errors;
if(data13 !== null){
const err26 = {instancePath:instancePath+"/validation_report",schemaPath:"#/properties/validation_report/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
var _valid2 = _errs40 === errors;
valid9 = valid9 || _valid2;
if(!valid9){
const err27 = {instancePath:instancePath+"/validation_report",schemaPath:"#/properties/validation_report/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
else {
errors = _errs38;
if(vErrors !== null){
if(_errs38){
vErrors.length = _errs38;
}
else {
vErrors = null;
}
}
}
}
if(data.warnings !== undefined){
let data14 = data.warnings;
if(Array.isArray(data14)){
const len2 = data14.length;
for(let i2=0; i2<len2; i2++){
let data15 = data14[i2];
if(data15 && typeof data15 == "object" && !Array.isArray(data15)){
if(data15.code === undefined){
const err28 = {instancePath:instancePath+"/warnings/" + i2,schemaPath:"#/$defs/ApiWarning/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(data15.message === undefined){
const err29 = {instancePath:instancePath+"/warnings/" + i2,schemaPath:"#/$defs/ApiWarning/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
for(const key2 in data15){
if(!((key2 === "code") || (key2 === "message"))){
const err30 = {instancePath:instancePath+"/warnings/" + i2,schemaPath:"#/$defs/ApiWarning/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data15.code !== undefined){
let data16 = data15.code;
if(typeof data16 !== "string"){
const err31 = {instancePath:instancePath+"/warnings/" + i2+"/code",schemaPath:"#/$defs/ApiWarning/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if(!((((data16 === "unsupported_construction") || (data16 === "draft_gir_invalid")) || (data16 === "normalized_gir_invalid")) || (data16 === "adapter_warning"))){
const err32 = {instancePath:instancePath+"/warnings/" + i2+"/code",schemaPath:"#/$defs/ApiWarning/properties/code/enum",keyword:"enum",params:{allowedValues: schema61.properties.code.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data15.message !== undefined){
if(typeof data15.message !== "string"){
const err33 = {instancePath:instancePath+"/warnings/" + i2+"/message",schemaPath:"#/$defs/ApiWarning/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
}
else {
const err34 = {instancePath:instancePath+"/warnings/" + i2,schemaPath:"#/$defs/ApiWarning/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
}
else {
const err35 = {instancePath:instancePath+"/warnings",schemaPath:"#/properties/warnings/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
}
else {
const err36 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
validate30.errors = vErrors;
return errors === 0;
}
validate30.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate21(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:tutorboard:geometryos:generate-response" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate21.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(!(validate22(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
errors = vErrors.length;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs2 = errors;
if(!(validate28(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
errors = vErrors.length;
}
var _valid0 = _errs2 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
const _errs3 = errors;
if(!(validate30(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
errors = vErrors.length;
}
var _valid0 = _errs3 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
if(props0 !== true){
props0 = true;
}
}
}
}
if(!valid0){
const err0 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate21.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate21.evaluated = {"dynamicProps":true,"dynamicItems":false};

export const validateProblemDetail = validate34;
const schema68 = {"$id":"urn:tutorboard:geometryos:problem-detail","additionalProperties":false,"examples":[{"code":"request_validation_failed","detail":"The request payload does not satisfy the API contract.","errors":[{"code":"literal_error","location":["body","mode"],"message":"Input should be 'strict'"}],"instance":"/api/v1/generate","request_id":"tutorboard-contract","status":422,"title":"Request validation failed","type":"urn:geometryos:problem:request-validation"},{"code":"operation_timeout","detail":"The generate operation exceeded its configured time limit.","errors":[],"instance":"/api/v1/generate","request_id":"tutorboard-contract","status":504,"title":"Operation timed out","type":"urn:geometryos:problem:operation-timeout"},{"code":"service_unavailable","detail":"GeometryOS is not ready to accept application requests.","errors":[],"instance":"/api/v1/generate","request_id":"tutorboard-contract","status":503,"title":"Service unavailable","type":"urn:geometryos:problem:service-unavailable"},{"code":"internal_error","detail":"An unexpected internal error occurred.","errors":[],"instance":"/api/v1/generate","request_id":"tutorboard-contract","status":500,"title":"Internal server error","type":"urn:geometryos:problem:internal-error"}],"properties":{"code":{"title":"Code","type":"string"},"detail":{"title":"Detail","type":"string"},"errors":{"items":{"$ref":"#/$defs/ProblemError"},"title":"Errors","type":"array"},"instance":{"title":"Instance","type":"string"},"request_id":{"title":"Request Id","type":"string"},"status":{"title":"Status","type":"integer"},"title":{"title":"Title","type":"string"},"type":{"title":"Type","type":"string"}},"required":["type","title","status","detail","instance","code","request_id"],"title":"ProblemDetail","type":"object","$defs":{"AltitudeConstraint":{"additionalProperties":false,"properties":{"foot":{"title":"Foot","type":"string"},"from_point":{"title":"From Point","type":"string"},"id":{"title":"Id","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"segment":{"title":"Segment","type":"string"},"to_object":{"title":"To Object","type":"string"},"type":{"const":"altitude","title":"Type","type":"string"}},"required":["id","type","from_point","to_object","foot","segment"],"title":"AltitudeConstraint","type":"object"},"AngleBisectorConstraint":{"additionalProperties":false,"properties":{"angle":{"title":"Angle","type":"string"},"id":{"title":"Id","type":"string"},"ray":{"title":"Ray","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"angle_bisector","title":"Type","type":"string"}},"required":["id","type","angle","ray"],"title":"AngleBisectorConstraint","type":"object"},"AngleObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"maxItems":3,"minItems":3,"prefixItems":[{"type":"string"},{"type":"string"},{"type":"string"}],"title":"Points","type":"array"},"type":{"const":"angle","title":"Type","type":"string"}},"required":["id","type","points"],"title":"AngleObject","type":"object"},"ApiAmbiguity":{"additionalProperties":false,"properties":{"code":{"title":"Code","type":"string"},"message":{"title":"Message","type":"string"},"options":{"items":{"type":"string"},"title":"Options","type":"array"}},"required":["code","message"],"title":"ApiAmbiguity","type":"object"},"ApiWarning":{"additionalProperties":false,"properties":{"code":{"enum":["unsupported_construction","draft_gir_invalid","normalized_gir_invalid","adapter_warning"],"title":"Code","type":"string"},"message":{"title":"Message","type":"string"}},"required":["code","message"],"title":"ApiWarning","type":"object"},"BelongsToConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"object":{"title":"Object","type":"string"},"point":{"title":"Point","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"belongs_to","title":"Type","type":"string"}},"required":["id","type","point","object"],"title":"BelongsToConstraint","type":"object"},"CheckStatus":{"enum":["pass","fail"],"title":"CheckStatus","type":"string"},"CircleObject":{"additionalProperties":false,"properties":{"center":{"title":"Center","type":"string"},"id":{"title":"Id","type":"string"},"radius_point":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Radius Point"},"type":{"const":"circle","title":"Type","type":"string"}},"required":["id","type","center"],"title":"CircleObject","type":"object"},"CircumcircleConstraint":{"additionalProperties":false,"properties":{"circle":{"title":"Circle","type":"string"},"id":{"title":"Id","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"triangle":{"title":"Triangle","type":"string"},"type":{"const":"circumcircle","title":"Type","type":"string"}},"required":["id","type","triangle","circle"],"title":"CircumcircleConstraint","type":"object"},"CollinearConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"items":{"type":"string"},"title":"Points","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"collinear","title":"Type","type":"string"}},"required":["id","type","points"],"title":"CollinearConstraint","type":"object"},"ConstructionStep":{"additionalProperties":false,"properties":{"action":{"title":"Action","type":"string"},"constraints":{"items":{"type":"string"},"title":"Constraints","type":"array"},"id":{"title":"Id","type":"string"},"objects":{"items":{"type":"string"},"title":"Objects","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"}},"required":["id","action","objects"],"title":"ConstructionStep","type":"object"},"EqualLengthConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"objects":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Objects","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"equal_length","title":"Type","type":"string"}},"required":["id","type","objects"],"title":"EqualLengthConstraint","type":"object"},"GenerateClarificationResponse":{"additionalProperties":false,"examples":[{"ambiguities":[{"code":"missing_angle","message":"Не указано, биссектрису какого угла нужно построить.","options":["angle_A","angle_B","angle_C"]}],"confidence":0.4,"explanation":"Bisector request lacks angle target.","schema_version":"0.2.0","status":"needs_clarification","warnings":[]}],"properties":{"ambiguities":{"items":{"$ref":"#/$defs/ApiAmbiguity"},"title":"Ambiguities","type":"array"},"confidence":{"maximum":1,"minimum":0,"title":"Confidence","type":"number"},"explanation":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Explanation"},"gir":{"title":"Gir","type":"null"},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"},"status":{"const":"needs_clarification","title":"Status","type":"string"},"svg":{"title":"Svg","type":"null"},"tikz":{"title":"Tikz","type":"null"},"validation_report":{"title":"Validation Report","type":"null"},"warnings":{"items":{"$ref":"#/$defs/ApiWarning"},"title":"Warnings","type":"array"}},"required":["status","confidence"],"title":"GenerateClarificationResponse","type":"object"},"GenerateErrorResponse":{"additionalProperties":false,"examples":[{"ambiguities":[],"confidence":0,"explanation":"No supported construction matched the input.","schema_version":"0.2.0","status":"error","warnings":[{"code":"unsupported_construction","message":"Construction is not supported."}]}],"properties":{"ambiguities":{"items":{"$ref":"#/$defs/ApiAmbiguity"},"title":"Ambiguities","type":"array"},"confidence":{"maximum":1,"minimum":0,"title":"Confidence","type":"number"},"explanation":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Explanation"},"gir":{"anyOf":[{"$ref":"#/$defs/GirScene"},{"type":"null"}]},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"},"status":{"const":"error","title":"Status","type":"string"},"svg":{"title":"Svg","type":"null"},"tikz":{"title":"Tikz","type":"null"},"validation_report":{"anyOf":[{"$ref":"#/$defs/ValidationReport"},{"type":"null"}]},"warnings":{"items":{"$ref":"#/$defs/ApiWarning"},"title":"Warnings","type":"array"}},"required":["status","confidence"],"title":"GenerateErrorResponse","type":"object"},"GenerateSuccessResponse":{"additionalProperties":false,"examples":[{"ambiguities":[],"confidence":0.98,"explanation":"Rule-based altitude case.","gir":{"constraints":[{"id":"c_noncol_abc","points":["A","B","C"],"type":"non_collinear"},{"foot":"H","from_point":"A","id":"c_altitude_a_bc","segment":"AH","to_object":"BC","type":"altitude"}],"construction_steps":[{"action":"construct_triangle","constraints":["c_noncol_abc"],"id":"step_construct_triangle","objects":["A","B","C","BC","ABC"],"reason":"Construct triangle ABC."},{"action":"construct_altitude","constraints":["c_altitude_a_bc"],"id":"step_construct_altitude","objects":["H","AH"],"reason":"Construct altitude from A to BC."}],"metadata":{},"objects":[{"id":"A","label":"A","type":"point"},{"id":"B","label":"B","type":"point"},{"id":"C","label":"C","type":"point"},{"id":"H","label":"H","type":"point"},{"id":"BC","points":["B","C"],"type":"segment"},{"id":"AH","points":["A","H"],"type":"segment"},{"id":"ABC","type":"triangle","vertices":["A","B","C"]}],"scene_type":"2d","schema_version":"0.2.0"},"schema_version":"0.2.0","status":"success","svg":"<svg xmlns=\"http://www.w3.org/2000/svg\">...</svg>","validation_report":{"is_valid":true,"issues":[],"warnings":[]},"warnings":[]}],"properties":{"ambiguities":{"items":{"$ref":"#/$defs/ApiAmbiguity"},"title":"Ambiguities","type":"array"},"confidence":{"maximum":1,"minimum":0,"title":"Confidence","type":"number"},"explanation":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Explanation"},"gir":{"$ref":"#/$defs/GirScene"},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"},"status":{"const":"success","title":"Status","type":"string"},"svg":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Svg"},"tikz":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Tikz"},"validation_report":{"$ref":"#/$defs/ValidationReport"},"warnings":{"items":{"$ref":"#/$defs/ApiWarning"},"title":"Warnings","type":"array"}},"required":["status","confidence","gir","validation_report"],"title":"GenerateSuccessResponse","type":"object"},"GenerateV1Request":{"additionalProperties":false,"examples":[{"input":"Постройте треугольник ABC. Проведите высоту из вершины A к стороне BC.","input_type":"text","mode":"strict","output":["svg"]}],"properties":{"input":{"maxLength":20000,"minLength":1,"title":"Input","type":"string"},"input_type":{"const":"text","title":"Input Type","type":"string"},"mode":{"const":"strict","default":"strict","title":"Mode","type":"string"},"output":{"items":{"enum":["svg","tikz"],"type":"string"},"maxItems":2,"title":"Output","type":"array","uniqueItems":true}},"required":["input_type","input"],"title":"GenerateV1Request","type":"object"},"GirScene":{"additionalProperties":false,"properties":{"constraints":{"items":{"oneOf":[{"$ref":"#/$defs/BelongsToConstraint"},{"$ref":"#/$defs/CollinearConstraint"},{"$ref":"#/$defs/NonCollinearConstraint"},{"$ref":"#/$defs/ParallelConstraint"},{"$ref":"#/$defs/PerpendicularConstraint"},{"$ref":"#/$defs/EqualLengthConstraint"},{"$ref":"#/$defs/MidpointConstraint"},{"$ref":"#/$defs/IntersectionConstraint"},{"$ref":"#/$defs/AltitudeConstraint"},{"$ref":"#/$defs/MedianConstraint"},{"$ref":"#/$defs/AngleBisectorConstraint"},{"$ref":"#/$defs/CircumcircleConstraint"},{"$ref":"#/$defs/IncircleConstraint"}]},"title":"Constraints","type":"array"},"construction_steps":{"items":{"$ref":"#/$defs/ConstructionStep"},"title":"Construction Steps","type":"array"},"metadata":{"additionalProperties":true,"title":"Metadata","type":"object"},"objects":{"items":{"oneOf":[{"$ref":"#/$defs/PointObject"},{"$ref":"#/$defs/SegmentObject"},{"$ref":"#/$defs/LineObject"},{"$ref":"#/$defs/RayObject"},{"$ref":"#/$defs/CircleObject"},{"$ref":"#/$defs/TriangleObject"},{"$ref":"#/$defs/AngleObject"},{"$ref":"#/$defs/LabelObject"}]},"title":"Objects","type":"array"},"scene_type":{"const":"2d","title":"Scene Type","type":"string"},"schema_version":{"const":"0.2.0","title":"Schema Version","type":"string"}},"required":["schema_version","scene_type","objects","constraints","construction_steps"],"title":"GirScene","type":"object","x-gir-schema-version":"0.2.0"},"IncircleConstraint":{"additionalProperties":false,"properties":{"circle":{"title":"Circle","type":"string"},"id":{"title":"Id","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"triangle":{"title":"Triangle","type":"string"},"type":{"const":"incircle","title":"Type","type":"string"}},"required":["id","type","triangle","circle"],"title":"IncircleConstraint","type":"object"},"IntersectionConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"objects":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Objects","type":"array"},"point":{"title":"Point","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"intersection","title":"Type","type":"string"}},"required":["id","type","point","objects"],"title":"IntersectionConstraint","type":"object"},"LabelObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"target":{"title":"Target","type":"string"},"text":{"title":"Text","type":"string"},"type":{"const":"label","title":"Type","type":"string"}},"required":["id","type","text","target"],"title":"LabelObject","type":"object"},"LineObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Points","type":"array"},"type":{"const":"line","title":"Type","type":"string"}},"required":["id","type","points"],"title":"LineObject","type":"object"},"MedianConstraint":{"additionalProperties":false,"properties":{"from_point":{"title":"From Point","type":"string"},"id":{"title":"Id","type":"string"},"midpoint":{"title":"Midpoint","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"segment":{"title":"Segment","type":"string"},"to_object":{"title":"To Object","type":"string"},"type":{"const":"median","title":"Type","type":"string"}},"required":["id","type","from_point","to_object","midpoint","segment"],"title":"MedianConstraint","type":"object"},"MidpointConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"object":{"title":"Object","type":"string"},"point":{"title":"Point","type":"string"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"midpoint","title":"Type","type":"string"}},"required":["id","type","point","object"],"title":"MidpointConstraint","type":"object"},"NonCollinearConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"maxItems":3,"minItems":3,"prefixItems":[{"type":"string"},{"type":"string"},{"type":"string"}],"title":"Points","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"non_collinear","title":"Type","type":"string"}},"required":["id","type","points"],"title":"NonCollinearConstraint","type":"object"},"ParallelConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"objects":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Objects","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"parallel","title":"Type","type":"string"}},"required":["id","type","objects"],"title":"ParallelConstraint","type":"object"},"PerpendicularConstraint":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"objects":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Objects","type":"array"},"reason":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Reason"},"type":{"const":"perpendicular","title":"Type","type":"string"}},"required":["id","type","objects"],"title":"PerpendicularConstraint","type":"object"},"PointObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"label":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Label"},"type":{"const":"point","title":"Type","type":"string"}},"required":["id","type"],"title":"PointObject","type":"object"},"ProblemDetail":{"additionalProperties":false,"examples":[{"code":"request_validation_failed","detail":"The request payload does not satisfy the API contract.","errors":[{"code":"literal_error","location":["body","mode"],"message":"Input should be 'strict'"}],"instance":"/api/v1/generate","request_id":"tutorboard-contract","status":422,"title":"Request validation failed","type":"urn:geometryos:problem:request-validation"},{"code":"operation_timeout","detail":"The generate operation exceeded its configured time limit.","errors":[],"instance":"/api/v1/generate","request_id":"tutorboard-contract","status":504,"title":"Operation timed out","type":"urn:geometryos:problem:operation-timeout"},{"code":"service_unavailable","detail":"GeometryOS is not ready to accept application requests.","errors":[],"instance":"/api/v1/generate","request_id":"tutorboard-contract","status":503,"title":"Service unavailable","type":"urn:geometryos:problem:service-unavailable"},{"code":"internal_error","detail":"An unexpected internal error occurred.","errors":[],"instance":"/api/v1/generate","request_id":"tutorboard-contract","status":500,"title":"Internal server error","type":"urn:geometryos:problem:internal-error"}],"properties":{"code":{"title":"Code","type":"string"},"detail":{"title":"Detail","type":"string"},"errors":{"items":{"$ref":"#/$defs/ProblemError"},"title":"Errors","type":"array"},"instance":{"title":"Instance","type":"string"},"request_id":{"title":"Request Id","type":"string"},"status":{"title":"Status","type":"integer"},"title":{"title":"Title","type":"string"},"type":{"title":"Type","type":"string"}},"required":["type","title","status","detail","instance","code","request_id"],"title":"ProblemDetail","type":"object"},"ProblemError":{"additionalProperties":false,"properties":{"code":{"title":"Code","type":"string"},"location":{"items":{"anyOf":[{"type":"string"},{"type":"integer"}]},"title":"Location","type":"array"},"message":{"title":"Message","type":"string"}},"required":["code","message"],"title":"ProblemError","type":"object"},"RayObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"start":{"title":"Start","type":"string"},"through":{"title":"Through","type":"string"},"type":{"const":"ray","title":"Type","type":"string"}},"required":["id","type","start","through"],"title":"RayObject","type":"object"},"ReadinessCheck":{"additionalProperties":false,"properties":{"name":{"title":"Name","type":"string"},"status":{"$ref":"#/$defs/CheckStatus"}},"required":["name","status"],"title":"ReadinessCheck","type":"object"},"ReadinessResponse":{"additionalProperties":false,"examples":[{"checks":[{"name":"lifecycle","status":"pass"},{"name":"settings","status":"pass"},{"name":"executor","status":"pass"}],"status":"ready"}],"properties":{"checks":{"items":{"$ref":"#/$defs/ReadinessCheck"},"title":"Checks","type":"array"},"status":{"enum":["ready","not_ready"],"title":"Status","type":"string"}},"required":["status","checks"],"title":"ReadinessResponse","type":"object"},"RenderSvgV1Response":{"additionalProperties":false,"examples":[{"content":"<svg xmlns=\"http://www.w3.org/2000/svg\">...</svg>","media_type":"image/svg+xml","schema_version":"0.2.0"}],"properties":{"content":{"title":"Content","type":"string"},"media_type":{"const":"image/svg+xml","default":"image/svg+xml","title":"Media Type","type":"string"},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"}},"required":["content"],"title":"RenderSvgV1Response","type":"object"},"RenderTikzV1Response":{"additionalProperties":false,"examples":[{"content":"\\begin{tikzpicture}...\\end{tikzpicture}","media_type":"text/x-tex","schema_version":"0.2.0"}],"properties":{"content":{"title":"Content","type":"string"},"media_type":{"const":"text/x-tex","default":"text/x-tex","title":"Media Type","type":"string"},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"}},"required":["content"],"title":"RenderTikzV1Response","type":"object"},"SegmentObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"points":{"maxItems":2,"minItems":2,"prefixItems":[{"type":"string"},{"type":"string"}],"title":"Points","type":"array"},"type":{"const":"segment","title":"Type","type":"string"}},"required":["id","type","points"],"title":"SegmentObject","type":"object"},"TriangleObject":{"additionalProperties":false,"properties":{"id":{"title":"Id","type":"string"},"type":{"const":"triangle","title":"Type","type":"string"},"vertices":{"maxItems":3,"minItems":3,"prefixItems":[{"type":"string"},{"type":"string"},{"type":"string"}],"title":"Vertices","type":"array"}},"required":["id","type","vertices"],"title":"TriangleObject","type":"object"},"ValidateGirV1Response":{"additionalProperties":false,"examples":[{"canonical_gir":{"constraints":[{"id":"c_noncol_abc","points":["A","B","C"],"type":"non_collinear"},{"foot":"H","from_point":"A","id":"c_altitude_a_bc","segment":"AH","to_object":"BC","type":"altitude"}],"construction_steps":[{"action":"construct_triangle","constraints":["c_noncol_abc"],"id":"step_construct_triangle","objects":["A","B","C","BC","ABC"],"reason":"Construct triangle ABC."},{"action":"construct_altitude","constraints":["c_altitude_a_bc"],"id":"step_construct_altitude","objects":["H","AH"],"reason":"Construct altitude from A to BC."}],"metadata":{},"objects":[{"id":"A","label":"A","type":"point"},{"id":"B","label":"B","type":"point"},{"id":"C","label":"C","type":"point"},{"id":"H","label":"H","type":"point"},{"id":"BC","points":["B","C"],"type":"segment"},{"id":"AH","points":["A","H"],"type":"segment"},{"id":"ABC","type":"triangle","vertices":["A","B","C"]}],"scene_type":"2d","schema_version":"0.2.0"},"schema_version":"0.2.0","validation_report":{"is_valid":true,"issues":[],"warnings":[]}}],"properties":{"canonical_gir":{"$ref":"#/$defs/GirScene"},"schema_version":{"const":"0.2.0","default":"0.2.0","title":"Schema Version","type":"string"},"validation_report":{"$ref":"#/$defs/ValidationReport"}},"required":["canonical_gir","validation_report"],"title":"ValidateGirV1Response","type":"object"},"ValidationIssue":{"additionalProperties":false,"properties":{"code":{"title":"Code","type":"string"},"message":{"title":"Message","type":"string"},"path":{"anyOf":[{"type":"string"},{"type":"null"}],"title":"Path"},"severity":{"default":"error","enum":["error","warning"],"title":"Severity","type":"string"}},"required":["code","message"],"title":"ValidationIssue","type":"object"},"ValidationReport":{"additionalProperties":false,"properties":{"is_valid":{"title":"Is Valid","type":"boolean"},"issues":{"items":{"$ref":"#/$defs/ValidationIssue"},"title":"Issues","type":"array"},"warnings":{"items":{"$ref":"#/$defs/ValidationIssue"},"title":"Warnings","type":"array"}},"required":["is_valid"],"title":"ValidationReport","type":"object"}}};
const schema69 = {"additionalProperties":false,"properties":{"code":{"title":"Code","type":"string"},"location":{"items":{"anyOf":[{"type":"string"},{"type":"integer"}]},"title":"Location","type":"array"},"message":{"title":"Message","type":"string"}},"required":["code","message"],"title":"ProblemError","type":"object"};

function validate34(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:tutorboard:geometryos:problem-detail" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate34.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.type === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "type"},message:"must have required property '"+"type"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.title === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "title"},message:"must have required property '"+"title"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.status === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.detail === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "detail"},message:"must have required property '"+"detail"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.instance === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "instance"},message:"must have required property '"+"instance"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.code === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.request_id === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "request_id"},message:"must have required property '"+"request_id"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!((((((((key0 === "code") || (key0 === "detail")) || (key0 === "errors")) || (key0 === "instance")) || (key0 === "request_id")) || (key0 === "status")) || (key0 === "title")) || (key0 === "type"))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.code !== undefined){
if(typeof data.code !== "string"){
const err8 = {instancePath:instancePath+"/code",schemaPath:"#/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.detail !== undefined){
if(typeof data.detail !== "string"){
const err9 = {instancePath:instancePath+"/detail",schemaPath:"#/properties/detail/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.errors !== undefined){
let data2 = data.errors;
if(Array.isArray(data2)){
const len0 = data2.length;
for(let i0=0; i0<len0; i0++){
let data3 = data2[i0];
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
if(data3.code === undefined){
const err10 = {instancePath:instancePath+"/errors/" + i0,schemaPath:"#/$defs/ProblemError/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data3.message === undefined){
const err11 = {instancePath:instancePath+"/errors/" + i0,schemaPath:"#/$defs/ProblemError/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
for(const key1 in data3){
if(!(((key1 === "code") || (key1 === "location")) || (key1 === "message"))){
const err12 = {instancePath:instancePath+"/errors/" + i0,schemaPath:"#/$defs/ProblemError/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data3.code !== undefined){
if(typeof data3.code !== "string"){
const err13 = {instancePath:instancePath+"/errors/" + i0+"/code",schemaPath:"#/$defs/ProblemError/properties/code/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data3.location !== undefined){
let data5 = data3.location;
if(Array.isArray(data5)){
const len1 = data5.length;
for(let i1=0; i1<len1; i1++){
let data6 = data5[i1];
const _errs17 = errors;
let valid7 = false;
const _errs18 = errors;
if(typeof data6 !== "string"){
const err14 = {instancePath:instancePath+"/errors/" + i0+"/location/" + i1,schemaPath:"#/$defs/ProblemError/properties/location/items/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
var _valid0 = _errs18 === errors;
valid7 = valid7 || _valid0;
const _errs20 = errors;
if(!((typeof data6 == "number") && (!(data6 % 1) && !isNaN(data6)))){
const err15 = {instancePath:instancePath+"/errors/" + i0+"/location/" + i1,schemaPath:"#/$defs/ProblemError/properties/location/items/anyOf/1/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
var _valid0 = _errs20 === errors;
valid7 = valid7 || _valid0;
if(!valid7){
const err16 = {instancePath:instancePath+"/errors/" + i0+"/location/" + i1,schemaPath:"#/$defs/ProblemError/properties/location/items/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
else {
errors = _errs17;
if(vErrors !== null){
if(_errs17){
vErrors.length = _errs17;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err17 = {instancePath:instancePath+"/errors/" + i0+"/location",schemaPath:"#/$defs/ProblemError/properties/location/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data3.message !== undefined){
if(typeof data3.message !== "string"){
const err18 = {instancePath:instancePath+"/errors/" + i0+"/message",schemaPath:"#/$defs/ProblemError/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath:instancePath+"/errors/" + i0,schemaPath:"#/$defs/ProblemError/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
}
else {
const err20 = {instancePath:instancePath+"/errors",schemaPath:"#/properties/errors/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.instance !== undefined){
if(typeof data.instance !== "string"){
const err21 = {instancePath:instancePath+"/instance",schemaPath:"#/properties/instance/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.request_id !== undefined){
if(typeof data.request_id !== "string"){
const err22 = {instancePath:instancePath+"/request_id",schemaPath:"#/properties/request_id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.status !== undefined){
let data10 = data.status;
if(!((typeof data10 == "number") && (!(data10 % 1) && !isNaN(data10)))){
const err23 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.title !== undefined){
if(typeof data.title !== "string"){
const err24 = {instancePath:instancePath+"/title",schemaPath:"#/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data.type !== undefined){
if(typeof data.type !== "string"){
const err25 = {instancePath:instancePath+"/type",schemaPath:"#/properties/type/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
else {
const err26 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
validate34.errors = vErrors;
return errors === 0;
}
validate34.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};
