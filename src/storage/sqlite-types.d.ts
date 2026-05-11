// Local type shim for `bun:sqlite`. Wyrd targets Node + Bun without
// taking a runtime dep on Bun's type package.
declare module 'bun:sqlite' {
  type Param = string | number | bigint | null | Uint8Array;

  interface Statement<RowT = Record<string, unknown>> {
    run(...args: Param[] | [Record<string, Param>]): { changes: number; lastInsertRowid: number | bigint };
    all(...args: Param[] | [Record<string, Param>]): RowT[];
    get(...args: Param[] | [Record<string, Param>]): RowT | undefined;
    finalize(): void;
  }

  export class Database {
    constructor(
      path: string,
      opts?: { readonly?: boolean; create?: boolean; readwrite?: boolean },
    );
    prepare<R = Record<string, unknown>>(sql: string): Statement<R>;
    exec(sql: string): void;
    query<R = Record<string, unknown>>(sql: string): Statement<R>;
    close(): void;
  }
}
