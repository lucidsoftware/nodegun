import * as net from 'net';
import {ChunkParser, ChunkSerializer} from './chunk';
import {Handler} from './handler';
import {CommandFactory} from './commandfactory';
import {Lock} from './lock';

export class Server {
    public readonly server: net.Server;
    private readonly lock = new Lock();
    private handler: Handler;

    constructor(commandFactory: CommandFactory) {
        this.server = net.createServer(socket => {
            socket.setNoDelay(true);
            socket.unref();
            this.lock.acquire().then(release => {
                const parser = new ChunkParser();
                const serializer = new ChunkSerializer();
                socket.pipe(parser);
                serializer.pipe(socket);
        
                this.handler.handle(parser, serializer);
        
                socket.on('close', release);
                socket.on('timeout', () => {
                    socket.destroy(new Error('timeout'));
                });
            });
        });
        this.handler = new Handler(commandFactory, (process as any).channel || (process as any)._channel || this.server);
        process.on('beforeExit', () => this.server.ref());
        process.on('uncaughtException', err => console.error(err.stack));
    }
}
