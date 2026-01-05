import { execa } from 'execa';

export async function runCommand(command, args = [], cwd = process.cwd()) {
  try {
    const { stdout, stderr } = await execa(command, args, { cwd, shell: true });
    return { stdout, stderr };
  } catch (error) {
     // execa throws on non-zero exit code
    return { stdout: error.stdout, stderr: error.stderr, error };
  }
}
