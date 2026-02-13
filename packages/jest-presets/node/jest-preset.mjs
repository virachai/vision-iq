/** @type {import('jest').Config} */
const config = {
  roots: ["<rootDir>"],
  preset: "ts-jest",
  testEnvironment: "node",

  transform: {
    "^.+\\.[tj]sx?$": "ts-jest",
  },

  transformIgnorePatterns: [
    "node_modules/(?!((.+/)?(p-retry|is-network-error|@google/genai|is-ip|is-network-error)))",
  ],

  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],

  modulePathIgnorePatterns: [
    "<rootDir>/test/__fixtures__",
    "<rootDir>/node_modules",
    "<rootDir>/dist",
  ],
};

export default config;
