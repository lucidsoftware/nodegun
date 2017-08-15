import * as fs from 'fs';
import * as net from 'net';
import {ChunkReader, ChunkWriter} from './chunk';
import {Reader} from './reader';
import {CommandDispatcher, InternalCommandWriter} from './command';

export function create() {
    return net.createServer(socket => {
        socket.setNoDelay(true); // doesn't work

        const chunkWriter = new ChunkWriter({
            next(buffer: Buffer) {
                socket.pause();
                socket.write(buffer);
                socket.resume();
            },
            end() {
                socket.end();
            }
        });
        const chunkReader = new ChunkReader(new CommandDispatcher(new InternalCommandWriter(chunkWriter)));

        const endChunkReader = () => chunkReader.end();
        socket.on('data', data => {
            try {
                chunkReader.next(data);
            } catch (e) {
                socket.removeListener('end', endChunkReader);
                console.error(e);
                socket.end();
            }
        });
        socket.on('end', endChunkReader);
        socket.on('error', e => {
            socket.removeListener('end', endChunkReader);
            console.error(e);
            socket.end();
        });
        socket.on('timeout', () => {
            console.error('timeout');
            socket.end();
        });
    });
}

