import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { loadEnvFile, stdin, stdout } from "node:process";
import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

loadEnvFile(".env.local");

const KEY_LENGTH = 64;
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const ROLES = new Set(["employee", "manager", "admin"]);

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      result[key] = "true";
    } else {
      result[key] = next;
      i += 1;
    }
  }
  return result;
}

function required(args, key) {
  const value = args[key]?.trim();
  if (!value) throw new Error(`Missing --${key}`);
  return value;
}

function scryptAsync(password, salt, keyLength, options) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const key = await scryptAsync(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
  });

  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt}$${key.toString("base64url")}`;
}

async function hiddenQuestion(prompt) {
  if (!stdin.isTTY) {
    const rl = createInterface({ input: stdin, output: stdout });
    const answer = await rl.question(prompt);
    rl.close();
    return answer;
  }

  emitKeypressEvents(stdin);
  stdout.write(prompt);
  stdin.setRawMode(true);

  return await new Promise((resolve, reject) => {
    let value = "";

    function cleanup() {
      stdin.setRawMode(false);
      stdin.off("keypress", onKeypress);
      stdout.write("\n");
    }

    function onKeypress(char, key) {
      if (key?.name === "return" || key?.name === "enter") {
        cleanup();
        resolve(value);
        return;
      }
      if (key?.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Cancelled"));
        return;
      }
      if (key?.name === "backspace") {
        value = value.slice(0, -1);
        return;
      }
      if (char) value += char;
    }

    stdin.on("keypress", onKeypress);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = required(args, "email").toLowerCase();
  const fullName = required(args, "name");
  const role = args.role?.trim() || "employee";
  const employeeCode = args["employee-code"]?.trim() || null;
  const department = args.department?.trim() || null;
  const managerEmail = args["manager-email"]?.trim().toLowerCase() || null;

  if (!ROLES.has(role)) throw new Error("--role must be employee, manager, or admin");
  if (!process.env.DATABASE_URL_UNPOOLED) throw new Error("DATABASE_URL_UNPOOLED is required");

  const password = await hiddenQuestion("Password: ");
  const confirm = await hiddenQuestion("Confirm password: ");
  if (password.length < 12) throw new Error("Password must be at least 12 characters");
  const passwordBytes = Buffer.from(password);
  const confirmBytes = Buffer.from(confirm);
  if (
    passwordBytes.length !== confirmBytes.length ||
    !timingSafeEqual(passwordBytes, confirmBytes)
  ) {
    throw new Error("Passwords did not match");
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL_UNPOOLED });
  const prisma = new PrismaClient({ adapter });
  const passwordHash = await hashPassword(password);

  try {
    const manager = managerEmail
      ? await prisma.users.findUnique({
          where: { email: managerEmail },
          select: { id: true },
        })
      : null;

    if (managerEmail && !manager) throw new Error(`Manager not found: ${managerEmail}`);

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.users.upsert({
        where: { email },
        create: {
          email,
          password_hash: passwordHash,
          role,
          is_active: true,
        },
        update: {
          password_hash: passwordHash,
          role,
          is_active: true,
        },
      });

      await tx.employee_profiles.upsert({
        where: { user_id: createdUser.id },
        create: {
          user_id: createdUser.id,
          full_name: fullName,
          employee_code: employeeCode,
          department,
          manager_user_id: manager?.id ?? null,
          can_approve: role === "manager" || role === "admin",
        },
        update: {
          full_name: fullName,
          employee_code: employeeCode,
          department,
          manager_user_id: manager?.id ?? null,
          can_approve: role === "manager" || role === "admin",
        },
      });

      return createdUser;
    });

    console.log(`Provisioned ${user.email} (${user.role}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
