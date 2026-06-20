declare module 'sql.js' {
  export class Database {
    constructor(data?: Uint8Array | ArrayBuffer | Buffer);
    run(sql: string, params?: Array<string | number | null>): void;
    prepare(sql: string): Statement;
    export(): Uint8Array;
  }

  export interface Statement {
    bind(params?: Array<string | number | null>): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }

  export interface SqlJsStatic {
    Database: typeof Database;
  }

  export default function initSqlJs(options: { locateFile(file: string): string }): Promise<SqlJsStatic>;
}