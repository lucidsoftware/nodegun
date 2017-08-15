import {Reader} from './reader';

export class Chunk {
    constructor(public type: ChunkType, public data: Buffer) {
    }

    serialize() {
        const buffer = Buffer.concat([Buffer.allocUnsafe(5), this.data]);
        buffer.writeUInt32BE(this.data.length, 0);
        buffer.writeInt8(this.type, 4);
        return buffer;
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

export class ChunkReader implements Reader<Buffer> {
    private readonly buffers: Buffer[] = [];
    private bufferSize = 0;

    constructor(private reader: Reader<Chunk>) {
    }

    next(data: Buffer) {
        this.buffers.push(data);
        this.bufferSize += data.length;
        if (this.bufferSize < 5) {
            return;
        }
        const buffer = Buffer.concat(this.buffers);
        let offset;
        for (offset = 0; offset + 5 <= buffer.length; ) {
            const size = buffer.readUInt32BE(offset);
            const type = buffer.readUInt8(offset + 4);
            if (buffer.length < offset + size + 4 + 1) {
                break;
            }
            offset += 4 + 1;
            this.reader.next(new Chunk(type, buffer.slice(offset, offset + size)));
            offset += size;
        }
        if (offset) {
            this.buffers.length = 0;
            this.buffers.push(buffer.slice(offset));
            this.bufferSize = buffer.length - offset;
        }
    }

    end() {
        const buffer = Buffer.concat(this.buffers);
        if (5 < buffer.length) {
            throw new ChunkReader.IncompleteChunkError(buffer.readUInt32BE(0), this.bufferSize - 5);
        } else if (buffer.length) {
            throw new ChunkReader.IncompleteHeaderError(buffer);
        }
        this.reader.end();
    }
}

export class ChunkWriter implements Reader<Chunk> {
    constructor(private writer: Reader<Buffer>) {
    }

    next(chunk: Chunk) {
        this.writer.next(chunk.serialize());
    }

    end() {
        this.writer.end();
    }
}

export namespace ChunkReader {
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
