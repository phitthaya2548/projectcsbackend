"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const node_http_1 = require("node:http");
const app_1 = require("./app");
const port = Number(process.env.PORT) || 3000;
const server = (0, node_http_1.createServer)(app_1.app);
server.on("error", (err) => {
    if (err?.code === "EADDRINUSE") {
        console.error(`Port ${port} is already in use. Change PORT or kill the process.`);
        process.exit(1);
    }
    throw err;
});
server.listen(port, () => {
    console.log(`Server started on ${port}`);
});
