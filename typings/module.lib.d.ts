declare module 'internal/module' {
    function stripBOM(value: string): string;
}

declare class NodeModule {
    paths: string[]
    _compile(content: string, fileName: string): void
}
