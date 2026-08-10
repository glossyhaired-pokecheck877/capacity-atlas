import { createServer } from "./server.js";

const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || "127.0.0.1";

createServer().listen(port, host, () => {
  console.log(`Capacity Atlas Connector listening on http://${host}:${port}`);
});
