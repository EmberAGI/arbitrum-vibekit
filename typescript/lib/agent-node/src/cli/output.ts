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
 * Show the startup effect with styled "/AGENT NODEΞ" text
 * Returns a Promise that resolves when the animation is complete
 */
export async function showStartupEffect(): Promise<void> {
  // Skip animation in test environments or when no TTY is available
  if (process.env['VITEST'] || !process.stdout.isTTY) {
    return;
  }

  // Animation timing configuration
  const ANIMATION_CONFIG = {
    mode: 'both' as 'positions-only' | 'both', // Option 2: ease both interval and positions
    intervalMs: 25, // Constant for Option 1
    intervalRange: { min: 20, max: 100 }, // For Option 2: eased interval timing
    positionsRange: { start: 30, end: 5 },
  } as const;

  // Easing function for smooth animation transitions
  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3);
  }

  // Calculate progress remapped to only the positions that need resolution
  function getRemappedProgress(
    fixedCount: number,
    totalPositions: number,
    config: typeof ANIMATION_CONFIG,
  ): number {
    const initialFixed = config.positionsRange.start;
    const totalToResolve = totalPositions - initialFixed;
    const resolved = fixedCount - initialFixed;
    return Math.max(0, Math.min(1, resolved / totalToResolve));
  }

  // Calculate how many positions to fix based on animation progress
  function calculatePositionsToFix(
    fixedCount: number,
    totalPositions: number,
    config: typeof ANIMATION_CONFIG,
  ): number {
    const remappedProgress = getRemappedProgress(fixedCount, totalPositions, config);
    const easedProgress = easeOutCubic(remappedProgress);
    const { start, end } = config.positionsRange;
    return Math.max(1, Math.round(start - (start - end) * easedProgress));
  }

  // Calculate interval delay (Option 2: eased interval timing)
  function calculateInterval(
    fixedCount: number,
    totalPositions: number,
    config: typeof ANIMATION_CONFIG,
  ): number {
    if (config.mode === 'positions-only') {
      return config.intervalMs; // Constant interval for Option 1
    }
    // Option 2: eased interval with remapped progress
    const remappedProgress = getRemappedProgress(fixedCount, totalPositions, config);
    const easedProgress = easeOutCubic(remappedProgress);
    const { min, max } = config.intervalRange;
    return Math.round(min + (max - min) * easedProgress);
  }

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

  // Calculate line width same as user input (with -2 margin and max 98)
  const terminalWidth = process.stdout.columns || 82; // 82 so default becomes 80 after margin
  const lineWidth = Math.min(terminalWidth - 2, 98); // Safety margin of 2, max 98

  // Text includes bracket characters: "▐/AGENT NODEΞ▌"
  const centerText = '▐/AGENT NODEΞ▌';
  const centerTextLength = centerText.length;
  const leftPadding = Math.floor((lineWidth - centerTextLength) / 2);

  // Helper function to generate random colors using exact final state colors
  const getRandomColor = () => {
    // Use the exact same colors that appear in the final display
    const colorPairs = [
      { bg: cyanBg, fg: cyanText }, // Cyan on cyan
      { bg: cyanBg, fg: lightPurpleText }, // Light purple on cyan
      { bg: darkPurpleBg, fg: cyanText }, // Cyan on purple (like 'A')
      { bg: darkPurpleBg, fg: lightPurpleText }, // Light purple on purple (like 'GENT NODE')
      { bg: darkPurpleBg, fg: magentaText }, // Magenta on purple (like 'E')
      { bg: magentaBg, fg: magentaText }, // Magenta on magenta
    ];
    const index = Math.floor(Math.random() * colorPairs.length);
    const pair = colorPairs[index]!; // Safe because array is never empty
    return { bg: pair.bg, fg: pair.fg };
  };

  // Helper function to get random printable ASCII character
  const getRandomChar = () => {
    const chars = 'ⴰⴱⴲⴳⴴⴵⴶⴷⴸⴹⴺⴻⴼⴽⴾⴿⵀⵁⵂⵃⵄⵅⵆⵇⵈⵉⵊⵋⵌⵍⵎⵏⵐⵑⵒⵓⵔⵕⵖⵗⵘⵙⵚⵛⵜⵝⵞⵟⵠⵡⵢⵣⵤⵥⵦⵧⵯ';
    return chars[Math.floor(Math.random() * chars.length)];
  };

  // Track which positions are fixed across all three lines
  const totalPositions = lineWidth * 3; // Three full lines
  // Initialize with random N positions already fixed
  const initialFixedCount = Math.min(ANIMATION_CONFIG.positionsRange.start, totalPositions);
  const fixed = new Array(totalPositions).fill(false);
  // Randomly select which positions to pre-fix using Fisher-Yates shuffle
  const allIndices = Array.from({ length: totalPositions }, (_, i) => i);
  for (let i = allIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allIndices[i], allIndices[j]] = [allIndices[j]!, allIndices[i]!];
  }
  const preFixedIndices = allIndices.slice(0, initialFixedCount);
  preFixedIndices.forEach((i) => {
    fixed[i] = true;
  });
  let fixedCount = initialFixedCount;

  // Function to get the final character and style for a given position
  const getFinalCharAndStyle = (lineIndex: number, charIndex: number) => {
    if (lineIndex === 1) {
      // Middle line with centered "AGENT NODE"
      if (charIndex < leftPadding || charIndex >= leftPadding + centerTextLength) {
        // Padding spaces with no background
        return ` `;
      }
      // Character from centerText
      const textIndex = charIndex - leftPadding;
      const char = centerText[textIndex];

      if (textIndex === 0) {
        // First character '▐' - cyan text with no background
        return `${cyanText}${char}${reset}`;
      } else if (textIndex === 1) {
        // '/' - cyan text on purple background
        return `${darkPurpleBg}${cyanText}${char}${reset}`;
      } else if (textIndex >= 2 && textIndex <= 11) {
        // 'AGENT NODE' - bold light purple text on dark purple background
        return `${darkPurpleBg}\x1b[1m${lightPurpleText}${char}${reset}`;
      } else if (textIndex === 12) {
        // 'Ξ' - magenta text on purple background
        return `${darkPurpleBg}${magentaText}${char}${reset}`;
      } else if (textIndex === 13) {
        // Last character '▌' - magenta text with no background
        return `${magentaText}${char}${reset}`;
      }
    }
    // Top and bottom lines - empty with no background
    return ` `;
  };

  // Function to build all three lines
  const buildFrame = () => {
    const lines = [];
    for (let lineIndex = 0; lineIndex < 3; lineIndex++) {
      let line = '';
      for (let charIndex = 0; charIndex < lineWidth; charIndex++) {
        const position = lineIndex * lineWidth + charIndex;
        if (fixed[position]) {
          // Show correct styling for fixed positions
          line += getFinalCharAndStyle(lineIndex, charIndex);
        } else {
          // Random colors and characters for unfixed positions
          const colors = getRandomColor();
          const displayChar = getRandomChar();
          line += `${colors.bg}${colors.fg}${displayChar}${reset}`;
        }
      }
      lines.push(line);
    }
    return lines;
  };

  // Wrap animation in a Promise
  return new Promise<void>((resolve) => {
    // Initial display of three lines
    const initialLines = buildFrame();
    initialLines.forEach((line) => {
      process.stdout.write(line + '\n');
    });

    // Recursive animation function with dynamic interval timing
    const animate = (): void => {
      // Move cursor up 3 lines to overwrite previous frame
      process.stdout.write('\x1b[3A');

      // Build and display current frame (3 lines)
      const lines = buildFrame();
      lines.forEach((line) => {
        // Clear line and display new content
        process.stdout.write('\x1b[2K\r' + line + '\n');
      });

      // Fix positions based on eased progress
      const unfixedIndices = [];
      for (let i = 0; i < totalPositions; i++) {
        if (!fixed[i]) unfixedIndices.push(i);
      }

      if (unfixedIndices.length > 0) {
        // Calculate positions to fix based on eased progress
        const toFixCount = Math.min(
          unfixedIndices.length,
          calculatePositionsToFix(fixedCount, totalPositions, ANIMATION_CONFIG),
        );
        for (let i = 0; i < toFixCount; i++) {
          const randomIndex = Math.floor(Math.random() * unfixedIndices.length);
          const positionToFix = unfixedIndices[randomIndex];
          if (positionToFix !== undefined) {
            fixed[positionToFix] = true;
            fixedCount++;
            unfixedIndices.splice(randomIndex, 1);
          }
        }
      }

      // Check if all positions are fixed
      if (fixedCount >= totalPositions) {
        // Move cursor up to overwrite glitched lines
        process.stdout.write('\x1b[3A');

        // Final render with correct styling
        for (let lineIndex = 0; lineIndex < 3; lineIndex++) {
          let line = '';
          for (let charIndex = 0; charIndex < lineWidth; charIndex++) {
            line += getFinalCharAndStyle(lineIndex, charIndex);
          }
          process.stdout.write('\x1b[2K\r' + line + '\n');
        }

        // Add blank line after for spacing
        process.stdout.write('\n');

        // Resolve the Promise when animation is complete
        resolve();
      } else {
        // Schedule next frame with dynamic interval based on progress
        const nextDelay = calculateInterval(fixedCount, totalPositions, ANIMATION_CONFIG);
        setTimeout(animate, nextDelay);
      }
    };

    // Start animation with initial delay
    const initialDelay = calculateInterval(fixedCount, totalPositions, ANIMATION_CONFIG);
    setTimeout(animate, initialDelay);
  });
}

/**
 * Default CLI output instance for convenient importing
 */
export const cliOutput = new CliOutput();
