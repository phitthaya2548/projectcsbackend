import "dotenv/config";
import { createServer } from "node:http";
import { app } from "./app.ts";

const port = Number(process.env.PORT) || 3000;

const server = createServer(app);

server.on("error", (err: any) => {
  if (err?.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Change PORT or kill the process.`);
    process.exit(1);
  }
  throw err;
});

server.listen(port, () => {
  console.log(`Server started on ${port}`);
});
