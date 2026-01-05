import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadPersona(personaId) {
    try {
        const filePath = path.join(__dirname, `${personaId}.json`);
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // Fallback to default if not found
        if (personaId !== 'default') {
            console.warn(`Persona ${personaId} not found, loading default.`);
            return loadPersona('default');
        }
        throw new Error(`Critical: Default persona not found at ${filePath}`);
    }
}

export async function listPersonas() {
    try {
        const files = await fs.readdir(__dirname);
        return files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
    } catch (error) {
        return [];
    }
}