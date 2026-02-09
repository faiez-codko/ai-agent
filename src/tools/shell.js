import { execa } from 'execa';

export async function runCommand(command, args = [], cwd = process.cwd()) {
  try {
    // Timeout set to 2 minutes (120000 ms) to prevent hanging on interactive commands
    const { stdout, stderr } = await execa(command, args, { 
        cwd, 
        shell: true,
        timeout: 120000 
    });
    return { stdout, stderr };
  } catch (error) {
     if (error.timedOut) {
         return { stdout: error.stdout || '', stderr: `Error: Command timed out after 2 minutes. The command might be interactive or hanging.\n${error.stderr || ''}`, error };
     }
     // execa throws on non-zero exit code
    return { stdout: error.stdout, stderr: error.stderr, error };
  }
}
