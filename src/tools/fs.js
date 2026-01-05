import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

export async function readFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read file ${filePath}: ${error.message}`);
  }
}

export async function writeFile(filePath, content) {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to write file ${filePath}: ${error.message}`);
  }
}

export async function listFiles(pattern = '**/*', ignore = ['node_modules/**', '.git/**']) {
  try {
    return await glob(pattern, { ignore, nodir: true });
  } catch (error) {
    throw new Error(`Failed to list files: ${error.message}`);
  }
}
