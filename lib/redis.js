import { Redis } from "ioredis";

const redisClient = new Redis({
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  poolSize: 10,
});

redisClient.on("error", (err) =>
  console.error("Redis Client Error:", err.message)
);
redisClient.on("connect", () =>
  console.log("Successfully connected to Redis Cloud.")
);
redisClient.on("reconnecting", () =>
  console.log("Attempting to reconnect to Redis...")
);

export default redisClient;
