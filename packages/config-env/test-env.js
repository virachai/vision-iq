import { env } from "./dist/index.js";

console.log("✅ Environment validation successful!");
console.log("PORT:", env.PORT);
console.log("NODE_ENV:", env.NODE_ENV);
console.log("POSTGRES_URL:", env.POSTGRES_URL.replace(/:[^:@]+@/, ":****@"));
