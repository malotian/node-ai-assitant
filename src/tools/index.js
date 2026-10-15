// Every tool the agent can call. To add one, create a file here and list it below.
const { getCurrentTime } = require("./current-time");
const { getUserProfile } = require("./user-profile");
const { requestLogin } = require("./request-login");

const tools = [getCurrentTime, getUserProfile, requestLogin];

module.exports = { tools };
