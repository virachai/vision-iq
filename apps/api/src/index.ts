import { env } from "@repo/env";
import { log } from "@repo/logger";
import { createServer } from "./server";

const port = env.API_EXPRESS_PORT;
const server = createServer();

server.listen(port, () => {
	log(`api running on ${port}`);
});
