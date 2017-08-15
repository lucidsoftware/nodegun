import {Chunk, ChunkType} from './chunk';
import {Reader} from './reader';

export type Command = (context: CommandContext, writer: CommandWriter) => Reader<Buffer>|void;

export interface CommandContext {
    args: string[]
    env: Map<string, string>
    workingDirectory: string
}

export class CommandDispatcher implements Reader<Chunk> {
    private args: string[] = [];
    private env: Map<string, string> = new Map();
    private workingDirectory?: string;
    private reader?: Reader<Buffer>|null;

    constructor(private writer: InternalCommandWriter) {
    }

    next(chunk: Chunk) {
        switch (chunk.type) {
            case ChunkType.Argument:
                this.args.push(chunk.data.toString());
                break;
            case ChunkType.Command:
                if (this.workingDirectory == null) {
                    throw new CommandDispatcher.IncompleteCommandError('Missing working directory');
                }
                const command: Command = require(chunk.data.toString());
                const parameters = {args:this.args, env:this.env, workingDirectory:this.workingDirectory};
                this.reader = command(parameters, this.writer) || null;
                if (this.reader) {
                    this.writer.requestIn();
                }
                break;
            case ChunkType.Environment:
                const [name, value] = chunk.data.toString().split('=', 2) as [string, string|undefined];
                if (value != null) {
                    this.env.set(name, value);
                }
                break;
            case ChunkType.Stdin:
                this.writer.requestIn();
                this.reader!.next(chunk.data);
                break;
            case ChunkType.StdinEnd:
                this.reader!.end();
                break;
            case ChunkType.WorkingDirectory:
                this.workingDirectory = chunk.data.toString();
                break;
        }
    }

    end() {
    }
}

export namespace CommandDispatcher {
    export class IncompleteCommandError extends Error {
    }
}

export interface CommandWriter {
    out(data: Buffer): void
    err(data: Buffer): void
    exit(code?: number): void
}

export class InternalCommandWriter implements CommandWriter {
    private exited = false;

    constructor(private writer: Reader<Chunk>) {
    }

    requestIn() {
        if (this.exited) {
            return;
        }
        this.writer.next(new Chunk(ChunkType.StdinStart, Buffer.allocUnsafe(0)));
        // NodeJS will not flush this buffer
        // a workaround is to send a newline (!) but that clutters the output
        // this.writer.next(new Chunk(ChunkType.Stderr, Buffer.from('\n')));
    }

    out(data: Buffer) {
        this.writer.next(new Chunk(ChunkType.Stdout, data));
    }

    err(data: Buffer) {
        this.writer.next(new Chunk(ChunkType.Stderr, data));
    }

    exit(code?: number) {
        this.exited = true;
        this.writer.next(new Chunk(ChunkType.Exit, Buffer.from((code || 0).toString())));
        this.writer.end();
    }
}

export class CollectedReader implements Reader<Buffer> {
    private readonly buffers: Buffer[] = [];
    
    constructor(private f: (data: Buffer) => void) {
    }
    
    next(buffer: Buffer) {
        this.buffers.push(buffer);
    }

    end() {
        this.f(Buffer.concat(this.buffers));
    }
};
