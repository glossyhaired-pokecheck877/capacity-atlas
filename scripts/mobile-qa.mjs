import { writeFile } from "node:fs/promises";

const targets = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const target = targets.find(item => item.type === "page");
if (!target) throw new Error("No Chrome page target");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let id = 0;
const pending = new Map();
const networkFailures = [];
const consoleErrors = [];
socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  if (message.method === "Network.loadingFailed") networkFailures.push(message.params);
  if (message.method === "Runtime.exceptionThrown") consoleErrors.push(message.params.exceptionDetails?.text || "exception");
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") consoleErrors.push("console.error");
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  message.error ? reject(new Error(message.error.message)) : resolve(message.result);
});
function send(method, params = {}) {
  const requestId = ++id;
  socket.send(JSON.stringify({ id: requestId, method, params }));
  return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
}
await send("Page.enable");
await send("Runtime.enable");
await send("Network.enable");
await send("Network.clearBrowserCache");
await send("Emulation.setDeviceMetricsOverride", {
  width: 393,
  height: 852,
  deviceScaleFactor: 1,
  mobile: true,
  screenWidth: 393,
  screenHeight: 852
});
await send("Page.navigate", { url: process.env.QA_URL || "http://127.0.0.1:4173" });
await new Promise(resolve => setTimeout(resolve, 3500));
if (process.env.OPEN_SETUP === "1") {
  await send("Runtime.evaluate", { expression: 'document.querySelector("#addAccountButton")?.click()' });
  await new Promise(resolve => setTimeout(resolve, 300));
}
const metrics = await send("Runtime.evaluate", {
  expression: `({innerWidth, innerHeight, clientWidth:document.documentElement.clientWidth, scrollWidth:document.documentElement.scrollWidth, scrollHeight:document.documentElement.scrollHeight, cards:document.querySelectorAll('.account-card').length, errorCards:document.querySelectorAll('.error-state').length})`,
  returnByValue: true
});
const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true });
await writeFile("qa/mobile-393.png", Buffer.from(shot.data, "base64"));
const value = metrics.result.value;
value.connection = (await send("Runtime.evaluate", { expression: 'document.querySelector("#connectionState b")?.textContent', returnByValue: true })).result.value;
value.networkFailures = networkFailures.map(item => ({ errorText: item.errorText, blockedReason: item.blockedReason, corsErrorStatus: item.corsErrorStatus }));
value.consoleErrors = consoleErrors;
console.log(JSON.stringify(value));
socket.close();
