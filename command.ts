import {Chunk, ChunkType} from './chunk';
import {Readable, Transform, Writable} from 'stream';
import {EventEmitter} from 'events';
import * as fs from 'fs';

export interface Ref {
    ref(): void
    unref(): void
}


export interface CommandContext {
    args: string[]
    env: Map<string, string>
    workingDirectory: string
}

// console.log, console.error maintain references to write(), so it must be replaced with a permenant hook
let stderrWrite = process.stderr.write;
let stdoutWrite = process.stdout.write;
process.stderr.write = function() {
    return stderrWrite.apply(this, arguments);
};
process.stdout.write = function() {
    return stdoutWrite.apply(this, arguments);
};

export class Command {
    constructor(private readonly main: () => void) {
    }

    invoke(context: CommandContext, reader: Readable, writer: Writable, ref: Ref) {
        const finalizers: (() => void)[] = [];

        function finalize(code?: number | undefined) {
            for (const finalizer of finalizers) {
                finalizer();
            }
            writer.end(new Chunk(ChunkType.Exit, Buffer.from((code || 0).toString())));
            ref.ref();
        }

        ref.unref();

        // main module
        finalizers.push((mainModule => () => process.mainModule = mainModule)(process.mainModule));

        // arguments
        finalizers.push((argv => () => process.argv = argv)(process.argv));
        process.argv = process.argv.slice(0, 2).concat(context.args);

        // environment variables
        finalizers.push((env => () => process.env = env)(process.env));
        process.env = {};
        for (const [key, value] of context.env) {
            process.env[key] = value;
        }
    
        // working directory
        finalizers.push((workingDirectory => () => process.chdir(workingDirectory))(process.cwd()));
        process.chdir(context.workingDirectory);

        // stdin
        finalizers.push((stdin => () => Object.defineProperty(process, 'stdin', {configurable:true, enumerable:true, get: () => stdin}))(process.stdin));
        const stdin = new CommandStdin(writer, ref);
        Object.defineProperty(process, 'stdin', {configurable:true, enumerable:true, get: () => stdin});
        //process.stdin.end();
        reader.pipe(stdin);//.pipe(process.stdin);
        //finalizers.push(() => stdin.unpipe(process.stdin));

        // stdout
        const stdout = new CommandStdout();
        stdout.pipe(writer, {end:false});
        finalizers.push((write => () => stdoutWrite = write)(stdoutWrite));
        stdoutWrite = stdout.write.bind(stdout);

        // stderr
        const stderr = new CommandStderr();
        stderr.pipe(writer, {end:false});
        finalizers.push((write => () => stderrWrite = write)(stderrWrite));
        stderrWrite = stderr.write.bind(stderr);

        finalizers.push((exit => () => process.exit = exit)(process.exit));
        process.exit = finalize as (code?: number | undefined) => never;
    
        process.once('beforeExit', finalize);
    
        this.main();
    }
}

class CommandStdin extends Transform {
    private isEnded: boolean = false;

    private newListener = (type: string) => {
        switch (type) {
            case 'data':
            case 'end':
                if (!this.isPaused) {
                    this.ref.ref();
                }
        }
    }

    constructor(private readonly writer: Writable, private readonly ref: Ref) {
        super({writableObjectMode:true});
        this.on('newListener', this.newListener);
        this.on('removeListener', type => {
            switch (type) {
                case 'data':
                case 'end':
                    if (!this.listenerCount('data') && !this.listenerCount('end')) {
                        ref.unref();    
                }
            }
        });
        // NodeJS will not flush this buffer
        // a workaround is to send a newline (!) but that clutters the output
        // this.writer.write(new Chunk(ChunkType.Stderr, Buffer.from('\n')));
        this._request();
    }

    pause() {
        this.ref.unref();
        return super.pause();
    }

    resume() {
        if (!this.isEnded) {
            this.ref.ref();
        }
        return super.resume();
    }

    private _request() {
        this.writer.write(new Chunk(ChunkType.StdinStart));
    }

    _flush(callback: Function) {
        this.isEnded = true;
        this.removeListener('newListener', this.newListener);
        this.ref.unref();
        callback();
    }

    _transform(chunk: Chunk, encoding: string, callback: Function) {
        switch (chunk.type) {
            case ChunkType.Stdin:
                callback(null, chunk.data);
                this._request();
                break;
            case ChunkType.StdinEnd:
                callback();
                this.end();
                break;
            case ChunkType.Heartbeat:
                callback();    
                break;
            default:
                callback(new CommandStdin.UnexpectedChunk(chunk.type));
        }
    }
}

namespace CommandStdin {
    export class UnexpectedChunk extends Error {
        constructor(type: ChunkType) {
            super(`Unexpected ${String.fromCharCode(type)} chunk in stdin stream`);
        }
    }
}

class CommandOutput extends Transform {
    constructor(private readonly type: ChunkType) {
        super({readableObjectMode: true});
    }

    _transform(data: Buffer, encoding: string, callback: Function) {
        //console.error('CommandOutput._transform\n');
        callback(null, new Chunk(this.type, data));
    }
}

class CommandStdout extends CommandOutput {
    constructor() {
        super(ChunkType.Stdout);
    }
}

class CommandStderr extends CommandOutput {
    constructor() {
        super(ChunkType.Stderr);
    }
}
