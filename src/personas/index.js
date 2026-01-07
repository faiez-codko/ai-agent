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
        const personas = [];
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                const id = file.replace('.json', '');
                try {
                    const content = await fs.readFile(path.join(__dirname, file), 'utf-8');
                    const data = JSON.parse(content);
                    personas.push({
                        id,
                        name: data.name,
                        description: data.description || ''
                    });
                } catch (e) {
                    personas.push({ id, name: id, description: 'Error loading metadata' });
                }
            }
        }
        return personas;
    } catch (error) {
        return [];
    }
}