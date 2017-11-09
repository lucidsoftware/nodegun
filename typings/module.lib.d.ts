declare class NodeModule {
    paths: string[]
    _compile(content: string, fileName: string): void
}
