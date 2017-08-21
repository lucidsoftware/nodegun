import {Chunk, ChunkType} from './chunk';
import {Command, Ref} from './command';
import {CommandFactory} from './commandfactory';
import {Readable, Writable} from 'stream';

export class Handler {
    constructor(private readonly commandFactory: CommandFactory, private readonly ref: Ref) {   
    }

    handle(reader: Readable, writer: Writable) {
        const args: string[] = [];
        const env = new Map<string, string>();
        let workingDirectory: string | undefined;

        let me = this;
        reader.on('data', function listener(chunk: Chunk) {
            switch (chunk.type) {
                case ChunkType.Argument:
                    args.push(chunk.data.toString());
                    break;
                case ChunkType.Command:
                    if (workingDirectory == null) {
                        throw new MissingWorkingDirectory();
                    }
                    const command = me.commandFactory.create(workingDirectory, chunk.data.toString());
                    this.removeListener('data', listener);
                    command.invoke({args, env, workingDirectory}, reader, writer, me.ref);
                    break;
                case ChunkType.Environment:
                    const [name, value] = chunk.data.toString().split('=', 2) as [string, string|undefined];
                    if (value != null) {
                        env.set(name, value);
                    }
                    break;
                case ChunkType.Heartbeat:
                    break;
                case ChunkType.WorkingDirectory:
                    workingDirectory = chunk.data.toString();
                    break;
                default:
                    throw new Error('Unexpected chunk type');
            }
        });
    }
}

class MissingWorkingDirectory extends Error {
    constructor() {
        super('Missing working directory');
    }
}
