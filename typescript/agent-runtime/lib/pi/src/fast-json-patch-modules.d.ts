declare module 'fast-json-patch/module/core.mjs' {
  export function applyPatch<T>(
    document: T,
    patch: ReadonlyArray<Record<string, unknown>>,
    validateOperation?: boolean,
    mutateDocument?: boolean,
    banPrototypeModifications?: boolean,
  ): {
    newDocument: T;
  };
}

declare module 'fast-json-patch/module/duplex.mjs' {
  export function compare(
    tree1: unknown,
    tree2: unknown,
    invertible?: boolean,
  ): Array<Record<string, unknown>>;
}
