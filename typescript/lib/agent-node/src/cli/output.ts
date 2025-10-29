/**
 * CLI Output Utility
 * Clean, user-friendly terminal output for CLI commands
 * Separate from Logger (which is for diagnostics/debugging)
 */

import ora, { type Ora } from 'ora';
import pc from 'picocolors';

type CliColor = 'cyan' | 'magenta' | 'yellow' | 'blue' | 'green';

const COLOR_FUNCTIONS: Record<CliColor, (value: string) => string> = {
  blue: pc.blue,
  cyan: pc.cyan,
  green: pc.green,
  magenta: pc.magenta,
  yellow: pc.yellow,
};

/**
 * CliOutput provides clean, styled terminal output for user-facing CLI messages.
 * Uses cyan/magenta color scheme with picocolors and ora spinners.
 */
export class CliOutput {
  /**
   * Print a message with optional color styling and automatic markdown parsing
   * Supports:
   * - `code` → inline code with dark cyan background + light cyan text
   * - **bold** or __bold__ → bold text
   * @param message - Message to print (supports markdown syntax)
   * @param color - Optional color ('cyan', 'magenta', 'yellow', 'blue', 'green')
   */
  print(message: string, color?: CliColor): void {
    // Detect terminal color capability
    const supportsTruecolor = /truecolor|24bit/i.test(process.env['COLORTERM'] ?? '');
    const supports256 = /256color/i.test(process.env['TERM'] ?? '') || supportsTruecolor;

    const openCode = (() => {
      if (supportsTruecolor) {
        // Dark teal background + very light cyan text (truecolor)
        return '\x1b[48;2;12;54;66m\x1b[38;2;190;240;255m';
      }
      if (supports256) {
        // 256-color fallback: deep teal bg + bright cyan fg
        return '\x1b[48;5;23m\x1b[38;5;195m';
      }
      // 16-color fallback: dark blue bg + bright white text
      return '\x1b[44m\x1b[97m';
    })();
    const closeCode = '\x1b[0m';

    // If message contains code, colorize text segments around code so styles don't clash
    const hasInlineCode = /`[^`]+`/.test(message);
    const hasBlockCode = /```[\s\S]*?```/.test(message);

    const applyBold = (text: string): string =>
      text.replace(/(\*\*|__)(.+?)\1/g, (_match, _delimiter, captured: string) =>
        pc.bold(captured),
      );

    const colorizeText = (text: string) => (color ? COLOR_FUNCTIONS[color](text) : text);

    if (hasInlineCode || hasBlockCode) {
      // Render triple backtick blocks first
      let rendered = '';
      let idx = 0;
      while (idx < message.length) {
        const blockStart = message.indexOf('```', idx);
        const inlineStart = message.indexOf('`', idx);

        // Decide which token comes next (block vs inline)
        let nextType: 'block' | 'inline' | 'text' = 'text';
        let nextPos = message.length;
        if (blockStart !== -1 && (inlineStart === -1 || blockStart < inlineStart)) {
          nextType = 'block';
          nextPos = blockStart;
        } else if (inlineStart !== -1) {
          nextType = 'inline';
          nextPos = inlineStart;
        }

        // Emit preceding plain text
        const plain = message.slice(idx, nextPos);
        if (plain) rendered += colorizeText(applyBold(plain));
        if (nextType === 'text') break;

        if (nextType === 'block') {
          const end = message.indexOf('```', nextPos + 3);
          if (end === -1) {
            // No closing fence, treat rest as text
            rendered += colorizeText(applyBold(message.slice(nextPos)));
            break;
          }
          // Skip optional language header (text after ``` on the same line)
          const codeStart = message.indexOf('\n', nextPos + 3);
          const code =
            codeStart !== -1 && codeStart < end
              ? message.slice(codeStart + 1, end)
              : message.slice(nextPos + 3, end);
          // Render code block with dark background + light text per line
          const blockStyled = code
            .split('\n')
            .map((line) => `${openCode}${line || ' '}${closeCode}`)
            .join('\n');
          rendered += blockStyled;
          idx = end + 3;
          continue;
        }

        // Inline code
        if (nextType === 'inline') {
          const end = message.indexOf('`', nextPos + 1);
          if (end === -1) {
            // No closing backtick
            rendered += colorizeText(applyBold(message.slice(nextPos)));
            break;
          }
          const code = message.slice(nextPos + 1, end);
          rendered += `${openCode} ${code} ${closeCode}`;
          idx = end + 1;
          continue;
        }
      }

      console.log(rendered);
      return;
    }

    // No code present: simple bold + optional overall color
    const plainFormatted = applyBold(message);
    if (color) {
      console.log(COLOR_FUNCTIONS[color](plainFormatted));
    } else {
      console.log(plainFormatted);
    }
  }

  /**
   * Print a success message with cyan checkmark
   * Supports inline code styling with backticks: `code`
   */
  success(message: string): void {
    // Detect terminal color capability
    const supportsTruecolor = /truecolor|24bit/i.test(process.env['COLORTERM'] ?? '');
    const supports256 = /256color/i.test(process.env['TERM'] ?? '') || supportsTruecolor;

    const openCode = (() => {
      if (supportsTruecolor) {
        // Dark teal background + very light cyan text (truecolor)
        return '\x1b[48;2;12;54;66m\x1b[38;2;190;240;255m';
      }
      if (supports256) {
        // 256-color fallback: deep teal bg + bright cyan fg
        return '\x1b[48;5;23m\x1b[38;5;195m';
      }
      // 16-color fallback: dark blue bg + bright white text
      return '\x1b[44m\x1b[97m';
    })();
    const closeCode = '\x1b[0m';

    // Check for inline code
    const hasInlineCode = /`[^`]+`/.test(message);

    if (hasInlineCode) {
      // Parse and style inline code
      let rendered = '';
      let idx = 0;
      while (idx < message.length) {
        const inlineStart = message.indexOf('`', idx);

        if (inlineStart === -1) {
          // No more code blocks, append remaining text
          rendered += message.slice(idx);
          break;
        }

        // Emit preceding plain text
        const plain = message.slice(idx, inlineStart);
        if (plain) rendered += plain;

        // Find closing backtick
        const end = message.indexOf('`', inlineStart + 1);
        if (end === -1) {
          // No closing backtick, treat rest as plain text
          rendered += message.slice(inlineStart);
          break;
        }

        // Style the code
        const code = message.slice(inlineStart + 1, end);
        rendered += `${openCode} ${code} ${closeCode}`;
        idx = end + 1;
      }

      console.log(`${pc.cyan('✓')} ${rendered}`);
      return;
    }

    // No code present: simple output
    console.log(`${pc.cyan('✓')} ${message}`);
  }

  /**
   * Print an error message with magenta X
   */
  error(message: string): void {
    console.error(`${pc.magenta('✗')} ${message}`);
  }

  /**
   * Print a warning message with yellow indicator
   */
  warn(message: string): void {
    console.warn(`${pc.yellow('⚠')} ${message}`);
  }

  /**
   * Print an info message with blue indicator
   */
  info(message: string): void {
    console.log(`${pc.blue('ℹ')} ${message}`);
  }

  /**
   * Print a blank line
   */
  blank(): void {
    console.log();
  }

  /**
   * Create a spinner for long-running operations
   * @param text - Initial spinner text
   * @returns Ora spinner instance
   */
  spinner(text: string): Ora {
    return ora({
      text,
      color: 'cyan',
    }).start();
  }
}

/**
 * Show the startup effect with styled "AAGENT NODEE" text
 */
export function showStartupEffect(): void {
  // Detect terminal color capability
  const supportsTruecolor = /truecolor|24bit/i.test(process.env['COLORTERM'] ?? '');
  const supports256 = /256color/i.test(process.env['TERM'] ?? '') || supportsTruecolor;

  // Define colors for each styling mode
  let cyanBg: string;
  let cyanText: string;
  let darkPurpleBg: string;
  let lightPurpleText: string;
  let magentaBg: string;
  let magentaText: string;
  const reset = '\x1b[0m';

  if (supportsTruecolor) {
    // 24-bit RGB colors
    cyanBg = '\x1b[48;2;0;188;212m'; // Cyan background
    cyanText = '\x1b[38;2;0;188;212m'; // Cyan text
    darkPurpleBg = '\x1b[48;2;67;7;100m'; // Dark purple background
    lightPurpleText = '\x1b[38;2;200;162;255m'; // Light purple text
    magentaBg = '\x1b[48;2;236;64;122m'; // Magenta background
    magentaText = '\x1b[38;2;236;64;122m'; // Magenta text
  } else if (supports256) {
    // 256-color mode
    cyanBg = '\x1b[48;5;51m'; // Cyan background
    cyanText = '\x1b[38;5;51m'; // Cyan text
    darkPurpleBg = '\x1b[48;5;54m'; // Dark purple background
    lightPurpleText = '\x1b[38;5;183m'; // Light purple text
    magentaBg = '\x1b[48;5;201m'; // Magenta background
    magentaText = '\x1b[38;5;201m'; // Magenta text
  } else {
    // 16-color fallback
    cyanBg = '\x1b[46m'; // Cyan background
    cyanText = '\x1b[96m'; // Bright cyan text
    darkPurpleBg = '\x1b[45m'; // Magenta background (closest to purple)
    lightPurpleText = '\x1b[95m'; // Bright magenta text (closest to light purple)
    magentaBg = '\x1b[45m'; // Magenta background
    magentaText = '\x1b[95m'; // Bright magenta text
  }

  // Build the styled text character by character
  // Text includes spaces for empty boxes: " AAGENT NODEE "
  const text = ' AAGENT NODEE ';
  let styledText = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (i === 0) {
      // First space - empty cyan box
      styledText += `${cyanBg} ${reset}`;
    } else if (i === 1) {
      // 'A' - cyan text on purple background
      styledText += `${darkPurpleBg}${cyanText}${char}${reset}`;
    } else if (i >= 2 && i <= 11) {
      // 'AGENT NODE' - light purple text on dark purple background
      styledText += `${darkPurpleBg}${lightPurpleText}${char}${reset}`;
    } else if (i === 12) {
      // 'E' - magenta text on purple background
      styledText += `${darkPurpleBg}${magentaText}${char}${reset}`;
    } else if (i === 13) {
      // Last space - empty magenta box
      styledText += `${magentaBg} ${reset}`;
    }
  }

  // Center the text based on terminal width
  const terminalWidth = process.stdout.columns || 80;
  const textLength = text.length; // Visual length without ANSI codes
  const padding = Math.max(0, Math.floor((terminalWidth - textLength) / 2));
  const paddingStr = ' '.repeat(padding);

  // Output with blank lines for visual separation
  process.stdout.write('\n');
  process.stdout.write(paddingStr + styledText + '\n');
  process.stdout.write('\n');
}

/**
 * Default CLI output instance for convenient importing
 */
export const cliOutput = new CliOutput();
