import { readFile, writeFile, listFiles } from './fs.js';
import { runCommand } from './shell.js';
import fs from 'fs/promises';
import path from 'path';

// Helper to resolve path relative to agent's CWD
const resolvePath = (filePath, cwd) => {
    if (path.isAbsolute(filePath)) return filePath;
    return path.resolve(cwd || process.cwd(), filePath);
};

// Tool Definitions (JSON Schema compatible)
export const toolDefinitions = [
  {
    name: "read_file",
    description: "Read the content of a file. Use this to inspect code or text files.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "The relative or absolute path to the file." }
      },
      required: ["path"]
    }
  },
  {
    name: "write_file",
    description: "Write content to a file. Overwrites existing files or creates new ones.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "The path to the file." },
        content: { type: "string", description: "The content to write." }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "update_file",
    description: "Replace text in a file. Useful for editing large files without rewriting everything.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "The path to the file." },
        search_text: { type: "string", description: "The exact text to search for." },
        replace_text: { type: "string", description: "The new text to replace with." }
      },
      required: ["path", "search_text", "replace_text"]
    }
  },
  {
    name: "delete_file",
    description: "Delete a file. CAUTION: This is destructive.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "The path to the file to delete." }
      },
      required: ["path"]
    }
  },
  {
    name: "run_command",
    description: "Execute a shell command. Use this to list files, run tests, or manage git.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute." }
      },
      required: ["command"]
    }
  },
  {
    name: "list_files",
    description: "List all files in a directory recursively (search).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "The directory path (default: current directory)." },
        ignore: { type: "array", items: { type: "string" }, description: "Glob patterns to ignore." }
      }
    }
  },
  {
    name: "read_dir",
    description: "List files and directories in a specific directory (non-recursive ls).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "The directory path (default: current directory)." }
      }
    }
  },
  {
    name: "change_directory",
    description: "Change the current working directory (cd).",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "The target directory path." }
      },
      required: ["path"]
    }
  }
];

// Tool Implementations
export const tools = {
  read_file: async ({ path: filePath }, { agent }) => {
    const fullPath = resolvePath(filePath, agent?.cwd);
    return await readFile(fullPath);
  },
  write_file: async ({ path: filePath, content }, { agent }) => {
    const fullPath = resolvePath(filePath, agent?.cwd);
    await writeFile(fullPath, content);
    return `Successfully wrote to ${fullPath}`;
  },
  update_file: async ({ path: filePath, search_text, replace_text }, { agent }) => {
    const fullPath = resolvePath(filePath, agent?.cwd);
    try {
        const content = await readFile(fullPath);
        if (content.includes(search_text)) {
            const newContent = content.replace(search_text, replace_text);
            await writeFile(fullPath, newContent);
            return `Successfully updated ${fullPath}`;
        } else {
            return `Error: search_text not found in ${fullPath}`;
        }
    } catch (e) {
        return `Error updating file: ${e.message}`;
    }
  },
  delete_file: async ({ path: filePath }, { confirmCallback, agent }) => {
    const fullPath = resolvePath(filePath, agent?.cwd);
    // Check if file exists first
    try {
        await fs.access(fullPath);
    } catch {
        return `File ${fullPath} does not exist.`;
    }

    if (confirmCallback) {
        const confirmed = await confirmCallback(`Are you sure you want to DELETE ${fullPath}?`);
        if (!confirmed) {
            return "Deletion cancelled by user.";
        }
    }
    
    await fs.unlink(fullPath);
    return `Successfully deleted ${fullPath}`;
  },
  run_command: async ({ command }, { agent }) => {
    const cwd = agent?.cwd || process.cwd();
    // We execute the command in the agent's cwd
    // Note: runCommand in shell.js currently uses execa(command, { shell: true })
    // We need to check if runCommand supports options. 
    // If not, we might need to modify shell.js or prepend `cd ${cwd} &&`.
    // Let's rely on prepend for now to avoid modifying shell.js deeply if it doesn't support options yet.
    // Better: update shell.js to accept options. But for now:
    const cmdWithCwd = `cd "${cwd}" && ${command}`;
    const { stdout, stderr, error } = await runCommand(cmdWithCwd);
    if (error) {
        return `Error: ${stderr || error.message}`;
    }
    return stdout || stderr || "Command executed with no output.";
  },
  list_files: async ({ path: dirPath = '.', ignore = ['node_modules/**', '.git/**'] }, { agent }) => {
    const fullPath = resolvePath(dirPath, agent?.cwd);
    const files = await listFiles(`${fullPath}/**/*`, ignore);
    return files.join('\n');
  },
  read_dir: async ({ path: dirPath = '.' }, { agent }) => {
      const fullPath = resolvePath(dirPath, agent?.cwd);
      try {
          const files = await fs.readdir(fullPath);
          return `Contents of ${fullPath}:\n${files.join('\n')}`;
      } catch (e) {
          return `Error reading directory: ${e.message}`;
      }
  },
  change_directory: async ({ path: dirPath }, { agent }) => {
      const fullPath = resolvePath(dirPath, agent?.cwd);
      try {
          const stats = await fs.stat(fullPath);
          if (!stats.isDirectory()) {
              return `Error: ${fullPath} is not a directory.`;
          }
          if (agent) {
              agent.cwd = fullPath;
          }
          return `Changed directory to ${fullPath}`;
      } catch (e) {
          return `Error changing directory: ${e.message}`;
      }
  }
};
