import { loadEnvFile } from "node:process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

loadEnvFile(".env.local");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

await prisma.platforms.createMany({
  data: [
    { name: "Windows", sort_order: 10 },
    { name: "macOS", sort_order: 20 },
    { name: "iOS", sort_order: 30 },
    { name: "Android", sort_order: 40 },
    { name: "Web", sort_order: 50 },
    { name: "PlayStation", sort_order: 60 },
    { name: "Xbox", sort_order: 70 },
    { name: "Nintendo Switch", sort_order: 80 },
  ],
  skipDuplicates: true,
});

await prisma.activity_types.createMany({
  data: [
    { name: "Functional Testing", category: "testing", is_billable: true, sort_order: 10 },
    { name: "Regression Testing", category: "testing", is_billable: true, sort_order: 20 },
    { name: "Test Plan Creation", category: "planning", is_billable: true, sort_order: 30 },
    { name: "Test Case Writing", category: "planning", is_billable: true, sort_order: 40 },
    { name: "Bug Verification", category: "testing", is_billable: true, sort_order: 50 },
    { name: "Exploratory Testing", category: "testing", is_billable: true, sort_order: 60 },
    { name: "Automation", category: "engineering", is_billable: true, sort_order: 70 },
    { name: "Meeting", category: "overhead", sort_order: 80 },
    { name: "Documentation", category: "overhead", sort_order: 90 },
    { name: "Training", category: "overhead", sort_order: 100 },
    { name: "Vacation", category: "pto", is_pto: true, sort_order: 200 },
    { name: "Sick Leave", category: "pto", is_pto: true, sort_order: 210 },
    { name: "Statutory Holiday", category: "pto", is_pto: true, sort_order: 220 },
    { name: "Unpaid Leave", category: "pto", is_pto: true, sort_order: 230 },
  ],
  skipDuplicates: true,
});

await prisma.projects.createMany({
  data: [
    {
      code: "ELEC",
      name: "Electrum",
      client_name: "Acme Interactive",
      requires_platform: true,
      color_token: "blue",
    },
    {
      code: "APOL",
      name: "Apollo",
      client_name: "Helios Studios",
      requires_platform: true,
      color_token: "violet",
    },
    {
      code: "INT",
      name: "Internal",
      requires_platform: false,
      color_token: "slate",
    },
  ],
  skipDuplicates: true,
});

await prisma.$disconnect();
