import fs from 'fs/promises';
import path from 'path';
import cron from 'node-cron';
import { runCommand } from './shell.js';

const SCHEDULE_FILE = path.join(process.cwd(), '.agent', 'scheduled_tasks.json');
const scheduledTasks = new Map();

function createTaskJob(taskId, expr, command, cwd) {
    return cron.schedule(expr, async () => {
        const cmdWithCwd = `cd "${cwd}" && ${command}`;
        const { stdout, stderr, error } = await runCommand(cmdWithCwd);
        if (error) {
            console.error(`Scheduled task ${taskId} error:`, error);
        } else if (stdout || stderr) {
            console.log(`Scheduled task ${taskId} output:`, stdout || stderr);
        }
    });
}

async function loadScheduledTasksFromDisk() {
    try {
        const data = await fs.readFile(SCHEDULE_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed)) return [];
        return parsed;
    } catch {
        return [];
    }
}

async function persistScheduledTasks() {
    const data = [];
    for (const [id, task] of scheduledTasks.entries()) {
        data.push({
            id,
            cron_expression: task.cron_expression,
            command: task.command,
            cwd: task.cwd
        });
    }
    await fs.mkdir(path.dirname(SCHEDULE_FILE), { recursive: true });
    await fs.writeFile(SCHEDULE_FILE, JSON.stringify(data, null, 2));
}

async function initScheduledTasks() {
    const tasks = await loadScheduledTasksFromDisk();
    for (const t of tasks) {
        if (!t || !t.id || !t.cron_expression || !t.command) continue;
        if (!cron.validate(t.cron_expression)) continue;
        if (scheduledTasks.has(t.id)) continue;
        const cwd = t.cwd || process.cwd();
        const job = createTaskJob(t.id, t.cron_expression, t.command, cwd);
        scheduledTasks.set(t.id, {
            job,
            command: t.command,
            cron_expression: t.cron_expression,
            cwd
        });
    }
}

await initScheduledTasks().catch(e => {
    console.error('Failed to restore scheduled tasks:', e);
});

export const schedulerToolDefinitions = [
  {
    name: "schedule_task",
    description: "Schedule a shell command to run periodically using a cron expression.",
    parameters: {
      type: "object",
      properties: {
        cron_expression: { type: "string", description: "Cron expression, for example '0 * * * *'." },
        command: { type: "string", description: "Shell command to execute (bash, bat, node, python, etc.)." },
        id: { type: "string", description: "Optional identifier for this scheduled task." }
      },
      required: ["cron_expression", "command"]
    }
  },
  {
    name: "list_scheduled_tasks",
    description: "List all currently scheduled tasks created by the agent.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "cancel_scheduled_task",
    description: "Cancel a previously scheduled task by its identifier.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Identifier of the scheduled task to cancel." }
      },
      required: ["id"]
    }
  }
];

export const schedulerTools = {
  schedule_task: async ({ cron_expression, command, id }, { agent, confirmCallback }) => {
    const expr = cron_expression;
    if (!cron.validate(expr)) {
        return `Invalid cron expression: ${expr}`;
    }
    const baseId = id && typeof id === 'string' ? id : null;
    const taskId = baseId && !scheduledTasks.has(baseId)
        ? baseId
        : `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (scheduledTasks.has(taskId)) {
        return `Task with id ${taskId} already exists.`;
    }
    const cwd = agent?.cwd || process.cwd();
    if (agent?.safeMode) {
        if (!confirmCallback) return "Error: Safe Mode enabled but no confirmation callback provided.";
        const approved = await confirmCallback(`[SAFE MODE] Schedule command?\n${command}\nCron: ${expr}`);
        if (!approved) return "Task scheduling cancelled by user.";
    }
    const job = createTaskJob(taskId, expr, command, cwd);
    scheduledTasks.set(taskId, { job, command, cron_expression: expr, cwd });
    await persistScheduledTasks();
    return `Scheduled task ${taskId} with cron "${expr}" for command "${command}".`;
  },
  list_scheduled_tasks: async () => {
    if (scheduledTasks.size === 0) {
        return "No scheduled tasks.";
    }
    const lines = [];
    for (const [id, task] of scheduledTasks.entries()) {
        lines.push(`${id} | cron: ${task.cron_expression} | command: ${task.command} | cwd: ${task.cwd}`);
    }
    return lines.join('\n');
  },
  cancel_scheduled_task: async ({ id }) => {
    const task = scheduledTasks.get(id);
    if (!task) {
        return `Task ${id} not found.`;
    }
    task.job.stop();
    scheduledTasks.delete(id);
    await persistScheduledTasks();
    return `Cancelled scheduled task ${id}.`;
  }
};

