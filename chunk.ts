import {Transform, Writable} from 'stream';

export class Chunk {
    constructor(public type: ChunkType, public data: Buffer = Buffer.allocUnsafe(0)) {
    }
}

export enum ChunkType {
    Argument = 'A'.charCodeAt(0),
    Environment = 'E'.charCodeAt(0),
    Heartbeat = 'H'.charCodeAt(0),
    WorkingDirectory = 'D'.charCodeAt(0),
    Command = 'C'.charCodeAt(0),
    Stdin = '0'.charCodeAt(0),
    Stdout = '1'.charCodeAt(0),
    Stderr = '2'.charCodeAt(0),
    StdinStart = 'S'.charCodeAt(0),
    StdinEnd = '.'.charCodeAt(0),
    Exit = 'X'.charCodeAt(0),
}

export class ChunkParser extends Transform {
    private readonly buffers: Buffer[] = [];
    private bufferSize = 0;
    
    constructor() {
        super({readableObjectMode:true});
    }

    _transform(data: Buffer, encoding: string, callback: Function) {
        this.buffers.push(data);
        this.bufferSize += data.length;
        if (this.bufferSize >= 4 + 1) {
            const buffer = Buffer.concat(this.buffers);
            let offset;
            for (offset = 0; offset + 4 + 1 <= buffer.length; ) {
                const size = buffer.readUInt32BE(offset);
                const type = buffer.readUInt8(offset + 4);
                if (buffer.length < offset + size + 4 + 1) {
                    break;
                }
                offset += 4 + 1;
                this.push(new Chunk(type, buffer.slice(offset, offset + size)));
                offset += size;
            }
            if (offset) {
                this.buffers.length = 0;
                this.buffers.push(buffer.slice(offset));
                this.bufferSize = buffer.length - offset;
            }
        }
        callback();
    }

    _flush(callback: Function) {
        const buffer = Buffer.concat(this.buffers);
        if (4 + 1 < buffer.length) {
            callback(new ChunkParser.IncompleteChunkError(buffer.readUInt32BE(0), this.bufferSize - 5));
        } else if (buffer.length) {
            callback(new ChunkParser.IncompleteHeaderError(buffer));
        } else {
            callback();
        }
    }
}

export namespace ChunkParser {
    export class IncompleteHeaderError extends Error {
        constructor(data: Buffer) {
            super(`Incomplete header: ${data.toString('hex')}`);
        }
    }
    
    export class IncompleteChunkError extends Error {
        constructor(expected: number, actual: number) {
            super(`Incomplete chunk of length ${actual}, expected ${expected}`);
        }
    }
    
}

export class ChunkSerializer extends Transform {
    constructor() {
        super({writableObjectMode:true});
    }

    _transform(chunk: Chunk, encoding: string, callback: Function) {
        const header = Buffer.allocUnsafe(4 + 1);
        header.writeUInt32BE(chunk.data.length, 0);
        header.writeInt8(chunk.type, 4);
        callback(null, Buffer.concat([header, chunk.data]));
    }
}
