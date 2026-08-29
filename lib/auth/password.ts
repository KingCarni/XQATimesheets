import "server-only";

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const KEY_LENGTH = 64;
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

function scryptAsync(password: string, salt: string, keyLength: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const key = await scryptAsync(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
  });

  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [scheme, cost, blockSize, parallelization, salt, stored] = hash.split("$");
  if (scheme !== "scrypt" || !cost || !blockSize || !parallelization || !salt || !stored) {
    return false;
  }

  const storedKey = Buffer.from(stored, "base64url");
  const key = await scryptAsync(password, salt, storedKey.length, {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelization),
  });

  return storedKey.length === key.length && timingSafeEqual(storedKey, key);
}
