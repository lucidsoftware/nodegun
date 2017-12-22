import {Chunk, ChunkType} from './chunk';
import {PassThrough, Readable, Transform, TransformOptions, Writable} from 'stream';
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

// get-stdin maintains reference to process.stdin, so it must be replaced with a permemant value
class FakeStream extends PassThrough {
    constructor(private readonly options?: TransformOptions) {
        super(options);
    }

    reset() {
        this.removeAllListeners();
        PassThrough.call(this, this.options);
    }
}

export namespace real {
    export const stderrWrite = process.stderr.write.bind(process.stderr);
    export const stdoutWrite = process.stdout.write.bind(process.stdout);
    export const processExit = process.exit.bind(process);
}

// console.log, console.error maintain references to write(), so it must be replaced with a permenant hook
let stderrWrite = real.stderrWrite;
let stdoutWrite = real.stdoutWrite;


let installed = false;
function install() {
    if (installed) {
        return;
    }
    installed = true;

    process.stderr.write = function() {
        return stderrWrite.apply(this, arguments);
    };
    process.stdout.write = function() {
        return stdoutWrite.apply(this, arguments);
    };

    Object.defineProperty(process, 'stderr', {
        configurable: true,
        enumerable: true,
        get: (stderr => () => stderr)(new FakeStream),
    });
    Object.defineProperty(process, 'stdout', {
        configurable: true,
        enumerable: true,
        get: (stdout => () => stdout)(new FakeStream),
    });

    if (process.stdin.end) {
        process.stdin.end();
    }
    Object.defineProperty(process, 'stdin', {
        configurable: true,
        enumerable: true,
        get: (stdin => () => stdin)(new FakeStream),
    });
}

export class Command {
    constructor(private readonly main: () => void) {
        install();
    }

    invoke(context: CommandContext, reader: Readable, writer: Writable, ref: Ref): Promise<number> {
        const finalizers: (() => void)[] = [];

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
        const stdin = new CommandStdin(writer, ref);
        finalizers.push(() => {
            stdin.unpipe(process.stdin);
            (process.stdin as FakeStream).reset();
        });
        reader.pipe(stdin).pipe(process.stdin);
        function stdinNewListener(this: NodeJS.ReadStream, type: string) {
            switch (type) {
                case 'data':
                case 'end':
                    if (!this.isPaused) {
                        ref.ref();
                    }
            }
        }
        function stdinRemoveListener(this: EventEmitter, type: string) {
            switch (type) {
                case 'data':
                case 'end':
                    if (!this.listenerCount('data') && !this.listenerCount('end')) {
                        ref.unref();
                }
            }
        }
        function stdinPause() {
            ref.unref();
        }
        function stdinResume() {
            if (this.listenerCount('data') || this.listenerCount('end')) {
                ref.ref();
            }
        }
        process.stdin
            .on('pause', stdinPause)
            .on('resume', stdinResume)
            .on('removeListener', stdinRemoveListener)
            .on('newListener', stdinNewListener);

        process.stdin.once('end', function(this: EventEmitter) {
            this.removeListener('removeListener', stdinRemoveListener);
            this.removeListener('newListener', stdinNewListener);
            this.removeListener('pause', stdinPause);
            this.removeListener('resume', stdinResume);
            ref.unref();
        });
        process.stdin.on('newListener', function listener(this: NodeJS.ReadStream, type) {
            switch (type) {
                case 'data':
                case 'end':
                    this.removeListener('newListener', listener);
                    stdin.request();
            }
        });

        // stdout
        const stdout = new CommandStdout();
        stdout.pipe(writer, {end:false});
        finalizers.push((write => () => stdoutWrite = write)(stdoutWrite));
        finalizers.push(() => (process.stdout as FakeStream).reset());
        stdoutWrite = stdout.write.bind(stdout);

        // stderr
        const stderr = new CommandStderr();
        stderr.pipe(writer, {end:false});
        finalizers.push((write => () => stderrWrite = write)(stderrWrite));
        finalizers.push(() => (process.stderr as FakeStream).reset());
        stderrWrite = stderr.write.bind(stderr);

        // errors
        function uncaughtExceptionListener(err: Error) {
            console.error(err.stack);
            process.exit(1);
        }
        process.on('uncaughtException', uncaughtExceptionListener);
        finalizers.push(() => process.removeListener('uncaughtException', uncaughtExceptionListener));

        process.nextTick(this.main);
        return new Promise(resolve => {
            function finalize(code?: number | undefined) {
                for (const finalizer of finalizers) {
                    finalizer();
                }
                ref.ref();
                resolve(code || 0);
            }

            finalizers.push((exit => () => process.exit = exit)(process.exit));
            process.exit = finalize as (code?: number | undefined) => never;

            process.on('beforeExit', finalize);
            finalizers.push(() => process.removeListener('beforeExit', finalize));
        });
    }
}

class CommandStdin extends Transform {
    constructor(private readonly writer: Writable, private readonly ref: Ref) {
        super({writableObjectMode:true});
    }

    request() {
        // NodeJS will not flush this buffer
        // a workaround is to send a newline (!) but that clutters the output
        // this.writer.write(new Chunk(ChunkType.Stderr, Buffer.from('\n')));
        try {
            this.writer.write(new Chunk(ChunkType.StdinStart));
        } catch (e) {
        }
    }

    _transform(chunk: Chunk, encoding: string, callback: Function) {
        switch (chunk.type) {
            case ChunkType.Stdin:
                callback(null, chunk.data);
                this.request();
                break;
            case ChunkType.StdinEnd:
                callback();
                this.end();
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
