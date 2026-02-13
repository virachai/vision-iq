const { prisma } = require("@repo/database");
console.log("Prisma client loaded successfully");
prisma
  .$connect()
  .then(() => {
    console.log("Connected to database");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Failed to connect:", err);
    process.exit(1);
  });
