import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

const MEMORY_DIR = path.join(process.cwd(), '.agent', 'memory');

// Ensure memory directory exists
if (!fs.existsSync(MEMORY_DIR)) {
    fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

// Helper to sanitize keys for filenames
const sanitizeKey = (key) => key.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();

const tools = {
    // Save information to long-term memory
    memory_save: async ({ key, content, category = 'general' }) => {
        try {
            const safeKey = sanitizeKey(key);
            const safeCategory = sanitizeKey(category);
            const categoryDir = path.join(MEMORY_DIR, safeCategory);
            
            if (!fs.existsSync(categoryDir)) {
                fs.mkdirSync(categoryDir, { recursive: true });
            }

            const filePath = path.join(categoryDir, `${safeKey}.md`);
            const timestamp = new Date().toISOString();
            
            const fileContent = `---
key: ${key}
category: ${category}
updated_at: ${timestamp}
---

${content}
`;
            fs.writeFileSync(filePath, fileContent);
            return `Memory saved successfully: [${category}] ${key}`;
        } catch (error) {
            return `Error saving memory: ${error.message}`;
        }
    },

    // Read a specific memory by key
    memory_read: async ({ key, category = 'general' }) => {
        try {
            const safeKey = sanitizeKey(key);
            const safeCategory = sanitizeKey(category);
            const filePath = path.join(MEMORY_DIR, safeCategory, `${safeKey}.md`);

            if (!fs.existsSync(filePath)) {
                // Try finding it in any category if not found in specified one
                const categories = fs.readdirSync(MEMORY_DIR).filter(f => fs.statSync(path.join(MEMORY_DIR, f)).isDirectory());
                for (const cat of categories) {
                     const tryPath = path.join(MEMORY_DIR, cat, `${safeKey}.md`);
                     if (fs.existsSync(tryPath)) {
                         const content = fs.readFileSync(tryPath, 'utf8');
                         return `[Found in category: ${cat}]\n${content}`;
                     }
                }
                return `Memory not found: ${key} (checked category '${category}' and all others)`;
            }

            const content = fs.readFileSync(filePath, 'utf8');
            return content;
        } catch (error) {
            return `Error reading memory: ${error.message}`;
        }
    },

    // List all memories (keys)
    memory_list: async ({ category }) => {
        try {
            let files = [];
            
            if (category) {
                 const safeCategory = sanitizeKey(category);
                 const categoryDir = path.join(MEMORY_DIR, safeCategory);
                 if (fs.existsSync(categoryDir)) {
                     files = fs.readdirSync(categoryDir).map(f => `${category}/${f}`);
                 }
            } else {
                // List all recursively
                if (fs.existsSync(MEMORY_DIR)) {
                    const categories = fs.readdirSync(MEMORY_DIR).filter(f => fs.statSync(path.join(MEMORY_DIR, f)).isDirectory());
                    for (const cat of categories) {
                        const catFiles = fs.readdirSync(path.join(MEMORY_DIR, cat)).map(f => `${cat}/${f}`);
                        files = files.concat(catFiles);
                    }
                }
            }
            
            if (files.length === 0) return "No memories found.";
            return `Available Memories:\n${files.map(f => `- ${f.replace('.md', '')}`).join('\n')}`;
        } catch (error) {
            return `Error listing memories: ${error.message}`;
        }
    },

    // Search memories for keywords
    memory_search: async ({ query }) => {
        try {
            const results = [];
            if (!fs.existsSync(MEMORY_DIR)) return "No memories found.";

            const categories = fs.readdirSync(MEMORY_DIR).filter(f => fs.statSync(path.join(MEMORY_DIR, f)).isDirectory());
            
            for (const cat of categories) {
                const catDir = path.join(MEMORY_DIR, cat);
                const files = fs.readdirSync(catDir);
                
                for (const file of files) {
                    const content = fs.readFileSync(path.join(catDir, file), 'utf8');
                    if (content.toLowerCase().includes(query.toLowerCase())) {
                        results.push({
                            key: file.replace('.md', ''),
                            category: cat,
                            preview: content.substring(0, 150).replace(/\n/g, ' ') + '...'
                        });
                    }
                }
            }
            
            if (results.length === 0) return `No memories found matching "${query}".`;
            
            return `Search Results for "${query}":\n` + results.map(r => `- [${r.category}] ${r.key}: ${r.preview}`).join('\n');
        } catch (error) {
            return `Error searching memories: ${error.message}`;
        }
    }
};

export default tools;
