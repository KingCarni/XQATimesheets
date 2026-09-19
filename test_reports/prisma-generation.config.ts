import { defineConfig } from "/app/hourops/node_modules/prisma/config.js";

// Schema-only generation. No database connection, URL, credentials or migrations.
export default defineConfig({ schema: "/app/hourops/prisma/schema.prisma" });