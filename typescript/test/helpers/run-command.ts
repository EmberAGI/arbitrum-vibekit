import { spawn } from "child_process";
import readline from "readline";

export function handleStream(
  stream: NodeJS.ReadableStream,
  tag: string,
  logFn: (message: string) => void,
): void {
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    logFn(`[${tag}] ${line}`);
  });
}

export async function runCommand(
  command: string,
  source: string,
  options = {},
  waitFor?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[${source}] Running: ${command}`);
    const child = spawn(command, { shell: true, ...options });
    let resolved = false;
    const resolveOnce = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    handleStream(child.stdout, source, (line) => {
      console.log(line);
      if (waitFor && line.includes(waitFor)) {
        resolveOnce();
      }
    });

    handleStream(child.stderr, source, (line) => {
      console.error(line);
    });

    child.on("close", (code) => {
      if (waitFor) {
        if (!resolved) {
          reject(
            new Error(
              `[${source}] Command "${command}" closed with code ${code} without emitting waitFor string "${waitFor}"`,
            ),
          );
        }
      } else {
        if (code === 0) {
          resolveOnce();
        } else {
          reject(
            new Error(
              `[${source}] Command "${command}" exited with code ${code}`,
            ),
          );
        }
      }
    });
    child.on("error", (err) => reject(err));
  });
}
