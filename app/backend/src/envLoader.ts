// src/envLoader.ts
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

/**
 * Removes byte order mark (BOM) from a buffer.
 * Handles UTF-8, UTF-16 LE, and UTF-16 BE.
 * @param buffer The buffer to strip the BOM from.
 * @returns A buffer without the BOM.
 */
function stripBom(buffer: Buffer): Buffer {
  // UTF-8 BOM: EF BB BF
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    console.log('[envLoader] UTF-8 BOM detected and stripped.');
    return buffer.slice(3);
  }
  // UTF-16 LE BOM: FF FE
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
     console.log('[envLoader] UTF-16 LE BOM detected and stripped.');
    return buffer.slice(2);
  }
   // UTF-16 BE BOM: FE FF
  if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
     console.log('[envLoader] UTF-16 BE BOM detected and stripped.');
    return buffer.slice(2);
  }
  return buffer;
}

/**
 * This script is preloaded to ensure environment variables are loaded before any
 * other application code runs. It uses a custom parser to be robust against
 * file encoding issues (e.g., BOM).
 */
try {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  // Load .env first (base configuration)
  const envPath = path.resolve(__dirname, '..', '.env');
  const envLocalPath = path.resolve(__dirname, '..', '.env.local');

  console.log(`[envLoader] Reading .env file from: ${envPath}`);
  console.log(`[envLoader] Reading .env.local file from: ${envLocalPath}`);

  // Function to load and parse env file
  const loadEnvFile = (filePath: string, fileName: string) => {
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      let fileContent;

      if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
        console.log(`[envLoader] UTF-8 BOM detected in ${fileName}. Decoding as UTF-8.`);
        fileContent = buffer.slice(3).toString('utf8');
      } else if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
        console.log(`[envLoader] UTF-16 LE BOM detected in ${fileName}. Decoding as UTF-16LE.`);
        fileContent = buffer.slice(2).toString('utf16le');
      } else {
        console.log(`[envLoader] No BOM detected in ${fileName}. Assuming UTF-8.`);
        fileContent = buffer.toString('utf8');
      }

      const parsed = dotenv.parse(fileContent);
      console.log(`[envLoader] Parsed ${fileName}:`, parsed);

      for (const key in parsed) {
        if (Object.prototype.hasOwnProperty.call(parsed, key)) {
          process.env[key] = parsed[key];
        }
      }
      console.log(`✅ [envLoader.ts] ${fileName} loaded successfully.`);
      return true;
    } else {
      console.warn(`[envLoader] ${fileName} not found at ${filePath}.`);
      return false;
    }
  };

  // Load .env first (base configuration)
  loadEnvFile(envPath, '.env');

  // Load .env.local second (overrides .env)
  loadEnvFile(envLocalPath, '.env.local');

} catch (e) {
  // In case of a critical error during startup, log it.
  console.error('[envLoader] A critical error occurred during environment variable loading:', e);
  process.exit(1);
}

// A minimal, absolutely safe pre-load script to confirm that the --require flag is working.
console.log('✅ [envLoader.ts] Pre-load script executed successfully.'); 